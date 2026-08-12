import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    category: {
      type: String,
      enum: ["rent", "salary", "utilities", "packaging", "shipping", "software", "marketing", "misc", "other"],
      default: "other",
      index: true,
    },
    description: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    date: { type: Date, required: true, default: Date.now, index: true },
    paymentMethod: { type: String, trim: true },
    vendorId: { type: mongoose.Schema.Types.Mixed },

    // Who paid — supports splitting one expense across multiple partners/directors
    // (e.g. one spent ₹1,000 and another ₹734 of the same ₹1,734 expense) as well as
    // the simple case of a single spender. Each entry's userId is a User _id; amounts
    // should sum to `amount` but this isn't enforced so partial/unassigned data is fine.
    splitBetween: [
      {
        userId: { type: mongoose.Schema.Types.Mixed, required: true },
        userName: String, // denormalized for display even if the user is later removed
        amount: { type: Number, required: true, min: 0 },
      },
    ],

    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

expenseSchema.index({ companyId: 1, date: -1 });
expenseSchema.index({ companyId: 1, category: 1 });

export const Expense = mongoose.model("Expense", expenseSchema);
