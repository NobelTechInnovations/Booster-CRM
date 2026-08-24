import dotenv from "dotenv";

dotenv.config();

const requiredInProduction = ["JWT_SECRET", "MONGODB_URI"];

for (const key of requiredInProduction) {
  if (process.env.NODE_ENV === "production" && !process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "127.0.0.1",
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/commerceos",
  jwtSecret: process.env.JWT_SECRET || "dev-only-commerceos-secret",
  // Authenticates Vercel Cron (or any external pinger) hitting /api/cron/*.
  // Vercel automatically sends "Authorization: Bearer <CRON_SECRET>" on
  // scheduled invocations when this env var is set on the project — see
  // cron.routes.js. Left unset in dev, where the in-process node-cron
  // scheduler (jobs/scheduler.js) runs these same jobs directly instead.
  cronSecret: process.env.CRON_SECRET || "",
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    apiSecret: process.env.SHOPIFY_API_SECRET || "",
    scopes:
      process.env.SHOPIFY_SCOPES ||
      "read_products,write_products,read_orders,write_orders,read_inventory,read_customers,write_customers",
    appUrl: process.env.SHOPIFY_APP_URL || `http://localhost:${process.env.PORT || 4000}`,
    apiVersion: process.env.SHOPIFY_API_VERSION || "2026-01",
    installUrl: process.env.SHOPIFY_APP_INSTALL_URL || "",
  },
  amazon: {
    appUrl: process.env.AMAZON_APP_URL || process.env.SHOPIFY_APP_URL || `http://localhost:${process.env.PORT || 4000}`,
  },
  meta: {
    appId: process.env.META_APP_ID || "",
    appSecret: process.env.META_APP_SECRET || "",
    apiVersion: process.env.META_API_VERSION || "v21.0",
    appUrl: process.env.META_APP_URL || process.env.SHOPIFY_APP_URL || `http://localhost:${process.env.PORT || 4000}`,
    scopes: process.env.META_SCOPES || "ads_read,business_management",
  },
};
