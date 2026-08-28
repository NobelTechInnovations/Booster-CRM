import mongoose from "mongoose";

// Per-SKU cost sheet: buying price, MRP, shipping cost — kept in its own collection
// so it survives Shopify re-syncs untouched (product/variant docs get fully
// overwritten on every sync; this never does).
//
// Price history: every time buyingPrice changes we push the OLD price into
// priceHistory with the timestamp it was valid until. computeOrderCost() then
// uses the price that was in effect on the order's own date rather than the
// current price — so changing a buying price today doesn't silently rewrite
// historical profit on orders that shipped months ago.
const skuCostSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    sku:       { type: String, required: true, trim: true },

    productTitle: String,   // denormalized for display convenience
    variantTitle: String,

    buyingPrice: { type: Number, default: 0 },  // raw material / procurement cost per unit — CURRENT
    mrp:         { type: Number, default: 0 },  // printed MRP, may differ from Shopify selling price
    weightGrams: { type: Number, default: 0 },

    notes: String,

    // Audit trail of buying-price changes. Each entry records the price that
    // was valid from some point up to changedAt (i.e. "this was the price
    // BEFORE it changed on changedAt"). The current buyingPrice is always the
    // most recent value; entries here cover any earlier period.
    priceHistory: [
      {
        buyingPrice: { type: Number, required: true },
        changedAt:   { type: Date,   required: true },
        note:        String,
      },
    ],
  },
  { timestamps: true },
);

skuCostSchema.index({ companyId: 1, sku: 1 }, { unique: true });

export const SkuCost = mongoose.model("SkuCost", skuCostSchema);
