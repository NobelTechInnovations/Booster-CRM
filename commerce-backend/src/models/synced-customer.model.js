import mongoose from "mongoose";

const followUpSchema = new mongoose.Schema(
  {
    calledAt: { type: Date, required: true },
    note: { type: String, default: "" },
    outcome: {
      type: String,
      enum: ["called", "no_answer", "interested", "converted", "follow_up_later", "not_interested", "other"],
      default: "called",
    },
    nextFollowUpAt: { type: Date },
    createdByName: { type: String, default: "Agent" },
  },
  { _id: true, timestamps: true },
);

const syncedCustomerSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    channelId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    provider: { type: String, enum: ["shopify", "amazon"], required: true, index: true },
    shop: { type: String, required: true, index: true },
    externalId: { type: String, required: true },
    email: String,
    phone: String,
    firstName: String,
    lastName: String,
    name: String,
    state: String,
    tags: [String],
    note: String,
    ordersCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    currency: String,
    defaultAddress: {
      address1: String,
      address2: String,
      city: String,
      province: String,
      country: String,
      zip: String,
    },
    shopifyCreatedAt: Date,
    shopifyUpdatedAt: Date,
    raw: mongoose.Schema.Types.Mixed,

    // Store-to-store migration (migration.service.js) — same dual-pointer
    // pattern as SyncedOrder's migratedFrom/ToOrderId, see that model's
    // comment for the full rationale. pushedToShopifyAt is separate: a
    // migrated customer copy lives only in our own database (synthetic
    // externalId) until/unless someone explicitly runs "Push Customers to
    // Shopify", at which point this is set and externalId is swapped to
    // the real Shopify customer id that now backs it — orders are never
    // part of this push, only customers.
    migratedFromCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: "SyncedCustomer", index: true, sparse: true },
    migratedToCustomerId:   { type: mongoose.Schema.Types.ObjectId, ref: "SyncedCustomer", sparse: true },
    migratedAt: Date,
    pushedToShopifyAt: Date,

    // ─── Follow-up CRM fields ─────────────────────────────────────
    followUpStatus: {
      type: String,
      enum: ["new", "follow_up_scheduled", "converted", "no_response", "closed"],
      default: "new",
      index: true,
    },
    nextFollowUpAt: { type: Date, index: true },
    followUps: [followUpSchema],
  },
  { timestamps: true },
);

syncedCustomerSchema.index({ companyId: 1, channelId: 1, externalId: 1 }, { unique: true });
syncedCustomerSchema.index({ companyId: 1, nextFollowUpAt: 1 });

export const SyncedCustomer = mongoose.model("SyncedCustomer", syncedCustomerSchema);
