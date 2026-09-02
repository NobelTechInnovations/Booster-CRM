import { isMongoConnected } from "../config/database.js";
import { Company } from "../models/company.model.js";
import { WalletTransaction } from "../models/wallet-transaction.model.js";
import { Plan } from "../models/plan.model.js";
import { memory, id, clone, now } from "./memory-store.js";

// Wallet primitives — used by both the admin module (manual top-ups/
// adjustments, see platform-admin.repo.js, which re-exports these) and the
// fulfillment flow (automatic per-order fee, chargeWalletForFulfillment
// below). Kept as its own file so fulfillment.service.js never has to
// import from the platform-admin module.

// `amount` is signed: positive for a credit (top-up), negative for a debit.
export async function adjustCompanyWallet({ companyId, amount, note, type, adminEmail, orderId }) {
  const delta = Number(amount);
  if (!Number.isFinite(delta) || delta === 0) return { error: "Enter a non-zero amount" };

  if (isMongoConnected()) {
    const existing = await Company.findById(companyId).lean();
    if (!existing) return { error: "Company not found" };
    const balanceAfter = Number(existing.wallet?.balance || 0) + delta;
    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: { "wallet.balance": balanceAfter, "wallet.currency": existing.wallet?.currency || "INR" } },
      { new: true },
    ).lean();
    await WalletTransaction.create({
      companyId, amount: delta, balanceAfter,
      type: type || (delta > 0 ? "topup" : "debit"),
      note, createdByAdminEmail: adminEmail,
      ...(orderId ? { orderId } : {}),
    });
    return { company, balanceAfter };
  }

  const company = memory.companies.get(String(companyId));
  if (!company) return { error: "Company not found" };
  const balanceAfter = Number(company.wallet?.balance || 0) + delta;
  company.wallet = { balance: balanceAfter, currency: company.wallet?.currency || "INR" };
  const tx = {
    _id: id(), companyId, amount: delta, balanceAfter,
    type: type || (delta > 0 ? "topup" : "debit"),
    note, createdByAdminEmail: adminEmail, createdAt: now(),
    ...(orderId ? { orderId } : {}),
  };
  memory.walletTransactions.set(tx._id, tx);
  return { company: clone(company), balanceAfter };
}

export async function listWalletTransactions(companyId) {
  if (isMongoConnected()) return WalletTransaction.find({ companyId }).sort({ createdAt: -1 }).limit(50).lean();
  return [...memory.walletTransactions.values()]
    .map(clone)
    .filter((t) => String(t.companyId) === String(companyId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
}

async function hasFulfillmentCharge(companyId, orderId) {
  if (isMongoConnected()) {
    const existing = await WalletTransaction.findOne({ companyId, orderId, type: "fulfillment_fee" }).lean();
    return Boolean(existing);
  }
  for (const t of memory.walletTransactions.values()) {
    if (String(t.companyId) === String(companyId) && String(t.orderId) === String(orderId) && t.type === "fulfillment_fee") return true;
  }
  return false;
}

// Called from both fulfillment paths (shipOrder() and the Shopify
// "fulfillments/create" webhook) the exact moment an order actually ships —
// same best-effort contract as deductAssetsForOrder right next to it: never
// throws, a failure here must never be allowed to break the real shipment.
//
// Also where trial/subscription expiry actually gets noticed (per explicit
// decision: checked here rather than blocking anything) — a trial past its
// trialEndsAt flips to "past_due" as a side effect of real usage, not a
// separate cron sweep. Never blocks the fulfillment either way.
export async function chargeWalletForFulfillment({ companyId, order }) {
  const company = isMongoConnected() ? await Company.findById(companyId).lean() : memory.companies.get(String(companyId));
  if (!company) return;

  const sub = company.subscription;
  if (sub?.status === "trialing" && sub.trialEndsAt && new Date(sub.trialEndsAt) < new Date()) {
    if (isMongoConnected()) {
      await Company.findByIdAndUpdate(companyId, { $set: { "subscription.status": "past_due" } });
    } else if (company.subscription) {
      company.subscription.status = "past_due";
    }
  }

  if (!sub?.planId) return; // no plan assigned — nothing to charge, matches "full access, unmetered"
  const plan = isMongoConnected() ? await Plan.findById(sub.planId).lean() : memory.plans.get(String(sub.planId));
  const fee = Number(plan?.perOrderFulfillmentFee || 0);
  if (!fee) return;

  const orderId = order._id || order.id;
  if (!orderId) return;
  if (await hasFulfillmentCharge(companyId, orderId)) return; // already charged — webhook redelivery, etc.

  await adjustCompanyWallet({
    companyId,
    amount: -Math.abs(fee),
    type: "fulfillment_fee",
    note: `Fulfillment fee — order ${order.name || orderId}`,
    orderId,
  });
}
