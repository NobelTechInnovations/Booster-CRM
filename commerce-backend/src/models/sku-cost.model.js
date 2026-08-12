import mongoose from "mongoose";

// Per-SKU cost sheet: buying price, MRP, shipping cost — kept in its own collection
// so it survives Shopify re-syncs untouched (product/variant docs get fully
// overwritten on every sync; this never does).
const skuCostSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    sku:       { type: String, required: true, trim: true },

    productTitle: String,   // denormalized for display convenience
    variantTitle: String,

    buyingPrice: { type: Number, default: 0 },  // raw material / procurement cost per unit
    mrp:         { type: Number, default: 0 },  // printed MRP, may differ from Shopify selling price
    weightGrams: { type: Number, default: 0 },  // shipping cost varies by destination + weight, so we
                                                  // capture weight here instead of a fixed cost — the
                                                  // Fulfillment page's live courier rate check is the
                                                  // source of truth for actual per-shipment cost.

    notes: String,
  },
  { timestamps: true },
);

skuCostSchema.index({ companyId: 1, sku: 1 }, { unique: true });

export const SkuCost = mongoose.model("SkuCost", skuCostSchema);
