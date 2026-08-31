import { getOrdersInRange, getSavedCommerceData } from "./order.repo.js";
import { listExpenses, listPurchases, getFinanceSummary } from "./finance.repo.js";
import { getAdSpendTotal } from "./ad-insight.repo.js";
import { getCompany } from "./store.js";
import { toNumber } from "./memory-store.js";

// Every report generator returns { title, description, columns: [{key,label}], rows: [...] }
// so the frontend can render + CSV-export any of them the same generic way.

function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

// Shopify's financial_status values (pending/authorized/partially_paid/paid/
// partially_refunded/refunded/voided), title-cased for display. Used instead
// of ever hardcoding a status — a report showing every order as "Paid"
// regardless of its actual financialStatus is worse than showing nothing.
function paymentStatusLabel(financialStatus) {
  if (!financialStatus) return "Unknown";
  return financialStatus
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── 1. Sales Report ─────────────────────────────────────────────────────────
async function salesReport({ companyId, from, to }) {
  const { orders } = await getOrdersInRange({ companyId, from, to });
  const validOrders = orders.filter((o) => !o.cancelledAt);
  const byDay = new Map();

  for (const o of validOrders) {
    const day = fmtDate(o.shopifyCreatedAt);
    const entry = byDay.get(day) || { date: day, orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += toNumber(o.totalPrice);
    byDay.set(day, entry);
  }

  const rows = [...byDay.values()]
    .sort((a, b) => (a.date < b.date ? 1 : -1)) // latest first
    .map((r) => ({ date: r.date, orders: r.orders, revenue: round(r.revenue), aov: round(r.orders ? r.revenue / r.orders : 0) }));

  return {
    title: "Sales Report",
    description: "Daily orders, revenue, and average order value.",
    columns: [
      { key: "date", label: "Date" },
      { key: "orders", label: "Orders" },
      { key: "revenue", label: "Revenue (₹)" },
      { key: "aov", label: "AOV (₹)" },
    ],
    rows,
  };
}

// ─── 2. GST / Tax Report ─────────────────────────────────────────────────────
async function gstReport({ companyId, from, to }) {
  const [{ orders }, company] = await Promise.all([
    getOrdersInRange({ companyId, from, to }),
    getCompany(companyId),
  ]);
  const gstRate = Number(company?.taxSettings?.gstRate ?? 5);

  const rows = orders.map((o) => {
    const isCancelled = Boolean(o.cancelledAt) || o.financialStatus === "voided" || o.financialStatus === "refunded";

    if (isCancelled) {
      return {
        orderNumber: o.name || o.externalId,
        date: fmtDate(o.shopifyCreatedAt),
        taxableValue: 0,
        recordedTax: 0,
        expectedTax: 0,
        total: 0,
        status: "Cancelled",
      };
    }

    const total = round(o.totalPrice);
    const recordedTax = round(o.totalTax);
    // Shopify line-item prices in India are typically tax-inclusive — GST is
    // already baked into the total, not added on top of it. So the expected
    // tax is the portion implied *within* the total at the configured rate,
    // not subtotal × rate (which would double-count tax already included).
    const taxableValue = round(total / (1 + gstRate / 100));
    const expectedTax = round(total - taxableValue);

    return {
      orderNumber: o.name || o.externalId,
      date: fmtDate(o.shopifyCreatedAt),
      taxableValue,
      recordedTax,
      expectedTax,
      total,
      status: paymentStatusLabel(o.financialStatus),
    };
  });

  rows.sort((a, b) => (a.date < b.date ? 1 : -1)); // latest first

  return {
    title: "GST / Tax Report",
    description: `GST @ ${gstRate}% treated as inclusive in the order total (India default) — expected tax vs. what Shopify recorded, for reconciliation. Cancelled orders show ₹0.`,
    columns: [
      { key: "orderNumber", label: "Order #" },
      { key: "date", label: "Date" },
      { key: "taxableValue", label: "Taxable Value (₹)" },
      { key: "recordedTax", label: "Recorded Tax (₹)" },
      { key: "expectedTax", label: `Expected GST @ ${gstRate}% (₹)` },
      { key: "total", label: "Total (₹)" },
      { key: "status", label: "Status" },
    ],
    rows,
  };
}

// ─── 3. Expense Report ───────────────────────────────────────────────────────
async function expenseReport({ companyId, from, to }) {
  const expenses = await listExpenses({ companyId, from, to });
  const rows = expenses
    .map((e) => ({
      date: fmtDate(e.date || e.createdAt),
      category: e.category,
      description: e.description,
      amount: round(e.amount),
      paymentMethod: e.paymentMethod || "—",
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // latest first

  return {
    title: "Expense Report",
    description: "All logged business expenses in the selected period.",
    columns: [
      { key: "date", label: "Date" },
      { key: "category", label: "Category" },
      { key: "description", label: "Description" },
      { key: "amount", label: "Amount (₹)" },
      { key: "paymentMethod", label: "Payment Method" },
    ],
    rows,
  };
}

// ─── 4. Purchases / Raw Material Report ──────────────────────────────────────
async function purchaseReport({ companyId, from, to }) {
  const purchases = await listPurchases({ companyId, from, to });
  const rows = purchases
    .map((p) => ({
      date: fmtDate(p.purchaseDate || p.createdAt),
      vendor: p.vendorName || "—",
      invoiceNumber: p.invoiceNumber || "—",
      itemCount: (p.items || []).length,
      totalAmount: round(p.totalAmount),
      paymentStatus: p.paymentStatus || "—",
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // latest first

  return {
    title: "Purchases & Raw Material Report",
    description: "Vendor purchases for raw material, packaging, and supplies.",
    columns: [
      { key: "date", label: "Date" },
      { key: "vendor", label: "Vendor" },
      { key: "invoiceNumber", label: "Invoice #" },
      { key: "itemCount", label: "Items" },
      { key: "totalAmount", label: "Total (₹)" },
      { key: "paymentStatus", label: "Payment Status" },
    ],
    rows,
  };
}

// ─── 5. Profit & Loss Report ─────────────────────────────────────────────────
async function profitLossReport({ companyId, from, to }) {
  const [{ orders }, expenses, purchases, adSpend] = await Promise.all([
    getOrdersInRange({ companyId, from, to }),
    listExpenses({ companyId, from, to }),
    listPurchases({ companyId, from, to }),
    getAdSpendTotal({ companyId, from, to }).catch(() => ({ spend: 0 })),
  ]);

  const revenueOrders = orders.filter((o) => !o.cancelledAt);
  const revenue = revenueOrders.reduce((sum, o) => sum + toNumber(o.totalPrice), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);
  const totalPurchases = purchases.reduce((sum, p) => sum + toNumber(p.totalAmount), 0);
  // getAdSpendTotal returns {spend, attributedRevenue, attributedOrders} — pull .spend,
  // not the whole object (was previously coerced with toNumber() on the object itself,
  // which silently evaluated to 0 every time).
  const totalAdSpend = toNumber(adSpend?.spend);
  // Freight cost captured per-order at ship time (varies by destination/weight, so it's
  // tracked on the order rather than as a fixed per-SKU cost — see Inventory).
  const totalShipping = revenueOrders.reduce((sum, o) => sum + toNumber(o.shippingCost), 0);
  const netProfit = revenue - totalExpenses - totalPurchases - totalAdSpend - totalShipping;

  const rows = [
    { line: "Revenue (Sales)", amount: round(revenue) },
    { line: "Cost of Goods (Purchases)", amount: round(-totalPurchases) },
    { line: "Shipping Cost", amount: round(-totalShipping) },
    { line: "Operating Expenses", amount: round(-totalExpenses) },
    { line: "Ad Spend", amount: round(-totalAdSpend) },
    { line: "Net Profit", amount: round(netProfit) },
  ];

  return {
    title: "Profit & Loss Report",
    description: "Revenue minus COGS, shipping, operating expenses, and ad spend for the period.",
    columns: [
      { key: "line", label: "Line Item" },
      { key: "amount", label: "Amount (₹)" },
    ],
    rows,
  };
}

// ─── 6. Channel-wise Sales Report ────────────────────────────────────────────
async function channelReport({ companyId, from, to }) {
  const [{ orders }, { channels }] = await Promise.all([
    getOrdersInRange({ companyId, from, to }),
    getSavedCommerceData(companyId),
  ]);
  const validOrders = orders.filter((o) => !o.cancelledAt);
  const totalRevenue = validOrders.reduce((sum, o) => sum + toNumber(o.totalPrice), 0);

  // Historical/manually-imported orders (see the "historical" provider values on
  // SyncedOrder) have no live channelId to look up — group those by provider
  // instead so they still show up with a readable label instead of "Unknown".
  const PROVIDER_LABELS = { local: "Local Shop", website: "Website (Historical)", flipkart: "Flipkart", shopdeck: "Shopdeck", amazon: "Amazon", shopify: "Shopify" };

  const byChannel = new Map();
  for (const o of validOrders) {
    const key = o.channelId ? String(o.channelId) : `provider:${o.provider}`;
    const entry = byChannel.get(key) || { channelId: o.channelId ? String(o.channelId) : null, provider: o.provider, orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += toNumber(o.totalPrice);
    byChannel.set(key, entry);
  }

  const channelNameById = new Map((channels || []).map((c) => [String(c._id), c.name || c.provider]));

  const rows = [...byChannel.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((r) => ({
      channel: (r.channelId && channelNameById.get(r.channelId)) || PROVIDER_LABELS[r.provider] || "Unknown",
      orders: r.orders,
      revenue: round(r.revenue),
      share: totalRevenue ? round((r.revenue / totalRevenue) * 100) : 0,
    }));

  return {
    title: "Channel-wise Sales Report",
    description: "Revenue contribution by sales channel.",
    columns: [
      { key: "channel", label: "Channel" },
      { key: "orders", label: "Orders" },
      { key: "revenue", label: "Revenue (₹)" },
      { key: "share", label: "Share (%)" },
    ],
    rows,
  };
}

// ─── 7. Payment Method Report ────────────────────────────────────────────────
async function paymentMethodReport({ companyId, from, to }) {
  const { orders } = await getOrdersInRange({ companyId, from, to });
  const validOrders = orders.filter((o) => !o.cancelledAt);
  const totalRevenue = validOrders.reduce((sum, o) => sum + toNumber(o.totalPrice), 0);

  const cod = validOrders.filter((o) => o.isCOD);
  const prepaid = validOrders.filter((o) => !o.isCOD);

  const summarize = (label, list) => ({
    method: label,
    orders: list.length,
    revenue: round(list.reduce((sum, o) => sum + toNumber(o.totalPrice), 0)),
    share: totalRevenue ? round((list.reduce((sum, o) => sum + toNumber(o.totalPrice), 0) / totalRevenue) * 100) : 0,
  });

  return {
    title: "Payment Method Report",
    description: "COD vs Prepaid order and revenue split.",
    columns: [
      { key: "method", label: "Payment Method" },
      { key: "orders", label: "Orders" },
      { key: "revenue", label: "Revenue (₹)" },
      { key: "share", label: "Share (%)" },
    ],
    rows: [summarize("COD", cod), summarize("Prepaid", prepaid)],
  };
}

// ─── 8. Top Products Report ──────────────────────────────────────────────────
async function productReport({ companyId, from, to }) {
  const { orders } = await getOrdersInRange({ companyId, from, to });
  const validOrders = orders.filter((o) => !o.cancelledAt);

  const byProduct = new Map();
  for (const o of validOrders) {
    for (const item of o.lineItems || []) {
      const key = item.sku || item.title || "Unknown";
      const entry = byProduct.get(key) || { sku: item.sku || "—", title: item.title || "Unknown", quantity: 0, revenue: 0 };
      entry.quantity += toNumber(item.quantity || 1);
      entry.revenue += toNumber(item.price) * toNumber(item.quantity || 1);
      byProduct.set(key, entry);
    }
  }

  const rows = [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((r) => ({ sku: r.sku, title: r.title, quantity: r.quantity, revenue: round(r.revenue) }));

  return {
    title: "Product Performance Report",
    description: "Units sold and revenue by product/SKU, best sellers first.",
    columns: [
      { key: "sku", label: "SKU" },
      { key: "title", label: "Product" },
      { key: "quantity", label: "Units Sold" },
      { key: "revenue", label: "Revenue (₹)" },
    ],
    rows,
  };
}

// ─── 9. Customer Report ──────────────────────────────────────────────────────
async function customerReport({ companyId }) {
  const { customers } = await getSavedCommerceData(companyId);

  const rows = [...customers]
    .sort((a, b) => toNumber(b.totalSpent) - toNumber(a.totalSpent))
    .map((c) => ({
      name: c.name || "—",
      email: c.email || "—",
      ordersCount: toNumber(c.ordersCount),
      totalSpent: round(c.totalSpent),
      repeatCustomer: toNumber(c.ordersCount) > 1 ? "Yes" : "No",
    }));

  return {
    title: "Customer Report",
    description: "All synced customers ranked by lifetime spend, with repeat status.",
    columns: [
      { key: "name", label: "Customer" },
      { key: "email", label: "Email" },
      { key: "ordersCount", label: "Orders" },
      { key: "totalSpent", label: "Total Spent (₹)" },
      { key: "repeatCustomer", label: "Repeat Customer" },
    ],
    rows,
  };
}

// ─── 10. Cancelled & Returns Report ──────────────────────────────────────────
async function cancelledReport({ companyId, from, to }) {
  const { orders } = await getOrdersInRange({ companyId, from, to });
  const cancelled = orders.filter((o) => o.cancelledAt || o.financialStatus === "voided" || o.financialStatus === "refunded");

  const rows = cancelled
    .map((o) => ({
      orderNumber: o.name || o.externalId,
      date: fmtDate(o.cancelledAt || o.shopifyCreatedAt),
      customer: o.customerName || "—",
      amount: round(o.totalPrice),
      status: o.financialStatus || "cancelled",
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // latest first

  return {
    title: "Cancelled & Returns Report",
    description: "Orders cancelled, voided, or refunded in the selected period.",
    columns: [
      { key: "orderNumber", label: "Order #" },
      { key: "date", label: "Date" },
      { key: "customer", label: "Customer" },
      { key: "amount", label: "Amount (₹)" },
      { key: "status", label: "Status" },
    ],
    rows,
  };
}

const REPORT_GENERATORS = {
  sales: salesReport,
  gst: gstReport,
  expenses: expenseReport,
  purchases: purchaseReport,
  "profit-loss": profitLossReport,
  channel: channelReport,
  "payment-method": paymentMethodReport,
  products: productReport,
  customers: customerReport,
  cancelled: cancelledReport,
};

export const REPORT_TYPES = [
  { key: "sales", label: "Sales Report" },
  { key: "gst", label: "GST / Tax Report" },
  { key: "profit-loss", label: "Profit & Loss" },
  { key: "expenses", label: "Expense Report" },
  { key: "purchases", label: "Purchases & Raw Material" },
  { key: "channel", label: "Channel-wise Sales" },
  { key: "payment-method", label: "Payment Method Split" },
  { key: "products", label: "Product Performance" },
  { key: "customers", label: "Customer Report" },
  { key: "cancelled", label: "Cancelled & Returns" },
];

export async function generateReport({ type, companyId, from, to }) {
  const generator = REPORT_GENERATORS[type];
  if (!generator) return null;
  return generator({ companyId, from, to });
}
