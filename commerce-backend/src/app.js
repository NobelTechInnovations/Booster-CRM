import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { ensureDatabaseConnected } from "./config/database.js";
import { getStoreMode } from "./repositories/channel.repo.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { channelRoutes } from "./modules/channels/channel.routes.js";
import { companyRoutes } from "./modules/company/company.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { shippingRoutes } from "./modules/shipping/shipping.routes.js";
import { shopifyWebhookRoutes } from "./modules/webhooks/shopify-webhook.routes.js";
import { webhookInboxRoutes } from "./modules/webhooks/webhook-inbox.routes.js";
import { fulfillmentRoutes } from "./modules/fulfillment/fulfillment.routes.js";
import { financeRoutes } from "./modules/finance/finance.routes.js";
import { adsRoutes } from "./modules/ads/ads.routes.js";
import { socialRoutes } from "./modules/social/social.routes.js";
import { whatsappRoutes } from "./modules/whatsapp/whatsapp.routes.js";
import { smartWhatsappRoutes } from "./modules/smart-whatsapp/smart-whatsapp.routes.js";
import { platformAdminRoutes } from "./modules/platform-admin/platform-admin.routes.js";
import { billingRoutes } from "./modules/billing/billing.routes.js";
import { inventoryRoutes } from "./modules/inventory/inventory.routes.js";
import { reportsRoutes } from "./modules/reports/reports.routes.js";
import { automationRoutes } from "./modules/automation/automation.routes.js";
import { cronRoutes } from "./modules/cron/cron.routes.js";
import { publicTrackingRoutes } from "./modules/public/public-tracking.routes.js";
import { migrationRoutes } from "./modules/migration/migration.routes.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true,
    }),
  );
  app.use(helmet());
  // Captures the exact raw bytes alongside the parsed body — needed for inbound
  // webhook signature verification (webhook.service.js's verifyWebhookSignature),
  // since HMAC must be computed over the exact bytes the sender signed, not a
  // re-serialized JSON.stringify(req.body) which can differ in whitespace/key order.
  app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => { req.rawBody = buf.toString("utf8"); } }));
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "commerce-backend",
      phase: "production-oms-automated",
      store: getStoreMode(),
    });
  });

  // On Vercel this Express app is invoked directly per-request with no bootstrap
  // step (unlike local dev, where server.js awaits connectDatabase() once before
  // app.listen()) — so every request must make sure a DB connection exists before
  // reaching a route. ensureDatabaseConnected() is a no-op once connected (warm
  // container) and shares one in-flight connect() across concurrent cold requests.
  // Kept below /health so health checks still respond even if Mongo is unreachable.
  app.use(async (req, res, next) => {
    try {
      await ensureDatabaseConnected();
      next();
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/company", companyRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/channels", channelRoutes);
  app.use("/api/shipping", shippingRoutes);
  app.use("/api/webhooks/shopify", shopifyWebhookRoutes);
  app.use("/api/webhooks", webhookInboxRoutes);
  app.use("/api/fulfillment", fulfillmentRoutes);
  app.use("/api/finance", financeRoutes);
  app.use("/api/ads", adsRoutes);
  app.use("/api/social", socialRoutes);
  app.use("/api/whatsapp", whatsappRoutes);
  app.use("/api/smart-whatsapp", smartWhatsappRoutes);
  app.use("/api/platform-admin", platformAdminRoutes);
  app.use("/api/billing", billingRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/automation", automationRoutes);
  app.use("/api/migration", migrationRoutes);
  app.use("/api/cron", cronRoutes);
  app.use("/api/public/track", publicTrackingRoutes);

  app.use((req, res) => {
    res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
  });

  app.use((error, _req, res, next) => {
    const statusCode = error.statusCode || 500;

    if (statusCode >= 500) {
      // Always logged server-side (Vercel function logs) regardless of what
      // the client sees below — this is where the real message/stack for a
      // 500 belongs, not the response body.
      console.error(error);
    }

    // A streaming response (e.g. platform-admin backup/download's zip
    // archive) can fail partway through, after headers and some body bytes
    // are already on the wire — res.status()/.json() would throw "Cannot
    // set headers after they are sent" at that point, which is worse than
    // the original error. Delegate to Express's default handler, which
    // just destroys the connection, same as it does for every framework
    // that hits this exact situation.
    if (res.headersSent) return next(error);

    // Every intentional error in this app is thrown as an HttpError with its
    // own real statusCode (400/403/404/...) and a message written to be
    // shown to the user — those pass through as-is below. A bare 500 means
    // something unhandled blew up instead — a raw MongoDB/network driver
    // exception (a TLS handshake failure talking to Atlas, a timeout, ...),
    // a genuine code bug, whatever — and its .message is an implementation
    // detail (often a cryptic OpenSSL/driver string) that was leaking
    // straight to the browser. The full error is already console.error'd
    // above for whoever needs to actually debug it; the client just gets a
    // clear, generic "something went wrong, try again."
    res.status(statusCode).json({
      message: statusCode >= 500 ? "Something went wrong on our end — please try again in a moment." : (error.message || "Internal server error"),
      details: statusCode >= 500 ? undefined : error.details,
    });
  });

  return app;
}


export default createApp();