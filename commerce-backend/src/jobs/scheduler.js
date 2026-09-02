import cron from "node-cron";
import { runWarehouseSyncJob } from "./warehouse-sync.job.js";
import { runTrackingUpdateJob } from "./tracking-update.job.js";
import { runTokenRefreshJob } from "./token-refresh.job.js";
import { runShopifySyncJob } from "./shopify-sync.job.js";
import { runMetaAdsSyncJob } from "./meta-ads-sync.job.js";
import { runUpgradeReminderJob } from "./upgrade-reminder.job.js";

/**
 * Initializes and schedules all OMS background automation jobs.
 */
export function startScheduler() {
  console.log("[Scheduler] Initializing OMS background automation tasks...");

  // 1. Token refresh once daily at 5:30 AM IST (00:00 UTC)
  cron.schedule("0 0 * * *", () => {
    runTokenRefreshJob().catch(console.error);
  });

  // 2. Warehouse sync once daily at 6:30 AM IST (01:00 UTC)
  cron.schedule("0 1 * * *", () => {
    runWarehouseSyncJob().catch(console.error);
  });

  // 3. Tracking update once daily at 7:30 AM IST (02:00 UTC)
  cron.schedule("0 2 * * *", () => {
    runTrackingUpdateJob().catch(console.error);
  });

  // 4. Shopify data sync once daily at 8:30 AM IST (03:00 UTC)
  cron.schedule("0 3 * * *", () => {
    runShopifySyncJob().catch(console.error);
  });

  // 5. Meta Ads spend + attribution sync once daily at 8:00 AM IST
  // 02:30 UTC = 08:00 AM IST
  cron.schedule("30 2 * * *", () => {
    runMetaAdsSyncJob().catch(console.error);
  });

  // 6. Trial-upgrade reminder emails once daily at 9:30 AM IST (04:00 UTC)
  cron.schedule("0 4 * * *", () => {
    runUpgradeReminderJob().catch(console.error);
  });

  // Run immediate initial checks on startup (non-blocking)
  setTimeout(() => {
    runTokenRefreshJob().catch(console.error);
    runWarehouseSyncJob().catch(console.error);
  }, 5000);

  console.log(
    "[Scheduler] Background jobs scheduled: " +
    "Token Refresh (daily 5:30am IST), " +
    "Warehouse Sync (daily 6:30am IST), " +
    "Tracking Update (daily 7:30am IST), " +
    "Shopify Sync (daily 8:30am IST), " +
    "Meta Ads Sync (daily 8:00am IST)."
  );
}