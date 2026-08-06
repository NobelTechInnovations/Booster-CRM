import mongoose from "mongoose";

const syncedProductSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    channelId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    provider: { type: String, enum: ["shopify", "amazon"], required: true, index: true },
    shop: { type: String, required: true, index: true },
    externalId: { type: String, required: true },
    title: String,
    handle: String,
    status: String,
    vendor: String,
    productType: String,
    tags: [String],
    imageUrl: String,
    totalInventory: { type: Number, default: 0 },
    variants: [
      {
        externalId: String,
        title: String,
        sku: String,
        price: Number,
        inventoryQuantity: Number,
        barcode: String,
      },
    ],
    shopifyCreatedAt: Date,
    shopifyUpdatedAt: Date,
    publishedAt: Date,
    raw: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

syncedProductSchema.index({ companyId: 1, channelId: 1, externalId: 1 }, { unique: true });

export const SyncedProduct = mongoose.model("SyncedProduct", syncedProductSchema);
