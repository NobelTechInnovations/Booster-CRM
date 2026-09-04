import mongoose from "mongoose";

// Short-lived bridge between "user typed a custom Shopify app's Client
// ID/Secret for a store that isn't connected yet" and the OAuth callback
// that actually creates the Channel document — mirrors
// whatsapp-pending-signup.model.js's own reasoning exactly: the secret
// itself never rides in a URL/state param (state is just signed, not
// encrypted, so anything in it ends up in browser history/server logs),
// it lives here instead, looked up by {companyId, shop} using values that
// already ride in the OAuth state today. Deleted as soon as
// completeShopifyConnection consumes it, or via the TTL index below if the
// connect flow is abandoned.
const shopifyPendingAppConfigSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.Mixed, required: true },
  shop: { type: String, required: true },
  apiKey: { type: String, required: true },
  apiSecret: { type: String, required: true, select: false },
  createdAt: { type: Date, default: Date.now, expires: 900 }, // 15 minutes
});

shopifyPendingAppConfigSchema.index({ companyId: 1, shop: 1 }, { unique: true });

export const ShopifyPendingAppConfig =
  mongoose.models.ShopifyPendingAppConfig || mongoose.model("ShopifyPendingAppConfig", shopifyPendingAppConfigSchema);
