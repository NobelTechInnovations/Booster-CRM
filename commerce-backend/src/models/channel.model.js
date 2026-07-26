import mongoose from "mongoose";

const channelSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    provider: { type: String, enum: ["shopify"], required: true, index: true },
    name: { type: String, required: true },
    shop: { type: String, required: true, lowercase: true, trim: true },
    status: {
      type: String,
      enum: ["connected", "disconnected", "reconnect_required", "syncing"],
      default: "connected",
      index: true,
    },
    scopes: [{ type: String }],
    credentials: {
      accessToken: { type: String, select: false },
    },
    external: {
      shopId: String,
      email: String,
      domain: String,
      myshopifyDomain: String,
      currency: String,
      timezone: String,
    },
    sync: {
      products: { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      orders: { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      inventory: { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      customers: { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      lastSyncAt: Date,
      lastError: String,
    },
    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    disconnectedAt: Date,
  },
  { timestamps: true },
);

channelSchema.index({ companyId: 1, provider: 1, shop: 1 }, { unique: true });

export const Channel = mongoose.model("Channel", channelSchema);
