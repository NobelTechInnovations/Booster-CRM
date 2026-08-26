import mongoose from "mongoose";

// What a given SKU actually consumes when it ships — e.g. "Guntur Red Chilli
// 250g" (SKU M-RCX-250) consumes 1× "250g Jar" + 1× "Sticker – Guntur Red
// Chilli". Keyed by SKU (same pattern as SkuCost) so it survives Shopify
// product re-syncs untouched.
const assetMappingSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    sku: { type: String, required: true, trim: true },

    productTitle: String, // denormalized for display
    variantTitle: String,

    consumes: [
      {
        assetId: { type: mongoose.Schema.Types.ObjectId, ref: "Asset", required: true },
        quantity: { type: Number, default: 1, min: 0 },
      },
    ],
  },
  { timestamps: true },
);

assetMappingSchema.index({ companyId: 1, sku: 1 }, { unique: true });

export const AssetMapping = mongoose.model("AssetMapping", assetMappingSchema);
