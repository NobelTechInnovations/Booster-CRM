import { isMongoConnected } from "../config/database.js";
import { Vendor } from "../models/vendor.model.js";
import { Purchase } from "../models/purchase.model.js";
import { Expense } from "../models/expense.model.js";
import { memory, id, clone, now, toNumber } from "./memory-store.js";
import { getSalesTotal, getShippingCostTotal } from "./order.repo.js";
import { getAdSpendTotal } from "./ad-insight.repo.js";

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
    return Vendor.find({ companyId }).sort({ name: 1 }).lean();
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
    const vendor = await Vendor.findOneAndUpdate({ _id: vendorId, companyId }, { $set: clean }, { new: true }).lean();
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
    const vendor = await Vendor.findOneAndDelete({ _id: vendorId, companyId }).lean();
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
    companyId,
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
    const purchase = await Purchase.findOneAndUpdate({ _id: purchaseId, companyId }, { $set: clean }, { new: true }).lean();
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
    const purchase = await Purchase.findOneAndDelete({ _id: purchaseId, companyId }).lean();
    return { purchase };
  }

  const purchase = memory.purchases.get(purchaseId);
  if (!purchase || String(purchase.companyId) !== String(companyId)) return { purchase: null };
  memory.purchases.delete(purchaseId);
  return { purchase: clone(purchase) };
}

// ─── Expenses ────────────────────────────────────────────────────────────────

function cleanExpensePayload(payload = {}) {
  return {
    category: ["rent", "salary", "utilities", "packaging", "shipping", "software", "marketing", "other"].includes(payload.category)
      ? payload.category
      : "other",
    description: String(payload.description || "").trim(),
    amount: toNumber(payload.amount),
    currency: String(payload.currency || "INR").trim(),
    date: payload.date ? new Date(payload.date) : new Date(),
    paymentMethod: String(payload.paymentMethod || "").trim(),
    vendorId: payload.vendorId || undefined,
    notes: String(payload.notes || "").trim(),
  };
}

export async function listExpenses({ companyId, from, to, category }) {
  const filter = {
    companyId,
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
    const expense = await Expense.findOneAndUpdate({ _id: expenseId, companyId }, { $set: clean }, { new: true }).lean();
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
    const expense = await Expense.findOneAndDelete({ _id: expenseId, companyId }).lean();
    return { expense };
  }

  const expense = memory.expenses.get(expenseId);
  if (!expense || String(expense.companyId) !== String(companyId)) return { expense: null };
  memory.expenses.delete(expenseId);
  return { expense: clone(expense) };
}

// ─── Finance Summary ─────────────────────────────────────────────────────────

export async function getFinanceSummary({ companyId, from, to }) {
  const [sales, purchases, expenses, adSpend, shippingCost] = await Promise.all([
    getSalesTotal({ companyId, from, to }),
    listPurchases({ companyId, from, to }),
    listExpenses({ companyId, from, to }),
    getAdSpendTotal({ companyId, from, to }),
    getShippingCostTotal({ companyId, from, to }),
  ]);

  const cogs = purchases.reduce((sum, purchase) => sum + toNumber(purchase.totalAmount), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
  const revenue = toNumber(sales.revenue);
  const netProfit = revenue - cogs - expenseTotal - adSpend.spend - shippingCost;
  const margin = revenue ? (netProfit / revenue) * 100 : 0;

  return {
    revenue: Math.round(revenue),
    orders: sales.orders,
    cogs: Math.round(cogs),
    expenses: Math.round(expenseTotal),
    shippingCost: Math.round(shippingCost),
    adSpend: Math.round(adSpend.spend),
    attributedAdRevenue: Math.round(adSpend.attributedRevenue),
    netProfit: Math.round(netProfit),
    margin: Math.round(margin * 10) / 10,
    purchaseCount: purchases.length,
    expenseCount: expenses.length,
  };
}
