/**
 * Writes explicit app records for every workspace that existed before the app
 * system, and marks them onboarded as e-commerce.
 *
 * Why this exists
 * ---------------
 * When apps shipped, "this workspace has no app records" was read as "give it
 * everything", so existing customers kept working without anyone having to
 * run anything. That was right for them and wrong for everyone after them: a
 * coaching centre signing up was handed Orders, Fulfilment and Customers it
 * will never use, because a brand-new workspace has no records either.
 *
 * One sentence can't mean both "grandfathered" and "hasn't chosen yet". This
 * script resolves it by making the grandfathered case explicit — after it
 * runs, an absent record has exactly one meaning, and that meaning is "show
 * them the onboarding wizard".
 *
 * What it does per existing workspace:
 *   - installs core + every commerce app (exactly what they can see today)
 *   - sets onboarding.completed = true, businessType = "ecommerce"
 *
 * So nothing changes for Sukirti, Dorangi or anyone else already running.
 *
 * Safety
 * ------
 * - Dry run by default. Pass --apply to write.
 * - Idempotent: workspaces that already have app records are left alone.
 * - Never removes an app; only adds.
 *
 *   node scripts/migrate-grandfather-apps.js            # report only
 *   node scripts/migrate-grandfather-apps.js --apply    # write
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

import { Company } from "../src/models/company.model.js";
import { OrgApp } from "../src/models/org-app.model.js";
import { COMMERCE_APP_SLUGS } from "../src/config/app-registry.js";

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

  const companies = await Company.find({}).select("name onboarding").lean();
  const slugs = ["core", ...COMMERCE_APP_SLUGS];

  let grandfathered = 0;
  let alreadyDone = 0;

  for (const company of companies) {
    const existing = await OrgApp.countDocuments({ companyId: company._id });

    if (existing > 0 || company.onboarding?.completed) {
      alreadyDone += 1;
      console.log(`  skip   ${company.name} — already has app records`);
      continue;
    }

    grandfathered += 1;
    console.log(`  ${APPLY ? "write " : "would "} ${company.name} — ${slugs.length} apps, marked as ecommerce`);

    if (!APPLY) continue;

    await OrgApp.bulkWrite(
      slugs.map((slug) => ({
        updateOne: {
          filter: { companyId: company._id, appSlug: slug },
          update: {
            $setOnInsert: {
              companyId: company._id,
              appSlug: slug,
              status: "installed",
              settings: {},
              installedAt: new Date(),
            },
          },
          upsert: true,
        },
      })),
    );

    await Company.findByIdAndUpdate(company._id, {
      $set: {
        "onboarding.completed": true,
        "onboarding.businessType": "ecommerce",
        "onboarding.completedAt": new Date(),
      },
    });
  }

  console.log("");
  console.log(`Workspaces total:        ${companies.length}`);
  console.log(`${APPLY ? "Grandfathered" : "To grandfather"}:  ${grandfathered}`);
  console.log(`Already had records:     ${alreadyDone}`);

  if (!APPLY && grandfathered) console.log("\nRe-run with --apply to commit these changes.");
  console.log("");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("\nMigration failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
