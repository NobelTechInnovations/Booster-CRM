import mongoose from "mongoose";

const purchaseItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["sticker", "spice", "packaging", "raw-material", "other"],
      default: "raw-material",
    },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "unit", trim: true },
    unitCost: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const purchaseSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    vendorId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    vendorName: { type: String, trim: true },

    invoiceNumber: { type: String, trim: true },
    purchaseDate: { type: Date, required: true, default: Date.now, index: true },

    items: { type: [purchaseItemSchema], default: [] },
    totalAmount: { type: Number, required: true, min: 0 },

    paymentStatus: { type: String, enum: ["paid", "partial", "unpaid"], default: "unpaid" },
    amountPaid: { type: Number, default: 0, min: 0 },
    paymentMethod: { type: String, trim: true },

    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

purchaseSchema.index({ companyId: 1, purchaseDate: -1 });
purchaseSchema.index({ companyId: 1, vendorId: 1 });

export const Purchase = mongoose.model("Purchase", purchaseSchema);
