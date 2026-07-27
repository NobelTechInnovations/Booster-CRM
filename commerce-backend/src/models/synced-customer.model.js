import mongoose from "mongoose";

const syncedCustomerSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true, index: true },
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
      city: String,
      province: String,
      country: String,
      zip: String,
    },
    shopifyCreatedAt: Date,
    shopifyUpdatedAt: Date,
    raw: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

syncedCustomerSchema.index({ companyId: 1, channelId: 1, externalId: 1 }, { unique: true });

export const SyncedCustomer = mongoose.model("SyncedCustomer", syncedCustomerSchema);
