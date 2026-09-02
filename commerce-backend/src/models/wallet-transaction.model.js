import mongoose from "mongoose";

// One row per change to a company's wallet balance (see
// Company.wallet.balance) — every admin top-up/adjustment is logged here
// rather than just overwriting the number, so the balance is always
// reconstructable and auditable.
const walletTransactionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    amount: { type: Number, required: true }, // positive = credit, negative = debit
    balanceAfter: { type: Number, required: true },
    type: { type: String, enum: ["topup", "debit", "adjustment"], default: "topup" },
    note: { type: String, default: "" },
    createdByAdminEmail: String,
  },
  { timestamps: true },
);

export const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);
