import mongoose from "mongoose";

const productMappingSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    masterName: { type: String, required: true, trim: true },
    mappings: [
      {
        provider: { type: String, enum: ["shopify", "amazon"], required: true },
        channelId: { type: mongoose.Schema.Types.ObjectId, ref: "Channel" },
        productId: String,
        productTitle: String,
        sku: String,
      },
    ],
  },
  { timestamps: true },
);

productMappingSchema.index({ companyId: 1, masterName: 1 }, { unique: true });

export const ProductMapping = mongoose.model("ProductMapping", productMappingSchema);
