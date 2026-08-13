import mongoose from "mongoose";

// One inbound webhook endpoint per (company, external source) — e.g. a brand's
// Razorpay account, or their Shiprocket Checkout/Fastrr abandoned-cart hook.
// `token` is the unique, unguessable slug in the public inbound URL
// (/api/webhooks/inbound/:token); it alone identifies which company + source
// an incoming call belongs to, since external services can't send our JWT.
// `secret` (when the provider supports it) is used to verify the payload
// really came from them via HMAC signature — never returned by the API after
// creation, shown once like the Shopify custom-app token.
const webhookEndpointSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    name: { type: String, required: true, trim: true }, // brand-chosen label, e.g. "Razorpay — main account"
    provider: { type: String, required: true, trim: true }, // free text: "razorpay", "cashfree", "shiprocket-checkout", "fastrr", "custom", ...
    type: {
      type: String,
      enum: ["payment", "cart-recovery", "shipping", "other"],
      default: "other",
    },

    token: { type: String, required: true, unique: true, index: true },
    secret: { type: String, select: false },

    status: { type: String, enum: ["active", "inactive"], default: "active" },
    lastEventAt: Date,
    eventCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

webhookEndpointSchema.index({ companyId: 1, status: 1 });

export const WebhookEndpoint = mongoose.model("WebhookEndpoint", webhookEndpointSchema);
