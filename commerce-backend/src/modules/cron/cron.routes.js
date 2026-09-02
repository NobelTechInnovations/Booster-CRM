import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { env } from "../../config/env.js";
import { runTokenRefreshJob } from "../../jobs/token-refresh.job.js";
import { runWarehouseSyncJob } from "../../jobs/warehouse-sync.job.js";
import { runTrackingUpdateJob } from "../../jobs/tracking-update.job.js";
import { runShopifySyncJob } from "../../jobs/shopify-sync.job.js";
import { runMetaAdsSyncJob } from "../../jobs/meta-ads-sync.job.js";
import { runUpgradeReminderJob } from "../../jobs/upgrade-reminder.job.js";

// Vercel serverless functions don't stay alive between requests, so the
// in-process node-cron scheduler (jobs/scheduler.js, still used in local
// dev via `npm run dev`) never actually fires in production — its
// setInterval-based timers get frozen along with the rest of the process the
// moment a request finishes. This is what "auto sync only when I click
// Sync" turned out to be: not a bug in the sync logic itself, but the
// scheduler having nowhere to keep running.
//
// The fix is Vercel's own Cron Jobs feature: it hits a real HTTP endpoint on
// a schedule instead of relying on a resident process. Each job below is its
// own route so one slow company/channel can't blow the execution-time
// budget for every job at once, and so they can be scheduled independently.
//
// Wire up in the Vercel project this backend deploys as:
//   1. Set a CRON_SECRET env var (any random string) on the project.
//   2. Add a `crons` array to vercel.json (see the one committed alongside
//      this file) pointing at these paths.
//   3. Hobby-plan projects can only run a cron once per day — if that's not
//      frequent enough, point an external pinger (cron-job.org, GitHub
//      Actions on a schedule, etc.) at these same URLs instead; they're
//      authenticated the same way Vercel's own crons are.
export const cronRoutes = Router();

function requireCronAuth(req, res, next) {
  if (!env.cronSecret) {
    // Not configured yet — allow through so these endpoints work before
    // CRON_SECRET is set up, but make it loud in the logs since an
    // unauthenticated trigger endpoint left open long-term is a real risk.
    console.warn("[Cron] CRON_SECRET is not set — /api/cron/* endpoints are currently unauthenticated.");
    return next();
  }
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${env.cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

cronRoutes.use(requireCronAuth);

function wrapJob(name, jobFn) {
  return asyncHandler(async (req, res) => {
    const startedAt = Date.now();
    await jobFn();
    res.json({ job: name, status: "ok", durationMs: Date.now() - startedAt });
  });
}

cronRoutes.get("/refresh-tokens", wrapJob("refresh-tokens", runTokenRefreshJob));
cronRoutes.get("/sync-warehouses", wrapJob("sync-warehouses", runWarehouseSyncJob));
cronRoutes.get("/sync-tracking", wrapJob("sync-tracking", runTrackingUpdateJob));
cronRoutes.get("/sync-shopify", wrapJob("sync-shopify", runShopifySyncJob));
// Scheduled once daily at "30 2 * * *" (UTC) = 8:00 AM IST in vercel.json —
// this is the one figure that actually updates the "official" Meta ad spend
// number; see getMetaAdSpendToday in meta.service.js (GET
// /api/ads/:channelId/spend-today) for the separate live on-demand check
// that never writes anywhere.
cronRoutes.get("/sync-meta-ads", wrapJob("sync-meta-ads", runMetaAdsSyncJob));
cronRoutes.get("/upgrade-reminders", wrapJob("upgrade-reminders", runUpgradeReminderJob));
