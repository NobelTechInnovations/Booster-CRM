import mongoose from "mongoose";

// One row per Razorpay payment attempt — created the moment a company
// starts a wallet recharge or plan upgrade (status "created"), updated to
// "paid" once verified (either via the client-side /verify call right
// after checkout, or the webhook fallback — whichever lands first; both
// are idempotent against this same row via razorpayOrderId).
const paymentTransactionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    purpose: { type: String, enum: ["wallet_topup", "plan_upgrade"], required: true },
    amount: { type: Number, required: true }, // rupees, not paise — paise is a Razorpay-API-only detail
    currency: { type: String, default: "INR" },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: String,
    status: { type: String, enum: ["created", "paid", "failed"], default: "created" },
    // Only set for purpose:"plan_upgrade" — which plan this payment is for.
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
    createdByUserEmail: String,
  },
  { timestamps: true },
);

export const PaymentTransaction = mongoose.model("PaymentTransaction", paymentTransactionSchema);
