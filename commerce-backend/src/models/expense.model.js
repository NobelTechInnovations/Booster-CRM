import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    category: {
      type: String,
      enum: ["rent", "salary", "utilities", "packaging", "shipping", "software", "marketing", "other"],
      default: "other",
      index: true,
    },
    description: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    date: { type: Date, required: true, default: Date.now, index: true },
    paymentMethod: { type: String, trim: true },
    vendorId: { type: mongoose.Schema.Types.Mixed },

    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

expenseSchema.index({ companyId: 1, date: -1 });
expenseSchema.index({ companyId: 1, category: 1 });

export const Expense = mongoose.model("Expense", expenseSchema);
