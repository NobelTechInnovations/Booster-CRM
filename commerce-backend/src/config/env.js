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
    // Facebook Login for Business configuration for WhatsApp Embedded
    // Signup (not a secret — Meta's own JS SDK docs pass config ids
    // directly in client-side code). Defaults to the "WhatsApp Embedded
    // Signup" configuration already created under the Booster Connect
    // Suite Meta App; override via env if a different one is ever needed.
    whatsappSignupConfigId: process.env.META_WHATSAPP_SIGNUP_CONFIG_ID || "28165972503056854",
  },
  // WhatsApp Cloud API. Per-company phone number + access token are NOT
  // here — each company connects their own WhatsApp Business Account via
  // POST /api/whatsapp/connect, stored on their own Channel doc, same as
  // every other per-company integration in this app. Only the webhook
  // verify token and signing secret live here, because Meta only supports
  // ONE webhook URL + verify token per Meta App (app-level, not
  // per-company) — every connected company's events arrive on this same
  // shared webhook and get routed by phone_number_id (see
  // modules/whatsapp/whatsapp.service.js). appSecret falls back to
  // META_APP_SECRET since it's typically the same underlying Meta App.
  whatsapp: {
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "",
    appSecret: process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "",
    apiVersion: process.env.META_API_VERSION || "v21.0",
  },
  // "Smart WhatsApp" — a completely separate, unofficial integration (see
  // smart-whatsapp-service/README.md) that connects a real WhatsApp number
  // via WhatsApp Web-style pairing instead of Meta's Cloud API. That's a
  // standalone, always-on Node process (can't run as a Vercel serverless
  // function — it holds a live connection open 24/7), so this backend only
  // ever talks to it over this private HTTP API, authenticated with a
  // shared secret since there's no per-user identity on that side.
  smartWhatsapp: {
    serviceUrl: process.env.SMART_WHATSAPP_SERVICE_URL || "",
    sharedSecret: process.env.SMART_WHATSAPP_SHARED_SECRET || "",
  },
  // Platform Admin (app/admin) — a completely separate login for the people
  // who run Booster itself, not a company's own users. Deliberately its own
  // JWT secret, distinct from jwtSecret above: a leaked/forged company token
  // must never be replayable as admin access, and vice versa.
  platformAdmin: {
    jwtSecret: process.env.PLATFORM_ADMIN_JWT_SECRET || "dev-only-platform-admin-secret",
  },
  // Razorpay — collects wallet recharges and plan upgrades FOR the platform
  // itself (Booster charging its own companies), a single shared account,
  // not a per-company merchant setup. keyId/keySecret from Razorpay's API
  // Keys dashboard section; webhookSecret is set separately when adding the
  // webhook URL there (Settings -> Webhooks), and is deliberately a
  // different value from keySecret.
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  },
  // Resend — transactional email (trial-ending reminders, payment receipts).
  // No email provider existed in this codebase before this; Resend's plain
  // REST API matches the fetch-wrapper convention every other external
  // service here already uses, no SMTP setup needed.
  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
  },
};
