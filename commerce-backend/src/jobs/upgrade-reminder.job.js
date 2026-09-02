import { isMongoConnected } from "../config/database.js";
import { Company } from "../models/company.model.js";
import { memory } from "../repositories/memory-store.js";
import { sendEmail } from "../utils/mailer.js";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function alreadySentToday(sentAt) {
  if (!sentAt) return false;
  return new Date(sentAt).toDateString() === new Date().toDateString();
}

// Runs once daily (see cron.routes.js / jobs/scheduler.js) — the OTHER
// place trial expiry gets noticed is chargeWalletForFulfillment
// (wallet.repo.js), fired by real order activity; this catches companies
// that aren't actively fulfilling orders, which that path would never see.
export async function runUpgradeReminderJob() {
  console.log("[Job] Running trial-upgrade reminder check...");

  const cutoff = new Date(Date.now() + THREE_DAYS_MS);
  let companies = [];

  try {
    if (isMongoConnected()) {
      companies = await Company.find({
        "subscription.status": "trialing",
        "subscription.trialEndsAt": { $lte: cutoff },
      }).lean();
    } else {
      companies = [...memory.companies.values()].filter(
        (c) => c.subscription?.status === "trialing" && c.subscription?.trialEndsAt && new Date(c.subscription.trialEndsAt) <= cutoff,
      );
    }

    for (const company of companies) {
      if (alreadySentToday(company.subscription?.lastUpgradeReminderSentAt)) continue;
      if (!company.email) continue;

      const expired = new Date(company.subscription.trialEndsAt) < new Date();
      const subject = expired ? "Your Booster trial has ended" : "Your Booster trial is ending soon";
      const html = `<p>Hi ${company.name},</p><p>${expired ? "Your trial period has ended." : "Your trial period is ending soon."} Upgrade your plan to keep full access — you can do this any time from Settings &rarr; Plan &amp; Billing.</p>`;

      try {
        await sendEmail({ to: company.email, subject, html });
        if (isMongoConnected()) {
          await Company.findByIdAndUpdate(company._id, { $set: { "subscription.lastUpgradeReminderSentAt": new Date() } });
        } else {
          company.subscription.lastUpgradeReminderSentAt = new Date().toISOString();
        }
      } catch (err) {
        console.warn(`[Job] Upgrade reminder email failed for company ${company._id}:`, err.message);
      }
    }
  } catch (error) {
    console.error("[Job] Upgrade reminder job failed:", error.message);
  }
}
