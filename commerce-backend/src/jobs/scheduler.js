import cron from "node-cron";
import { runWarehouseSyncJob } from "./warehouse-sync.job.js";
import { runTrackingUpdateJob } from "./tracking-update.job.js";
import { runTokenRefreshJob } from "./token-refresh.job.js";
import { runShopifySyncJob } from "./shopify-sync.job.js";

/**
 * Initializes and schedules all OMS background automation jobs.
 */
export function startScheduler() {
  console.log("[Scheduler] Initializing OMS background automation tasks...");

  // 1. Proactive token refresh every hour
  cron.schedule("0 * * * *", () => {
    runTokenRefreshJob().catch(console.error);
  });

  // 2. Warehouse sync every 6 hours
  cron.schedule("0 */6 * * *", () => {
    runWarehouseSyncJob().catch(console.error);
  });

  // 3. Tracking update for active shipments every 15 minutes
  cron.schedule("*/15 * * * *", () => {
    runTrackingUpdateJob().catch(console.error);
  });

  // 4. Fallback Shopify data sync every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    runShopifySyncJob().catch(console.error);
  });

  // Run immediate initial checks on startup (non-blocking)
  setTimeout(() => {
    runTokenRefreshJob().catch(console.error);
    runWarehouseSyncJob().catch(console.error);
  }, 5000);

  console.log("[Scheduler] Background jobs scheduled: Token Refresh (1h), Tracking Update (15m), Warehouse Sync (6h), Shopify Sync (30m).");
}
