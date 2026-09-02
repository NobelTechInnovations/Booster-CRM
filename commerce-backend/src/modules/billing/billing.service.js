import { HttpError } from "../../utils/http-error.js";
import { getCompany } from "../../repositories/company.repo.js";
import { listPlans, getPlan, updateCompanySubscription } from "../../repositories/platform-admin.repo.js";
import { adjustCompanyWallet, listWalletTransactions } from "../../repositories/wallet.repo.js";
import {
  createPaymentTransaction,
  markPaymentTransactionPaid,
  getPaymentTransactionByRazorpayOrderId,
  listCompanyPaymentTransactions,
} from "../../repositories/billing.repo.js";
import { createOrder, verifyPaymentSignature, verifyWebhookSignature } from "./razorpay.service.js";
import { sendEmail } from "../../utils/mailer.js";

export async function listOfferablePlans() {
  const plans = await listPlans();
  return plans.filter((p) => p.isActive);
}

export async function getMyBilling({ companyId }) {
  const [company, walletTransactions, paymentTransactions] = await Promise.all([
    getCompany(companyId),
    listWalletTransactions(companyId),
    listCompanyPaymentTransactions(companyId),
  ]);
  if (!company) throw new HttpError(404, "Company not found");
  return {
    subscription: company.subscription || null,
    wallet: company.wallet || { balance: 0, currency: "INR" },
    walletTransactions,
    paymentTransactions,
  };
}

async function startCheckout({ companyId, purpose, amountRupees, planId, userEmail }) {
  if (!amountRupees || amountRupees <= 0) throw new HttpError(400, "Enter a valid amount");
  const amountPaise = Math.round(amountRupees * 100);
  const receipt = `${purpose}_${companyId}_${Date.now()}`.slice(0, 40);

  const razorpayOrder = await createOrder({ amountPaise, receipt, notes: { companyId: String(companyId), purpose } });

  await createPaymentTransaction({
    companyId, purpose, amount: amountRupees, currency: "INR",
    razorpayOrderId: razorpayOrder.id, planId, createdByUserEmail: userEmail,
  });

  return { razorpayOrderId: razorpayOrder.id, amountPaise, currency: "INR" };
}

export async function startWalletRecharge({ companyId, amount, userEmail }) {
  return startCheckout({ companyId, purpose: "wallet_topup", amountRupees: Number(amount), userEmail });
}

export async function startPlanUpgrade({ companyId, planId, userEmail }) {
  const plan = await getPlan(planId);
  if (!plan) throw new HttpError(404, "Plan not found");
  return startCheckout({ companyId, purpose: "plan_upgrade", amountRupees: plan.priceMonthly, planId, userEmail });
}

// Applies the actual side effect once a payment is confirmed paid — shared
// by both /verify (fast path) and the webhook (resilient fallback), so
// each only ever applies once per payment (see markPaymentTransactionPaid's
// own idempotency note).
async function applyPaidTransaction(tx) {
  if (tx.purpose === "wallet_topup") {
    await adjustCompanyWallet({ companyId: tx.companyId, amount: tx.amount, type: "topup", note: "Razorpay recharge" });
  } else if (tx.purpose === "plan_upgrade") {
    await updateCompanySubscription({
      companyId: tx.companyId,
      planId: tx.planId,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  const company = await getCompany(tx.companyId);
  if (company?.email) {
    const label = tx.purpose === "wallet_topup" ? `wallet recharge of ₹${tx.amount}` : `plan upgrade payment of ₹${tx.amount}`;
    sendEmail({
      to: company.email,
      subject: "Payment received — Booster",
      html: `<p>Hi ${company.name},</p><p>We've received your ${label}. Thanks for staying with Booster!</p>`,
    }).catch(() => {}); // receipt email is a nice-to-have, never blocks the actual credit
  }
}

export async function verifyCheckout({ companyId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  if (!verifyPaymentSignature({ orderId: razorpayOrderId, paymentId: razorpayPaymentId, signature: razorpaySignature })) {
    throw new HttpError(400, "Payment verification failed");
  }
  const existing = await getPaymentTransactionByRazorpayOrderId(razorpayOrderId);
  if (!existing || String(existing.companyId) !== String(companyId)) throw new HttpError(404, "Payment record not found");

  if (existing.status !== "paid") {
    const tx = await markPaymentTransactionPaid({ razorpayOrderId, razorpayPaymentId });
    await applyPaidTransaction(tx);
  }
  return { ok: true };
}

// Public webhook — Razorpay's own server telling us a payment succeeded,
// independent of whether the browser ever came back to call /verify (it
// might not — the user could close the tab right after paying). Always
// returns 200 once the signature checks out, per Razorpay's own retry
// contract, even if there's nothing to apply (unknown order, already paid).
export async function handleWebhook({ rawBody, signature }) {
  if (!verifyWebhookSignature({ rawBody, signature })) throw new HttpError(401, "Invalid webhook signature");

  const payload = JSON.parse(rawBody);
  if (payload.event !== "payment.captured") return;

  const razorpayOrderId = payload.payload?.payment?.entity?.order_id;
  const razorpayPaymentId = payload.payload?.payment?.entity?.id;
  if (!razorpayOrderId) return;

  const existing = await getPaymentTransactionByRazorpayOrderId(razorpayOrderId);
  if (!existing || existing.status === "paid") return;

  const tx = await markPaymentTransactionPaid({ razorpayOrderId, razorpayPaymentId });
  await applyPaidTransaction(tx);
}
