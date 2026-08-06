import mongoose from "mongoose";

const channelSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    // "sales" = Shopify, Amazon, WooCommerce etc.
    // "shipping" = Velocity, Shiprocket, Shipmozo etc.
    channelType: {
      type: String,
      enum: ["sales", "shipping"],
      required: true,
      default: "sales",
      index: true,
    },

    provider: {
      type: String,
      enum: [
        // Sales channels
        "shopify", "amazon", "woocommerce", "flipkart", "meesho", "myntra", "ajio", "etsy",
        // Shipping providers
        "velocity", "shiprocket", "shipmozo", "shipway", "ithink", "nimbuspost", "pickrr", "delhivery",
      ],
      required: true,
      index: true,
    },

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
      accessToken:    { type: String, select: false },
      refreshToken:   { type: String, select: false },
      username:       { type: String, select: false },
      password:       { type: String, select: false },
      token:          { type: String, select: false },
      tokenExpiresAt: { type: Date,   select: false },
      apiKey:         { type: String, select: false },
      apiSecret:      { type: String, select: false },
    },

    external: {
      // Sales channel fields
      shopId:            String,
      sellingPartnerId:  String,
      marketplaceId:     String,
      email:             String,
      domain:            String,
      myshopifyDomain:   String,
      currency:          String,
      timezone:          String,
      // Shipping provider fields
      accountId:         String,
      companyName:       String,
    },

    // Sales channel sync state
    sync: {
      products:    { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      orders:      { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      inventory:   { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      customers:   { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      warehouses:  { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      lastSyncAt:  Date,
      lastError:   String,
    },

    // Sales channel metrics
    metrics: {
      orderCount:    { type: Number, default: 0 },
      salesTotal:    { type: Number, default: 0 },
      productCount:  { type: Number, default: 0 },
      customerCount: { type: Number, default: 0 },
      currency:      String,
      lastOrderName: String,
      lastOrderAt:   Date,
    },

    // Registered Shopify webhooks (to avoid re-registering)
    webhooks: [
      {
        topic:      String,
        webhookId:  String,
        registeredAt: Date,
      },
    ],

    connectedBy:    { type: mongoose.Schema.Types.Mixed },
    disconnectedAt: Date,
  },
  { timestamps: true },
);

channelSchema.index({ companyId: 1, provider: 1, shop: 1 }, { unique: true });
channelSchema.index({ companyId: 1, channelType: 1, status: 1 });

export const Channel = mongoose.model("Channel", channelSchema);
