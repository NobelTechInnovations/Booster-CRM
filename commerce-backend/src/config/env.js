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
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    apiSecret: process.env.SHOPIFY_API_SECRET || "",
    scopes: process.env.SHOPIFY_SCOPES || "read_products,read_orders,read_inventory,read_customers",
    appUrl: process.env.SHOPIFY_APP_URL || `http://localhost:${process.env.PORT || 4000}`,
    apiVersion: process.env.SHOPIFY_API_VERSION || "2026-01",
    installUrl: process.env.SHOPIFY_APP_INSTALL_URL || "",
  },
};
