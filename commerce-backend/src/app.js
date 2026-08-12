import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { getStoreMode } from "./repositories/channel.repo.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { channelRoutes } from "./modules/channels/channel.routes.js";
import { companyRoutes } from "./modules/company/company.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { shippingRoutes } from "./modules/shipping/shipping.routes.js";
import { shopifyWebhookRoutes } from "./modules/webhooks/shopify-webhook.routes.js";
import { fulfillmentRoutes } from "./modules/fulfillment/fulfillment.routes.js";
import { financeRoutes } from "./modules/finance/finance.routes.js";
import { adsRoutes } from "./modules/ads/ads.routes.js";
import { inventoryRoutes } from "./modules/inventory/inventory.routes.js";
import { reportsRoutes } from "./modules/reports/reports.routes.js";
import { automationRoutes } from "./modules/automation/automation.routes.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true,
    }),
  );
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "commerce-backend",
      phase: "production-oms-automated",
      store: getStoreMode(),
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/company", companyRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/channels", channelRoutes);
  app.use("/api/shipping", shippingRoutes);
  app.use("/api/webhooks/shopify", shopifyWebhookRoutes);
  app.use("/api/fulfillment", fulfillmentRoutes);
  app.use("/api/finance", financeRoutes);
  app.use("/api/ads", adsRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/automation", automationRoutes);

  app.use((req, res) => {
    res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
  });

  app.use((error, _req, res, _next) => {
    const statusCode = error.statusCode || 500;

    if (statusCode >= 500) {
      console.error(error);
    }

    res.status(statusCode).json({
      message: error.message || "Internal server error",
      details: error.details,
    });
  });

  return app;
}
