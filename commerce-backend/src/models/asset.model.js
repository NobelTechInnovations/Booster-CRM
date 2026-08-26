import mongoose from "mongoose";

// Packaging/raw materials you physically hold stock of — jars (in whatever
// sizes you actually stock), stickers (one per product design, more added
// over time), or anything else. Deliberately separate from SkuCost (which is
// about a *finished product's* buying price/margin) — one finished SKU can
// consume several of these (a jar + a sticker), and one asset (a jar size)
// can be shared across several SKUs.
const assetSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    name: { type: String, required: true, trim: true }, // e.g. "250g Jar", "Sticker – Guntur Red Chilli"
    category: { type: String, enum: ["jar", "sticker", "other"], default: "other", index: true },
    variant: { type: String, trim: true }, // e.g. "250g" — free text, mainly descriptive
    unit: { type: String, default: "pcs", trim: true },

    // The real number in hand right now. Allowed to go negative — that's a
    // genuine "you're already short, restock now" signal, not something to
    // hide by floor-ing at 0.
    currentStock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 20 },

    // What one unit of this actually costs you — feeds into real per-order
    // profit (Dashboard) and per-SKU margin (Inventory & Costing) as
    // "packaging cost", on top of the SKU's own buying price. 0 until set,
    // never guessed.
    unitCost: { type: Number, default: 0 },

    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

assetSchema.index({ companyId: 1, category: 1 });

export const Asset = mongoose.model("Asset", assetSchema);
