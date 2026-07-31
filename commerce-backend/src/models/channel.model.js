import mongoose from "mongoose";

const channelSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    provider: { type: String, enum: ["shopify", "amazon", "velocity"], required: true, index: true },
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
      refreshToken: { type: String, select: false },
      username: { type: String, select: false },
      password: { type: String, select: false },
      token: { type: String, select: false },
      tokenExpiresAt: { type: Date, select: false },
    },
    external: {
      shopId: String,
      sellingPartnerId: String,
      marketplaceId: String,
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
    metrics: {
      orderCount: { type: Number, default: 0 },
      salesTotal: { type: Number, default: 0 },
      productCount: { type: Number, default: 0 },
      customerCount: { type: Number, default: 0 },
      currency: String,
      lastOrderName: String,
      lastOrderAt: Date,
    },
    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    disconnectedAt: Date,
  },
  { timestamps: true },
);

channelSchema.index({ companyId: 1, provider: 1, shop: 1 }, { unique: true });

export const Channel = mongoose.model("Channel", channelSchema);
