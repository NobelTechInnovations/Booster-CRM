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
    type: { type: String, enum: ["topup", "debit", "adjustment", "fulfillment_fee"], default: "topup" },
    note: { type: String, default: "" },
    createdByAdminEmail: String,
    // Only set for type:"fulfillment_fee" — the order this charge is for.
    // Combined with the unique+sparse index below, this is what makes
    // chargeWalletForFulfillment() idempotent: a webhook redelivery for the
    // same order can never charge it twice, since every other transaction
    // type never sets this field (sparse skips them entirely).
    orderId: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

walletTransactionSchema.index({ orderId: 1, type: 1 }, { unique: true, sparse: true });

export const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);
