import mongoose from "mongoose";
import { isMongoConnected } from "../config/database.js";
import { Vendor } from "../models/vendor.model.js";
import { Purchase } from "../models/purchase.model.js";
import { Expense } from "../models/expense.model.js";
import { SyncedCustomer } from "../models/synced-customer.model.js";
import { memory, id, clone, now, toNumber } from "./memory-store.js";
import { getSalesTotal, getShippingCostTotal, getRefundedRevenueTotal, getMfgCostTotal, getSalesAnalytics, bucketKey, bucketLabel } from "./order.repo.js";
import { getAdSpendTotal, AD_GST_RATE, listAdInsights } from "./ad-insight.repo.js";

// companyId is stored as Schema.Types.Mixed across these models, so the same id
// can end up saved as a string or an ObjectId depending on the write path —
// an exact-match filter only catches one type. See the identical fix already
// applied to order.repo.js / ad-insight.repo.js for the bug this caused there.
function mixedIdFilter(idValue) {
  const str = String(idValue || "");
  return mongoose.Types.ObjectId.isValid(str) ? { $in: [str, new mongoose.Types.ObjectId(str)] } : str;
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

function cleanVendorPayload(payload = {}) {
  return {
    name: String(payload.name || "").trim(),
    category: ["raw-material", "packaging", "services", "other"].includes(payload.category) ? payload.category : "raw-material",
    contactPerson: String(payload.contactPerson || "").trim(),
    phone: String(payload.phone || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    gstin: String(payload.gstin || "").trim().toUpperCase(),
    address: String(payload.address || "").trim(),
    notes: String(payload.notes || "").trim(),
    status: payload.status === "inactive" ? "inactive" : "active",
  };
}

export async function listVendors(companyId) {
  if (isMongoConnected()) {
    return Vendor.find({ companyId: mixedIdFilter(companyId) }).sort({ name: 1 }).lean();
  }
  return [...memory.vendors.values()].filter((v) => String(v.companyId) === String(companyId)).sort((a, b) => a.name.localeCompare(b.name)).map(clone);
}

export async function createVendor({ companyId, payload }) {
  const clean = cleanVendorPayload(payload);
  if (!clean.name) return { error: "Vendor name is required" };

  if (isMongoConnected()) {
    const vendor = await Vendor.create({ companyId, ...clean });
    return { vendor: vendor.toObject() };
  }

  const vendor = { _id: id(), companyId, ...clean, createdAt: now(), updatedAt: now() };
  memory.vendors.set(vendor._id, vendor);
  return { vendor: clone(vendor) };
}

export async function updateVendor({ companyId, vendorId, payload }) {
  const clean = cleanVendorPayload(payload);
  if (!clean.name) return { error: "Vendor name is required" };

  if (isMongoConnected()) {
    const vendor = await Vendor.findOneAndUpdate({ _id: vendorId, companyId: mixedIdFilter(companyId) }, { $set: clean }, { new: true }).lean();
    if (!vendor) return { error: "Vendor not found" };
    return { vendor };
  }

  const vendor = memory.vendors.get(vendorId);
  if (!vendor || String(vendor.companyId) !== String(companyId)) return { error: "Vendor not found" };
  Object.assign(vendor, clean, { updatedAt: now() });
  return { vendor: clone(vendor) };
}

export async function deleteVendor({ companyId, vendorId }) {
  if (isMongoConnected()) {
    const vendor = await Vendor.findOneAndDelete({ _id: vendorId, companyId: mixedIdFilter(companyId) }).lean();
    return { vendor };
  }

  const vendor = memory.vendors.get(vendorId);
  if (!vendor || String(vendor.companyId) !== String(companyId)) return { vendor: null };
  memory.vendors.delete(vendorId);
  return { vendor: clone(vendor) };
}

// ─── Purchases (raw material / packaging buys from vendors) ────────────────────

function cleanPurchaseItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.name)
    .map((item) => {
      const quantity = toNumber(item.quantity);
      const unitCost = toNumber(item.unitCost);
      const totalCost = item.totalCost !== undefined ? toNumber(item.totalCost) : quantity * unitCost;

      return {
        name: String(item.name).trim(),
        category: ["sticker", "spice", "packaging", "raw-material", "other"].includes(item.category) ? item.category : "raw-material",
        quantity,
        unit: String(item.unit || "unit").trim(),
        unitCost,
        totalCost,
      };
    });
}

function cleanPurchasePayload(payload = {}) {
  const items = cleanPurchaseItems(payload.items);
  const totalAmount = payload.totalAmount !== undefined ? toNumber(payload.totalAmount) : items.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    vendorId: payload.vendorId || "",
    vendorName: String(payload.vendorName || "").trim(),
    invoiceNumber: String(payload.invoiceNumber || "").trim(),
    purchaseDate: payload.purchaseDate ? new Date(payload.purchaseDate) : new Date(),
    items,
    totalAmount,
    paymentStatus: ["paid", "partial", "unpaid"].includes(payload.paymentStatus) ? payload.paymentStatus : "unpaid",
    amountPaid: toNumber(payload.amountPaid),
    paymentMethod: String(payload.paymentMethod || "").trim(),
    notes: String(payload.notes || "").trim(),
  };
}

export async function listPurchases({ companyId, from, to, vendorId }) {
  const filter = {
    companyId: mixedIdFilter(companyId),
    ...(vendorId ? { vendorId } : {}),
    ...(from || to
      ? {
          purchaseDate: {
            ...(from ? { $gte: new Date(from) } : {}),
            ...(to ? { $lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  if (isMongoConnected()) {
    return Purchase.find(filter).sort({ purchaseDate: -1 }).lean();
  }

  return [...memory.purchases.values()]
    .filter((p) => {
      if (String(p.companyId) !== String(companyId)) return false;
      if (vendorId && String(p.vendorId) !== String(vendorId)) return false;
      if (from && new Date(p.purchaseDate) < new Date(from)) return false;
      if (to && new Date(p.purchaseDate) > new Date(to)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate))
    .map(clone);
}

export async function createPurchase({ companyId, payload }) {
  const clean = cleanPurchasePayload(payload);
  if (!clean.vendorId) return { error: "Vendor is required" };
  if (!clean.items.length) return { error: "Add at least one purchased item" };

  if (isMongoConnected()) {
    const purchase = await Purchase.create({ companyId, ...clean });
    return { purchase: purchase.toObject() };
  }

  const purchase = { _id: id(), companyId, ...clean, createdAt: now(), updatedAt: now() };
  memory.purchases.set(purchase._id, purchase);
  return { purchase: clone(purchase) };
}

export async function updatePurchase({ companyId, purchaseId, payload }) {
  const clean = cleanPurchasePayload(payload);
  if (!clean.items.length) return { error: "Add at least one purchased item" };

  if (isMongoConnected()) {
    const purchase = await Purchase.findOneAndUpdate({ _id: purchaseId, companyId: mixedIdFilter(companyId) }, { $set: clean }, { new: true }).lean();
    if (!purchase) return { error: "Purchase not found" };
    return { purchase };
  }

  const purchase = memory.purchases.get(purchaseId);
  if (!purchase || String(purchase.companyId) !== String(companyId)) return { error: "Purchase not found" };
  Object.assign(purchase, clean, { updatedAt: now() });
  return { purchase: clone(purchase) };
}

export async function deletePurchase({ companyId, purchaseId }) {
  if (isMongoConnected()) {
    const purchase = await Purchase.findOneAndDelete({ _id: purchaseId, companyId: mixedIdFilter(companyId) }).lean();
    return { purchase };
  }

  const purchase = memory.purchases.get(purchaseId);
  if (!purchase || String(purchase.companyId) !== String(companyId)) return { purchase: null };
  memory.purchases.delete(purchaseId);
  return { purchase: clone(purchase) };
}

// ─── Expenses ────────────────────────────────────────────────────────────────

function cleanSplitBetween(split) {
  if (!Array.isArray(split)) return [];
  return split
    .filter((s) => s && s.userId && toNumber(s.amount) > 0)
    .map((s) => ({
      userId: s.userId,
      userName: String(s.userName || "").trim(),
      amount: toNumber(s.amount),
    }));
}

function cleanExpensePayload(payload = {}) {
  return {
    category: ["rent", "salary", "utilities", "packaging", "shipping", "software", "marketing", "misc", "other"].includes(payload.category)
      ? payload.category
      : "other",
    description: String(payload.description || "").trim(),
    amount: toNumber(payload.amount),
    currency: String(payload.currency || "INR").trim(),
    date: payload.date ? new Date(payload.date) : new Date(),
    paymentMethod: String(payload.paymentMethod || "").trim(),
    vendorId: payload.vendorId || undefined,
    splitBetween: cleanSplitBetween(payload.splitBetween),
    notes: String(payload.notes || "").trim(),
  };
}

export async function listExpenses({ companyId, from, to, category }) {
  const filter = {
    companyId: mixedIdFilter(companyId),
    ...(category ? { category } : {}),
    ...(from || to
      ? {
          date: {
            ...(from ? { $gte: new Date(from) } : {}),
            ...(to ? { $lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  if (isMongoConnected()) {
    return Expense.find(filter).sort({ date: -1 }).lean();
  }

  return [...memory.expenses.values()]
    .filter((e) => {
      if (String(e.companyId) !== String(companyId)) return false;
      if (category && e.category !== category) return false;
      if (from && new Date(e.date) < new Date(from)) return false;
      if (to && new Date(e.date) > new Date(to)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(clone);
}

// Totals per partner/director across the given period — sums each person's
// share from splitBetween. An expense with no split contributes nothing here
// (shows up as "unassigned" in the UI) rather than being guessed at.
export async function getExpensesByPartner({ companyId, from, to }) {
  const expenses = await listExpenses({ companyId, from, to });
  const byUser = new Map();
  let unassignedTotal = 0;
  let unassignedCount = 0;

  for (const expense of expenses) {
    const splits = expense.splitBetween || [];
    if (!splits.length) {
      unassignedTotal += toNumber(expense.amount);
      unassignedCount += 1;
      continue;
    }
    for (const split of splits) {
      const key = String(split.userId);
      const entry = byUser.get(key) || { userId: split.userId, userName: split.userName || "Unknown", total: 0, count: 0 };
      entry.total += toNumber(split.amount);
      entry.count += 1;
      byUser.set(key, entry);
    }
  }

  return {
    byPartner: [...byUser.values()].sort((a, b) => b.total - a.total),
    unassigned: { total: unassignedTotal, count: unassignedCount },
  };
}

export async function createExpense({ companyId, payload, createdBy }) {
  const clean = cleanExpensePayload(payload);
  if (!clean.amount) return { error: "Expense amount is required" };

  if (isMongoConnected()) {
    const expense = await Expense.create({ companyId, createdBy, ...clean });
    return { expense: expense.toObject() };
  }

  const expense = { _id: id(), companyId, createdBy, ...clean, createdAt: now(), updatedAt: now() };
  memory.expenses.set(expense._id, expense);
  return { expense: clone(expense) };
}

export async function updateExpense({ companyId, expenseId, payload }) {
  const clean = cleanExpensePayload(payload);
  if (!clean.amount) return { error: "Expense amount is required" };

  if (isMongoConnected()) {
    const expense = await Expense.findOneAndUpdate({ _id: expenseId, companyId: mixedIdFilter(companyId) }, { $set: clean }, { new: true }).lean();
    if (!expense) return { error: "Expense not found" };
    return { expense };
  }

  const expense = memory.expenses.get(expenseId);
  if (!expense || String(expense.companyId) !== String(companyId)) return { error: "Expense not found" };
  Object.assign(expense, clean, { updatedAt: now() });
  return { expense: clone(expense) };
}

export async function deleteExpense({ companyId, expenseId }) {
  if (isMongoConnected()) {
    const expense = await Expense.findOneAndDelete({ _id: expenseId, companyId: mixedIdFilter(companyId) }).lean();
    return { expense };
  }

  const expense = memory.expenses.get(expenseId);
  if (!expense || String(expense.companyId) !== String(companyId)) return { expense: null };
  memory.expenses.delete(expenseId);
  return { expense: clone(expense) };
}

// ─── Meta ad spend ──────────────────────────────────────────────────────────
// Ad spend used to get mirrored into the Expense ledger as one auto-generated
// row per calendar day (source:"meta-ad-sync") so it was "visible" there —
// in practice this just cluttered the expense list with rows nobody typed in,
// on top of ad spend that isn't necessarily money that's actually left the
// business yet (it may be running on a card not yet reconciled). Retired:
// Meta ad spend is now purely an informational figure (getAdSpendTotal below,
// refreshed once daily — see meta.service.js's getMetaAdSpendToday for the
// live on-demand check that deliberately does NOT persist anywhere) and never
// enters the Expense ledger or its totals at all. If money was genuinely paid
// out for ads, that's a normal manual Expense entry (category "marketing")
// like any other cost — nothing auto-creates it.

// ─── Combined trend (revenue + expenses + ad spend, same period buckets) ──────

// Merges revenue (from sales analytics), general expenses (ledger only — excludes
// the meta-ad-sync mirror rows so ad spend isn't counted twice), and Meta ad spend
// (GST-inclusive) into one array of {period, revenue, orders, expenses, adSpend}
// bucketed the same day/week/month way as the Sales Analytics trend, so a single
// chart can plot all three series against the same x-axis.
export async function getFinanceTrend({ companyId, from, to, groupBy = "day" }) {
  const [analytics, expenses, adInsights] = await Promise.all([
    getSalesAnalytics({ companyId, from, to, groupBy }),
    listExpenses({ companyId, from, to }),
    listAdInsights({ companyId, from, to }),
  ]);

  const buckets = new Map();
  for (const point of analytics.trend) {
    buckets.set(point.key, { key: point.key, period: point.period, revenue: point.revenue, orders: point.orders, expenses: 0, adSpend: 0 });
  }

  const getOrInitBucket = (date) => {
    const key = bucketKey(date, groupBy);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, period: bucketLabel(key, groupBy), revenue: 0, orders: 0, expenses: 0, adSpend: 0 };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const expense of expenses) {
    if (expense.source === "meta-ad-sync") continue;
    getOrInitBucket(expense.date).expenses += toNumber(expense.amount);
  }

  for (const row of adInsights) {
    getOrInitBucket(row.date).adSpend += toNumber(row.spend) * (1 + AD_GST_RATE);
  }

  const trend = [...buckets.values()]
    .sort((a, b) => (a.key > b.key ? 1 : -1))
    .map((b) => ({ ...b, expenses: Math.round(b.expenses), adSpend: Math.round(b.adSpend) }));

  return { trend, currency: analytics.totals.currency };
}

// ─── Finance Summary ─────────────────────────────────────────────────────────

export async function getFinanceSummary({ companyId, from, to }) {
  const [sales, purchases, expenses, adSpend, shippingCost, refundedRevenue, mfgCost] = await Promise.all([
    getSalesTotal({ companyId, from, to }),
    listPurchases({ companyId, from, to }),
    listExpenses({ companyId, from, to }),
    getAdSpendTotal({ companyId, from, to }),
    getShippingCostTotal({ companyId, from, to }),
    getRefundedRevenueTotal({ companyId, from, to }),
    getMfgCostTotal({ companyId, from, to }),
  ]);

  // All money totals below (expenses, marketing spend, net profit) come
  // purely from the manually-logged Expense ledger — what the user actually
  // recorded as paid, splitBetween and all. Meta's live API spend (adSpend
  // below) is deliberately NEVER added into any of these totals — it's
  // reported ad delivery, not confirmed payment, and the user already logs
  // the real payment as its own Expense entry when they actually pay Meta
  // (e.g. a ₹7,080 top-up on a given date). Combining both used to double-
  // count: "Marketing Spend" showed the manual entry PLUS Meta's separately-
  // tracked live number on top of it, even though the manual entry already
  // *was* that spend. Meta's number stays visible on its own "Meta Ad Spend"
  // card purely so it can be checked against — it never feeds a total here.
  const cogs = purchases.reduce((sum, purchase) => sum + toNumber(purchase.totalAmount), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
  const marketingExpenseTotal = expenses.filter((e) => e.category === "marketing").reduce((sum, e) => sum + toNumber(e.amount), 0);
  // Shopify ships through a prepaid courier wallet (top up in bulk, courier
  // deducts per shipment) — there's no real per-order figure to trust, so its
  // shipping cost is logged as a lump-sum "shipping" Expense (the recharge
  // amount) instead of per-order. `shippingCost` (param above) is Amazon-only
  // — real per-order figures fixed at import (see getShippingCostTotal).
  // Combined for display since both are real, disjoint sources; NOT double
  // counted in netProfit below since the shipping-category expense is already
  // inside expenseTotal once — only the Amazon-only piece is added on top.
  const shippingExpenseTotal = expenses.filter((e) => e.category === "shipping").reduce((sum, e) => sum + toNumber(e.amount), 0);
  const totalShippingCost = shippingCost + shippingExpenseTotal;
  // "Other Expenses" = everything NOT already broken out onto its own card
  // (marketing, shipping) — it used to be "expenseTotal minus marketing"
  // only, which meant a shipping-category expense (the Shopify wallet
  // recharge) showed up in BOTH the Shipping Cost card AND here, at the same
  // value, with nothing to explain why. Excluding shipping here too means
  // every rupee in expenseTotal now appears on exactly one category card.
  const otherExpenseTotal = expenseTotal - marketingExpenseTotal - shippingExpenseTotal;
  const marketingExpenseCount = expenses.filter((e) => e.category === "marketing").length;
  const shippingExpenseCount = expenses.filter((e) => e.category === "shipping").length;
  const otherExpenseCount = expenses.length - marketingExpenseCount - shippingExpenseCount;
  // Ad spend grossed up by Meta's 18% GST — shown on the separate Meta Ad
  // Spend card as the real all-in cost, even though Meta's own dashboard
  // only shows the pre-GST "spend" figure. Not summed into marketingSpend.
  const adSpendWithGst = adSpend.spendWithGst ?? adSpend.spend * (1 + AD_GST_RATE);
  const marketingSpend = marketingExpenseTotal;
  const revenue = toNumber(sales.revenue);
  const grossProfit = revenue - cogs;
  const netProfit = revenue - cogs - expenseTotal - shippingCost;
  const margin = revenue ? (netProfit / revenue) * 100 : 0;

  return {
    revenue: Math.round(revenue),
    orders: sales.orders,
    cogs: Math.round(cogs),
    grossProfit: Math.round(grossProfit),
    // Every rupee logged in the Expense ledger, regardless of category —
    // "Total Expense" card. marketingExpenses + shippingExpense + otherExpenses
    // always sums back to exactly this.
    expenses: Math.round(expenseTotal),
    marketingExpenses: Math.round(marketingExpenseTotal),
    marketingExpenseCount,
    shippingExpenseCount,
    otherExpenses: Math.round(otherExpenseTotal),
    otherExpenseCount,
    marketingSpend: Math.round(marketingSpend),
    // Amazon-only real per-order figure (also the piece actually subtracted
    // in netProfit — see comment above).
    shippingCost: Math.round(shippingCost),
    // Shopify's wallet-recharge total, already inside `expenses` above.
    shippingExpense: Math.round(shippingExpenseTotal),
    // Amazon + Shopify combined — what the "Shipping Cost" KPI card shows.
    totalShippingCost: Math.round(totalShippingCost),
    adSpend: Math.round(adSpend.spend),
    adSpendGst: Math.round(adSpend.gstAmount ?? adSpend.spend * AD_GST_RATE),
    adSpendWithGst: Math.round(adSpendWithGst),
    attributedAdRevenue: Math.round(adSpend.attributedRevenue),
    refundedRevenue: Math.round(refundedRevenue),
    mfgCost: Math.round(mfgCost.total),
    mfgCostedUnits: mfgCost.costedUnits,
    mfgUncostedUnits: mfgCost.uncostedUnits,
    netProfit: Math.round(netProfit),
    margin: Math.round(margin * 10) / 10,
    purchaseCount: purchases.length,
    expenseCount: expenses.length,
  };
}

// ─── Unit Economics ──────────────────────────────────────────────────────────

// A customer counts as "new" in this range if Shopify/Amazon created their
// customer record inside it — shopifyCreatedAt on SyncedCustomer is stamped
// at their first checkout on that store in the overwhelming majority of
// cases, so this is a real signal, not a guess. Used only for CAC.
async function getNewCustomersCount({ companyId, from, to }) {
  const { start, end } = parseSummaryRange({ from, to });
  const filter = {
    companyId: mixedIdFilter(companyId),
    shopifyCreatedAt: { $gte: start, $lte: end },
  };

  if (isMongoConnected()) {
    return SyncedCustomer.countDocuments(filter);
  }
  return [...memory.customers.values()].filter(
    (c) => String(c.companyId) === String(companyId) && c.shopifyCreatedAt && new Date(c.shopifyCreatedAt) >= start && new Date(c.shopifyCreatedAt) <= end,
  ).length;
}

function parseSummaryRange({ from, to }) {
  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = from ? new Date(from) : new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

// The standard DTC/ecommerce contribution-margin waterfall, built entirely
// from getFinanceSummary's already-reconciled numbers — nothing here is a
// second, independently-computed figure that could drift out of sync with
// the KPI cards above.
//
//   Revenue
//   − COGS                        = Gross Profit
//   − Total Shipping Cost         = CM1  (contribution after variable fulfillment cost)
//   − Marketing Spend             = CM2  (contribution after variable acquisition cost)
//   − Other (fixed) Expenses      = EBITDA
//
// EBITDA always equals Net Profit in this system: nothing here tracks
// interest, tax, depreciation, or amortization separately, so there's no
// second adjustment layer between them — shown as one number with that
// explained rather than pretending they're independently derived.
export async function getUnitEconomics({ companyId, from, to }) {
  const [summary, newCustomers] = await Promise.all([
    getFinanceSummary({ companyId, from, to }),
    getNewCustomersCount({ companyId, from, to }),
  ]);

  const { revenue, orders, cogs, grossProfit, totalShippingCost, marketingSpend, otherExpenses, netProfit, margin } = summary;

  const cm1 = grossProfit - totalShippingCost;
  const cm2 = cm1 - marketingSpend;
  const ebitda = cm2 - otherExpenses; // === netProfit, see comment above

  const pct = (value) => (revenue ? Math.round((value / revenue) * 1000) / 10 : 0);
  const perOrder = (value) => (orders ? Math.round((value / orders) * 100) / 100 : 0);

  return {
    revenue,
    orders,
    aov: perOrder(revenue),
    newCustomers,
    cac: newCustomers ? Math.round((marketingSpend / newCustomers) * 100) / 100 : null,
    cogs,
    cogsPerOrder: perOrder(cogs),
    grossProfit,
    grossMargin: pct(grossProfit),
    totalShippingCost,
    shippingPerOrder: perOrder(totalShippingCost),
    cm1,
    cm1Margin: pct(cm1),
    marketingSpend,
    cm2,
    cm2Margin: pct(cm2),
    otherExpenses,
    ebitda,
    ebitdaMargin: pct(ebitda),
    netProfit,
    margin,
    waterfall: [
      { stage: "Revenue", value: revenue },
      { stage: "COGS", value: -cogs },
      { stage: "Gross Profit", value: grossProfit, isSubtotal: true },
      { stage: "Shipping", value: -totalShippingCost },
      { stage: "CM1", value: cm1, isSubtotal: true },
      { stage: "Marketing", value: -marketingSpend },
      { stage: "CM2", value: cm2, isSubtotal: true },
      { stage: "Other Opex", value: -otherExpenses },
      { stage: "EBITDA", value: ebitda, isSubtotal: true },
    ],
  };
}
