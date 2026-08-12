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

    // Where this row came from. "manual" = typed in by a user (default).
    // "meta-ad-sync" = auto-generated/updated from live Meta ad spend so it shows
    // up in the expense ledger without double counting — these rows are excluded
    // from getFinanceSummary's marketing-expense sum since ad spend is already
    // totalled separately from AdInsight, and they're upserted per calendar day
    // (not re-created) so a resync just refreshes the amount.
    source: { type: String, enum: ["manual", "meta-ad-sync"], default: "manual", index: true },
    // For source:"meta-ad-sync" rows, the calendar day (YYYY-MM-DD, local) the spend
    // belongs to — used as the upsert key alongside companyId so re-syncing updates
    // the same row instead of creating duplicates.
    syncDay: { type: String },
  },
  { timestamps: true },
);

expenseSchema.index({ companyId: 1, date: -1 });
expenseSchema.index({ companyId: 1, category: 1 });
expenseSchema.index({ companyId: 1, source: 1, syncDay: 1 });

export const Expense = mongoose.model("Expense", expenseSchema);
