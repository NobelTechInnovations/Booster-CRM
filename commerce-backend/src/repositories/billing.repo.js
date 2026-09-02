import { isMongoConnected } from "../config/database.js";
import { PaymentTransaction } from "../models/payment-transaction.model.js";
import { WalletTransaction } from "../models/wallet-transaction.model.js";
import { Company } from "../models/company.model.js";
import { memory, id, clone, now } from "./memory-store.js";

// ─── Payment transactions (Razorpay) ────────────────────────────────────────

export async function createPaymentTransaction({ companyId, purpose, amount, currency, razorpayOrderId, planId, createdByUserEmail }) {
  const record = { companyId, purpose, amount, currency: currency || "INR", razorpayOrderId, status: "created", planId, createdByUserEmail };
  if (isMongoConnected()) {
    const tx = await PaymentTransaction.create(record);
    return tx.toObject();
  }
  const tx = { _id: id(), ...record, createdAt: now(), updatedAt: now() };
  memory.paymentTransactions.set(tx._id, tx);
  return clone(tx);
}

export async function getPaymentTransactionByRazorpayOrderId(razorpayOrderId) {
  if (isMongoConnected()) return PaymentTransaction.findOne({ razorpayOrderId }).lean();
  for (const tx of memory.paymentTransactions.values()) {
    if (tx.razorpayOrderId === razorpayOrderId) return clone(tx);
  }
  return null;
}

// Idempotent by design: called from both /verify (fast, client-driven) and
// the webhook (slow, resilient fallback) — whichever lands first flips
// status to "paid" and returns the fresh row; the second caller sees
// status already "paid" and the billing service skips re-applying the
// wallet-credit/plan-upgrade side effect.
export async function markPaymentTransactionPaid({ razorpayOrderId, razorpayPaymentId }) {
  if (isMongoConnected()) {
    return PaymentTransaction.findOneAndUpdate(
      { razorpayOrderId },
      { $set: { status: "paid", razorpayPaymentId } },
      { new: true },
    ).lean();
  }
  const tx = [...memory.paymentTransactions.values()].find((t) => t.razorpayOrderId === razorpayOrderId);
  if (!tx) return null;
  tx.status = "paid";
  tx.razorpayPaymentId = razorpayPaymentId;
  tx.updatedAt = now();
  return clone(tx);
}

export async function listCompanyPaymentTransactions(companyId) {
  if (isMongoConnected()) return PaymentTransaction.find({ companyId }).sort({ createdAt: -1 }).limit(50).lean();
  return [...memory.paymentTransactions.values()]
    .filter((t) => String(t.companyId) === String(companyId))
    .map(clone)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
}

// Cross-tenant — admin only (same exception pattern as
// listAllCompaniesForAdmin in platform-admin.repo.js).
export async function listAllPaymentTransactions() {
  const [txs, companies] = await Promise.all([
    isMongoConnected() ? PaymentTransaction.find({}).sort({ createdAt: -1 }).limit(500).lean() : [...memory.paymentTransactions.values()].map(clone).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    isMongoConnected() ? Company.find({}).select("name").lean() : [...memory.companies.values()].map(clone),
  ]);
  const namesById = new Map(companies.map((c) => [String(c._id), c.name]));
  return txs.map((tx) => ({ ...tx, companyName: namesById.get(String(tx.companyId)) || "" }));
}

// ─── Fulfillment-fee earnings (aggregated from WalletTransaction) ──────────

export async function getFulfillmentEarnings() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  if (isMongoConnected()) {
    const [totals, byCompany, daily, companies] = await Promise.all([
      WalletTransaction.aggregate([
        { $match: { type: "fulfillment_fee" } },
        { $group: { _id: null, total: { $sum: { $abs: "$amount" } }, count: { $sum: 1 } } },
      ]),
      WalletTransaction.aggregate([
        { $match: { type: "fulfillment_fee" } },
        { $group: { _id: "$companyId", total: { $sum: { $abs: "$amount" } }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      WalletTransaction.aggregate([
        { $match: { type: "fulfillment_fee", createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, total: { $sum: { $abs: "$amount" } } } },
        { $sort: { _id: 1 } },
      ]),
      Company.find({}).select("name").lean(),
    ]);
    const namesById = new Map(companies.map((c) => [String(c._id), c.name]));
    return {
      total: totals[0]?.total || 0,
      orderCount: totals[0]?.count || 0,
      byCompany: byCompany.map((row) => ({ companyId: row._id, companyName: namesById.get(String(row._id)) || "", total: row.total, count: row.count })),
      daily: daily.map((row) => ({ date: row._id, total: row.total })),
    };
  }

  const rows = [...memory.walletTransactions.values()].filter((t) => t.type === "fulfillment_fee");
  const total = rows.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const byCompanyMap = new Map();
  for (const t of rows) {
    const key = String(t.companyId);
    const entry = byCompanyMap.get(key) || { companyId: t.companyId, total: 0, count: 0 };
    entry.total += Math.abs(t.amount);
    entry.count += 1;
    byCompanyMap.set(key, entry);
  }
  const dailyMap = new Map();
  for (const t of rows) {
    if (new Date(t.createdAt) < since) continue;
    const day = new Date(t.createdAt).toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) || 0) + Math.abs(t.amount));
  }
  return {
    total,
    orderCount: rows.length,
    byCompany: [...byCompanyMap.values()].sort((a, b) => b.total - a.total),
    daily: [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, total })),
  };
}
