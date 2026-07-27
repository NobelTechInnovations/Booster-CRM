import mongoose from "mongoose";

const syncedOrderSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true, index: true },
    provider: { type: String, enum: ["shopify", "amazon"], required: true, index: true },
    shop: { type: String, required: true, index: true },
    externalId: { type: String, required: true },
    name: String,
    orderNumber: Number,
    email: String,
    phone: String,
    customerExternalId: String,
    customerName: String,
    financialStatus: String,
    fulfillmentStatus: String,
    note: String,
    tags: [String],
    currency: String,
    totalPrice: { type: Number, default: 0 },
    subtotalPrice: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    paymentGatewayNames: [String],
    lineItems: [
      {
        externalId: String,
        productExternalId: String,
        variantExternalId: String,
        title: String,
        sku: String,
        quantity: Number,
        price: Number,
      },
    ],
    shippingAddress: {
      name: String,
      city: String,
      province: String,
      country: String,
      zip: String,
    },
    shopifyCreatedAt: Date,
    processedAt: Date,
    cancelledAt: Date,
    raw: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

syncedOrderSchema.index({ companyId: 1, channelId: 1, externalId: 1 }, { unique: true });
syncedOrderSchema.index({ companyId: 1, shopifyCreatedAt: -1 });

export const SyncedOrder = mongoose.model("SyncedOrder", syncedOrderSchema);
