/**
 * Converts every `companyId` / `channelId` that is stored as a STRING into a
 * real ObjectId, across every collection that has one.
 *
 * Why this exists
 * ---------------
 * These two fields were declared `Schema.Types.Mixed`, so the same id landed
 * in the database as a plain string on some writes and as an ObjectId on
 * others, depending on which code path created the row. A bare equality
 * filter then matches only one of the two forms and silently returns zero
 * rows — never an error, just missing data. That bug has already been found
 * and patched in four separate places (getChannelForSync, getOrdersInRange,
 * getSavedCommerceData, and the Reports channel filter), each time by adding
 * a defensive `$in: [string, ObjectId]` filter.
 *
 * This script removes the cause rather than adding a fifth patch. Once the
 * data is uniform and the schemas declare ObjectId (already done), Mongoose
 * casts query values automatically and the whole bug class is gone.
 *
 * Safety
 * ------
 * - Dry run by default. Pass --apply to actually write.
 * - Idempotent: re-running finds nothing left to do.
 * - Only touches strings that are valid 24-char hex ObjectIds. Anything else
 *   is reported and left alone rather than guessed at.
 * - The defensive `$in` filters already in the code keep working either way,
 *   so this can be run before or after a deploy without a coordinated cutover.
 *
 *   node scripts/migrate-normalize-ids.js            # report only
 *   node scripts/migrate-normalize-ids.js --apply    # convert
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const FIELDS = ["companyId", "channelId"];
const HEX_24 = /^[0-9a-fA-F]{24}$/;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set — nothing to migrate against.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`\nConnected to "${db.databaseName}"`);
  console.log(APPLY ? "Mode: APPLY (writing changes)\n" : "Mode: DRY RUN (no writes — pass --apply to commit)\n");

  const collections = await db.listCollections().toArray();
  const rows = [];
  let totalConverted = 0;
  let totalUnconvertible = 0;

  for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    const collection = db.collection(name);

    for (const field of FIELDS) {
      const convertible = await collection.countDocuments({ [field]: { $type: "string", $regex: HEX_24 } });
      const unconvertible = await collection.countDocuments({ [field]: { $type: "string", $not: HEX_24 } });

      if (!convertible && !unconvertible) continue;

      if (convertible && APPLY) {
        await collection.updateMany(
          { [field]: { $type: "string", $regex: HEX_24 } },
          [{ $set: { [field]: { $toObjectId: `$${field}` } } }],
        );
      }

      rows.push({ collection: name, field, convertible, unconvertible });
      totalConverted += convertible;
      totalUnconvertible += unconvertible;
    }
  }

  if (!rows.length) {
    console.log("Nothing to do — every companyId/channelId is already an ObjectId.\n");
  } else {
    const pad = (s, n) => String(s).padEnd(n);
    console.log(`${pad("COLLECTION", 34)}${pad("FIELD", 12)}${pad(APPLY ? "CONVERTED" : "TO CONVERT", 13)}SKIPPED`);
    console.log("-".repeat(70));
    for (const row of rows) {
      console.log(
        pad(row.collection, 34) + pad(row.field, 12) + pad(row.convertible, 13) +
        (row.unconvertible ? `${row.unconvertible}  ← not valid ObjectIds` : "0"),
      );
    }
    console.log("-".repeat(70));
    console.log(`${APPLY ? "Converted" : "Would convert"}: ${totalConverted} value(s)`);
    if (totalUnconvertible) {
      console.log(
        `Left alone: ${totalUnconvertible} value(s) that aren't valid ObjectIds — ` +
        "inspect these by hand before assuming they're safe to drop.",
      );
    }
    console.log("");
  }

  if (!APPLY && totalConverted) {
    console.log("Re-run with --apply to commit these changes.\n");
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("\nMigration failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
