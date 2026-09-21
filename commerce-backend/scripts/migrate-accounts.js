/**
 * Backfills the Account collection from existing User (membership) rows, so
 * one person has one identity and one password across every workspace they
 * belong to.
 *
 * Why this exists
 * ---------------
 * "One login, many workspaces" was emulated by duplicating the whole User row
 * per workspace with the bcrypt hash copied across (createAdditionalCompany in
 * repositories/store.js). So a person with three workspaces had three separate
 * passwords that merely happened to start out identical — change one and the
 * other two silently kept the old value.
 *
 * This creates one Account per distinct email and points every matching User
 * row at it. User keeps its own `passwordHash` afterwards: auth reads Account
 * first and falls back to the User row, so the system works correctly before
 * this script runs, while it runs, and after — no coordinated cutover, and
 * rollback is just ignoring the Account collection again.
 *
 * Safety
 * ------
 * - Dry run by default. Pass --apply to actually write.
 * - Idempotent: existing Accounts are reused, never duplicated.
 * - Picks the password hash from the most recently updated membership, which
 *   is the closest thing to "the password they actually use now".
 *
 *   node scripts/migrate-accounts.js            # report only
 *   node scripts/migrate-accounts.js --apply    # backfill
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

import { Account } from "../src/models/account.model.js";
import { User } from "../src/models/user.model.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set — nothing to migrate against.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`\nConnected to "${mongoose.connection.db.databaseName}"`);
  console.log(APPLY ? "Mode: APPLY (writing changes)\n" : "Mode: DRY RUN (no writes — pass --apply to commit)\n");

  // Newest membership last, so the hash we keep is the most recently updated one.
  const memberships = await User.find({}).select("+passwordHash").sort({ updatedAt: 1 }).lean();

  const byEmail = new Map();
  for (const member of memberships) {
    const email = String(member.email || "").trim().toLowerCase();
    if (!email) continue;
    const entry = byEmail.get(email) || { email, memberships: [], name: member.name, passwordHash: null };
    entry.memberships.push(member);
    if (member.passwordHash) {
      entry.passwordHash = member.passwordHash;
      entry.name = member.name || entry.name;
    }
    byEmail.set(email, entry);
  }

  let created = 0;
  let reused = 0;
  let linked = 0;
  let skipped = 0;
  const multiWorkspace = [];

  for (const entry of byEmail.values()) {
    if (!entry.passwordHash) {
      skipped += 1;
      console.log(`  skip  ${entry.email} — no password hash on any membership`);
      continue;
    }

    if (entry.memberships.length > 1) {
      multiWorkspace.push({ email: entry.email, count: entry.memberships.length });
    }

    let account = await Account.findOne({ email: entry.email }).lean();

    if (account) {
      reused += 1;
    } else if (APPLY) {
      account = (await Account.create({
        email: entry.email,
        name: entry.name || entry.email,
        passwordHash: entry.passwordHash,
        status: "active",
      })).toObject();
      created += 1;
    } else {
      created += 1;
      account = { _id: "(new)" };
    }

    const unlinked = entry.memberships.filter((m) => !m.accountId);
    if (unlinked.length && APPLY) {
      await User.updateMany(
        { _id: { $in: unlinked.map((m) => m._id) } },
        { $set: { accountId: account._id } },
      );
    }
    linked += unlinked.length;
  }

  console.log("");
  console.log(`Distinct people:        ${byEmail.size}`);
  console.log(`Accounts ${APPLY ? "created" : "to create"}:      ${created}`);
  console.log(`Accounts already there: ${reused}`);
  console.log(`Memberships ${APPLY ? "linked" : "to link"}:   ${linked}`);
  if (skipped) console.log(`Skipped (no password):  ${skipped}`);

  if (multiWorkspace.length) {
    console.log(`\nPeople in more than one workspace (these are the ones the split actually fixes):`);
    for (const row of multiWorkspace) {
      console.log(`  ${row.email} — ${row.count} workspaces`);
    }
  }

  if (!APPLY) console.log("\nRe-run with --apply to commit these changes.");
  console.log("");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("\nMigration failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
