"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BadgeIndianRupee,
  Boxes,
  ChartNoAxesCombined,
  Check,
  ChevronsUpDown,
  Coins,
  Eye,
  Factory,
  Image as ImageIcon,
  Link2,
  Megaphone,
  MousePointerClick,
  Gauge,
  Layers,
  Package,
  Pencil,
  Percent,
  PiggyBank,
  Plus,
  Receipt,
  RefreshCw,
  Repeat,
  RotateCcw,
  Scale,
  Store,
  Target,
  UserPlus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  connectMetaAds,
  createExpense,
  createPurchase,
  createVendor,
  deleteExpense,
  deletePurchase,
  deleteVendor,
  getAdsSummary,
  getExpensesByPartner,
  getFinanceSummary,
  getFinanceTrend,
  getUnitEconomics,
  getMetaAdSpendToday,
  getSalesAnalytics,
  linkAdProduct,
  listAdsChannels,
  listExpenses,
  listMetaAdAccounts,
  listPurchases,
  listRefundedOrders,
  listShippingCosts,
  updateOrderShippingCost,
  listUsers,
  listVendors,
  recomputeAdAttribution,
  selectMetaAdAccount,
  syncAdInsights,
  updateExpense,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "overview", label: "Overview", icon: ChartNoAxesCombined },
  { key: "sales", label: "Sales Analytics", icon: TrendingUp },
  { key: "expenses", label: "Expenses", icon: Wallet },
  { key: "purchases", label: "Vendors & Purchases", icon: Boxes },
  { key: "ads", label: "Ad Spend (Meta)", icon: Target },
];

const rangePresets = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "month", label: "This Month" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "90d", label: "Last 90 Days" },
  { key: "lifetime", label: "Lifetime" },
  { key: "custom", label: "Custom Range" },
];

// Arbitrarily early — no real business data predates this, so it's a safe
// stand-in for "no lower bound" without needing a separate backend code path.
const LIFETIME_START = "2000-01-01";

// toISOString() converts to UTC first — for any timezone ahead of UTC (e.g. IST,
// +5:30), local midnight becomes the *previous* day in UTC, silently shifting every
// "Today"/"Yesterday"/etc. preset back by one day. Format from local date parts instead.
function isoDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveRange(preset, custom) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === "today") return { from: isoDay(today), to: isoDay(today) };

  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { from: isoDay(y), to: isoDay(y) };
  }

  if (preset === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay());
    return { from: isoDay(start), to: isoDay(today) };
  }

  if (preset === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: isoDay(start), to: isoDay(today) };
  }

  if (preset === "lifetime") return { from: LIFETIME_START, to: isoDay(today) };

  if (preset === "custom") {
    return { from: custom?.from || LIFETIME_START, to: custom?.to || isoDay(today) };
  }

  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { from: isoDay(start), to: isoDay(today) };
}

function formatMoney(value, currency = "INR") {
  const num = Number(value || 0);
  const formatted = num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === "INR") {
    return `₹${formatted}`;
  }
  return `${currency} ${formatted}`;
}

// Used to abbreviate to "₹6k" / "₹1.2L" on chart axes/tooltips — per
// explicit request, no more abbreviation anywhere: full value with decimals,
// same as formatMoney. Kept as a separate name only so the chart call sites
// below don't need touching.
function formatCompact(value) {
  return formatMoney(value);
}

const tileAccent = {
  green: "from-emerald-500 to-emerald-400",
  amber: "from-amber-500 to-amber-400",
  rose: "from-rose-500 to-rose-400",
  blue: "from-blue-500 to-blue-400",
  indigo: "from-indigo-500 to-indigo-400",
  slate: "from-slate-400 to-slate-300",
};

const tileIconTone = {
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
  blue: "bg-blue-50 text-blue-700",
  indigo: "bg-[var(--primary-soft)] text-[var(--primary)]",
  slate: "bg-slate-100 text-slate-600",
};

function KpiTile({ label, value, sub, tone = "slate", icon: Icon, onClick, calc }) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden p-4 text-left hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_32px_-18px_rgba(15,23,42,0.22)]",
        onClick && "cursor-pointer transition hover:-translate-y-0.5 hover:border-indigo-200",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
      <div className={cn("absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r", tileAccent[tone] || tileAccent.slate)} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-[var(--muted)]">{label}</p>
          <p className="mt-2 text-[26px] font-bold leading-none tracking-tight text-slate-950">{value}</p>
        </div>
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", tileIconTone[tone] || tileIconTone.slate)}>
          <Icon size={18} />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        {sub ? <Badge tone={tone}>{sub}</Badge> : <span />}
        {onClick ? <span className="text-[11px] font-semibold text-indigo-600">View entries →</span> : null}
      </div>
      {calc ? <p className="mt-2.5 border-t border-slate-100 pt-2 text-[11px] leading-4 text-slate-400">{calc}</p> : null}
    </Card>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[var(--line)] bg-white p-3 text-sm shadow-lg">
      <p className="mb-2 font-semibold">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === "number" && entry.dataKey !== "orders" ? formatCompact(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

function RangeControls({ preset, setPreset, custom, setCustom, groupBy, setGroupBy, onRefresh, isLoading }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {rangePresets.map((item) => (
          <button
            key={item.key}
            onClick={() => setPreset(item.key)}
            className={cn(
              "h-8 rounded-lg px-2.5 text-xs font-semibold transition-all",
              preset === item.key
                ? "bg-gradient-to-b from-[#4338ca] to-[var(--primary)] text-white shadow-[0_3px_8px_-2px_rgba(55,48,163,0.55)]"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {preset === "custom" ? (
        <div className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <input
            type="date"
            className="h-8 rounded-lg border-0 bg-transparent px-2 text-xs font-semibold text-slate-700 outline-none"
            value={custom.from}
            max={custom.to}
            onChange={(event) => setCustom((c) => ({ ...c, from: event.target.value }))}
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            className="h-8 rounded-lg border-0 bg-transparent px-2 text-xs font-semibold text-slate-700 outline-none"
            value={custom.to}
            min={custom.from}
            onChange={(event) => setCustom((c) => ({ ...c, to: event.target.value }))}
          />
        </div>
      ) : null}
      <select
        className="h-9 rounded-md border border-[var(--line)] bg-white px-2.5 text-xs font-semibold outline-none focus:border-[var(--primary)]"
        value={groupBy}
        onChange={(event) => setGroupBy(event.target.value)}
      >
        <option value="day">Day wise</option>
        <option value="week">Week wise</option>
        <option value="month">Month wise</option>
      </select>
      <Button variant="secondary" className="h-9" onClick={onRefresh} disabled={isLoading}>
        <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        Refresh
      </Button>
    </div>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cn("max-h-[90vh] w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-xl", wide ? "max-w-2xl" : "max-w-md")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  );
}

const fieldClass =
  "mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]";

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ range, groupBy, summary, analytics, trend, economics, isLoading, onNavigate }) {
  const currency = analytics?.totals?.currency || "INR";
  const [showRefunds, setShowRefunds] = useState(false);
  const [refundOrders, setRefundOrders] = useState(null);
  const [refundsLoading, setRefundsLoading] = useState(false);
  const [showShipping, setShowShipping] = useState(false);
  const [shippingOrders, setShippingOrders] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [editingShipId, setEditingShipId] = useState(null);
  const [editingShipValue, setEditingShipValue] = useState("");
  const [savingShipId, setSavingShipId] = useState(null);

  // Fetch whenever the panel is open AND whenever range changes while it's
  // already open — not just once on first open. That used to only fetch on
  // the open click, so switching the date range (Today -> This Month, etc.)
  // while a panel was already open kept showing the OLD range's rows with
  // no way to refresh short of closing and reopening.
  useEffect(() => {
    if (!showRefunds) return;
    setRefundsLoading(true);
    listRefundedOrders(range).then((res) => setRefundOrders(res.orders || [])).finally(() => setRefundsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRefunds, range.from, range.to]);

  useEffect(() => {
    if (!showShipping) return;
    setShippingLoading(true);
    listShippingCosts(range).then((res) => setShippingOrders(res.orders || [])).finally(() => setShippingLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showShipping, range.from, range.to]);

  function toggleRefunds() {
    setShowRefunds((v) => !v);
  }

  function toggleShipping() {
    setShowShipping((v) => !v);
  }

  function startEditShip(order) {
    setEditingShipId(order._id || order.id);
    setEditingShipValue(String(order.shippingCost || ""));
  }

  async function saveShipCost(order) {
    const orderId = order.externalId || order._id || order.id;
    setSavingShipId(orderId);
    try {
      const res = await updateOrderShippingCost(orderId, Number(editingShipValue) || 0);
      setShippingOrders((prev) => prev.map((o) => ((o._id || o.id) === (order._id || order.id) ? res.order : o)));
      setEditingShipId(null);
    } finally {
      setSavingShipId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Total Revenue" value={formatMoney(summary?.revenue, currency)} sub={`${summary?.orders ?? 0} orders`} tone="green" icon={BadgeIndianRupee}
          onClick={() => onNavigate("sales")}
          calc="Sum of totalPrice across every non-cancelled order in this range."
        />
        <KpiTile
          label="Inventory Purchases" value={formatMoney(summary?.cogs, currency)} sub={`${summary?.purchaseCount ?? 0} purchases`} tone="amber" icon={Boxes}
          onClick={() => onNavigate("purchases")}
          calc="Sum of totalAmount across every vendor/raw-material purchase logged in this range."
        />
        <KpiTile
          label="Gross Profit (on sales)"
          value={formatMoney(summary?.grossProfit, currency)}
          sub="revenue − purchases"
          tone={Number(summary?.grossProfit) >= 0 ? "green" : "rose"}
          icon={PiggyBank}
          calc="Total Revenue − Inventory Purchases. Doesn't subtract expenses, ad spend, or shipping — see Net Period Profit for that."
        />
        <KpiTile
          label="Mfg Cost (Items Sold)"
          value={formatMoney(summary?.mfgCost, currency)}
          sub={summary?.mfgUncostedUnits ? `${summary.mfgUncostedUnits} units missing cost` : `${summary?.mfgCostedUnits ?? 0} units costed`}
          tone={summary?.mfgUncostedUnits ? "amber" : "slate"}
          icon={Factory}
          calc="Sum of (SKU buying price × qty sold) for line items in this range, using prices set in Inventory & Costing. SKUs with no cost set contribute ₹0 — never a guess."
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile
          label="Total Expense" value={formatMoney(summary?.expenses, currency)} sub={`${summary?.expenseCount ?? 0} entries total`} tone="slate" icon={Wallet}
          onClick={() => onNavigate("expenses")}
          calc="Every rupee in the Expense ledger, every category combined — Marketing Spend + Shipping Cost's wallet-recharge piece + Other Expenses always sum back to exactly this number."
        />
        <KpiTile
          label="Marketing Spend" value={formatMoney(summary?.marketingSpend, currency)} sub={`${summary?.marketingExpenseCount ?? 0} entries · logged expenses only`} tone="indigo" icon={Megaphone}
          onClick={() => onNavigate("expenses", "marketing")}
          calc="Sum of every manually-logged Expense tagged 'marketing' in this range — exactly what you've recorded as actually paid. Meta's live API spend (see the separate Meta Ad Spend card) is NOT added on top of this — log the real payment yourself when you actually pay, or it won't count here."
        />
        <KpiTile
          label="Shipping Cost" value={formatMoney(summary?.totalShippingCost, currency)} sub="Amazon per-order + Shopify wallet recharge" tone="blue" icon={Truck}
          onClick={toggleShipping}
          calc={`Amazon: real per-order shipping fee, fixed at import (₹${(summary?.shippingCost ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}). Shopify ships through a prepaid courier wallet — the courier deducts per shipment, so there's no clean per-order figure — its cost instead comes from every "Shipping" category Expense (wallet recharge amounts you log manually, ₹${(summary?.shippingExpense ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}, ${summary?.shippingExpenseCount ?? 0} entries). This whole amount is already inside Total Expense above — only the Amazon-only piece is subtracted again separately in Net Profit below, so it's never double counted.`}
        />
        <KpiTile
          label="Other Expenses" value={formatMoney(summary?.otherExpenses, currency)} sub={`${summary?.otherExpenseCount ?? 0} entries · not marketing or shipping`} tone="rose" icon={Receipt}
          onClick={() => onNavigate("expenses", "other")}
          calc="Sum of every manually-logged Expense that is NOT tagged 'marketing' and NOT tagged 'shipping' — those two already have their own cards above, so they're excluded here instead of being shown twice."
        />
        <KpiTile
          label="Refunded/Returned Revenue"
          value={formatMoney(summary?.refundedRevenue, currency)}
          sub="excluded from Total Revenue"
          tone={summary?.refundedRevenue ? "amber" : "slate"}
          icon={RotateCcw}
          onClick={toggleRefunds}
          calc="Sum of totalPrice for orders that are cancelled, whose payment status is refunded/voided, or that a courier tagged rto/rto_initiated (Return to Origin — bounced back undelivered) in this range. Shopify test orders never enter this or any other total."
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Net Period Profit (cash flow)"
          value={formatMoney(summary?.netProfit, currency)}
          sub={`${summary?.margin ?? 0}% margin`}
          tone={Number(summary?.netProfit) >= 0 ? "green" : "rose"}
          icon={Number(summary?.netProfit) >= 0 ? TrendingUp : TrendingDown}
          calc="Total Revenue − Inventory Purchases − all logged Expenses (marketing + other, which already includes Shopify's shipping-wallet recharges) − Amazon's real per-order shipping cost. Meta's live API spend is not subtracted here — only what you've logged as actually paid counts. Margin = Net Profit ÷ Revenue."
        />
        <KpiTile
          label="Avg Order Value" value={formatMoney(analytics?.totals?.aov, currency)} sub={groupBy} tone="blue" icon={ChartNoAxesCombined}
          onClick={() => onNavigate("sales")}
          calc="Total Revenue ÷ Total Orders in this range."
        />
        <KpiTile
          label="Total Orders" value={(analytics?.totals?.orders ?? 0).toLocaleString("en-IN")} sub="in selected range" tone="blue" icon={Package}
          onClick={() => onNavigate("sales")}
          calc="Count of non-cancelled orders in this range."
        />
        <KpiTile
          label="Meta Ad Spend" value={formatMoney(summary?.adSpend, currency)} sub="Ads tab for ROAS" tone="indigo" icon={Target}
          onClick={() => onNavigate("ads")}
          calc="Sum of daily spend reported by Meta's Insights API for your connected ad account(s) in this range — pre-GST. Updates once a day at 8am; use Check Today on the Ads tab for a live (unsaved) look."
        />
      </div>

      {showRefunds ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Refunded / Returned Orders</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">Cancelled, refunded, voided, or courier-RTO'd orders in this range — kept out of Total Revenue.</p>
            </div>
            <button onClick={() => setShowRefunds(false)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
              <X size={18} />
            </button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {refundsLoading ? (
              <p className="text-sm text-[var(--muted)]">Loading...</p>
            ) : !refundOrders?.length ? (
              <p className="text-sm text-[var(--muted)]">No refunded/cancelled orders in this range.</p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-xs uppercase text-slate-500">
                    <th className="py-3 pr-4 font-semibold">Order</th>
                    <th className="py-3 pr-4 font-semibold">Customer</th>
                    <th className="py-3 pr-4 font-semibold">Status</th>
                    <th className="py-3 pr-4 font-semibold">Date</th>
                    <th className="py-3 pr-0 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {refundOrders.map((o) => (
                    <tr key={o._id || o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="py-3 pr-4 font-semibold text-slate-900">{o.name}</td>
                      <td className="py-3 pr-4">{o.customerName || "-"}</td>
                      <td className="py-3 pr-4">
                        <Badge tone={o.returnReason === "rto" ? "rose" : "amber"}>
                          {o.returnReason === "rto" ? "RTO" : o.cancelledAt ? "Cancelled" : o.financialStatus}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">{new Date(o.cancelledAt || o.shopifyCreatedAt).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 pr-0 text-right font-bold text-rose-700">{formatMoney(o.totalPrice, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {showShipping ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Shipping Cost by Order (Amazon)</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Amazon orders only — these carry a real fixed shipping fee. "Auto" = captured when shipped via this panel. "Manual" = typed in.
                Click the amount to fill in or correct it. Shopify orders don't appear here — its shipping runs on a prepaid courier wallet with no
                real per-order figure, so that cost is logged as a lump-sum "Shipping" expense instead —{" "}
                <button className="font-semibold text-indigo-700 hover:underline" onClick={() => onNavigate("expenses", "shipping")}>
                  view/add it in Expenses
                </button>.
              </p>
            </div>
            <button onClick={() => setShowShipping(false)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
              <X size={18} />
            </button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {shippingLoading ? (
              <p className="text-sm text-[var(--muted)]">Loading...</p>
            ) : !shippingOrders?.length ? (
              <p className="text-sm text-[var(--muted)]">No orders in this range.</p>
            ) : (
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-xs uppercase text-slate-500">
                    <th className="py-3 pr-4 font-semibold">Order</th>
                    <th className="py-3 pr-4 font-semibold">Date</th>
                    <th className="py-3 pr-4 font-semibold">Provider</th>
                    <th className="py-3 pr-4 font-semibold">Source</th>
                    <th className="py-3 pr-0 text-right font-semibold">Shipping Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {shippingOrders.map((o) => {
                    const rowId = o._id || o.id;
                    const orderId = o.externalId || rowId;
                    const isEditing = editingShipId === rowId;
                    return (
                      <tr key={rowId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                        <td className="py-3 pr-4 font-semibold text-slate-900">{o.name}</td>
                        <td className="py-3 pr-4">{new Date(o.shopifyCreatedAt).toLocaleDateString("en-IN")}</td>
                        <td className="py-3 pr-4 text-slate-600">{o.shippingProvider || "-"}</td>
                        <td className="py-3 pr-4">
                          {o.shippingCostSource === "auto" ? <Badge tone="blue">Auto</Badge>
                            : o.shippingCostSource === "manual" ? <Badge tone="indigo">Manual</Badge>
                            : <Badge tone="slate">Unset</Badge>}
                        </td>
                        <td className="py-3 pr-0 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number" min="0" step="0.01" autoFocus
                                value={editingShipValue}
                                onChange={(e) => setEditingShipValue(e.target.value)}
                                className="h-8 w-24 rounded-md border border-[var(--line)] px-2 text-right text-sm outline-none focus:border-[var(--primary)]"
                              />
                              <Button className="h-8 px-2.5 text-xs" disabled={savingShipId === orderId} onClick={() => saveShipCost(o)}>Save</Button>
                              <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => setEditingShipId(null)} aria-label="Cancel"><X size={14} /></button>
                            </div>
                          ) : (
                            <button className="font-bold text-slate-900 hover:text-indigo-700 hover:underline" onClick={() => startEditShip(o)}>
                              {formatMoney(o.shippingCost, currency)}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Revenue vs. Expenses vs. Ad Spend</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {range.from} to {range.to}, grouped {groupBy}-wise. Ad spend includes Meta's 18% GST.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend || []} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="financeSalesGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#3730a3" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3730a3" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e5eaf1" vertical={false} />
                <XAxis dataKey="period" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} width={56} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3730a3" fill="url(#financeSalesGradient)" strokeWidth={3} />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#e11d48" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="adSpend" name="Ad Spend (incl. GST)" stroke="#0891b2" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Unit Economics</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Built entirely from the KPI cards above — nothing here is a second, independently-computed number that could drift out of sync.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiTile
              label="Avg Order Value" value={formatMoney(economics?.aov, currency)} sub={`${economics?.orders ?? 0} orders`} tone="blue" icon={ChartNoAxesCombined}
              calc="Total Revenue ÷ Total Orders in this range."
            />
            <KpiTile
              label="CAC (Customer Acquisition Cost)"
              value={economics?.cac == null ? "—" : formatMoney(economics.cac, currency)}
              sub={`${economics?.newCustomers ?? 0} new customers`}
              tone="indigo" icon={UserPlus}
              calc="Marketing Spend ÷ new customers in this range. A customer counts as new when Shopify/Amazon created their customer record inside this range (their first checkout, in the vast majority of cases) — not a guess. Shows — when there are 0 new customers (can't divide by zero)."
            />
            <KpiTile
              label="CM1 (after fulfillment)"
              value={formatMoney(economics?.cm1, currency)}
              sub={`${economics?.cm1Margin ?? 0}% of revenue`}
              tone={Number(economics?.cm1) >= 0 ? "green" : "rose"} icon={Layers}
              calc="Gross Profit (Revenue − COGS) − Total Shipping Cost. What's left after making and shipping the product, before spending anything to acquire the sale."
            />
            <KpiTile
              label="CM2 (after marketing)"
              value={formatMoney(economics?.cm2, currency)}
              sub={`${economics?.cm2Margin ?? 0}% of revenue`}
              tone={Number(economics?.cm2) >= 0 ? "green" : "rose"} icon={Scale}
              calc="CM1 − Marketing Spend. What's left after also paying to acquire the sale, before fixed overhead (rent, salaries, software, etc)."
            />
            <KpiTile
              label="EBITDA"
              value={formatMoney(economics?.ebitda, currency)}
              sub={`${economics?.ebitdaMargin ?? 0}% margin`}
              tone={Number(economics?.ebitda) >= 0 ? "green" : "rose"} icon={Gauge}
              calc="CM2 − Other (fixed) Expenses. Equals Net Period Profit above exactly — this system doesn't track interest, tax, depreciation, or amortization separately, so there's no further adjustment between the two."
            />
          </div>

          <div className="mt-5 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={economics?.waterfall || []} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e5eaf1" vertical={false} />
                <XAxis dataKey="stage" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} width={56} />
                <ReferenceLine y={0} stroke="#cbd5e1" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Amount" radius={[4, 4, 4, 4]} maxBarSize={48}>
                  {(economics?.waterfall || []).map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.isSubtotal ? "#3730a3" : entry.value >= 0 ? "#059669" : "#e11d48"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Revenue → COGS → Gross Profit → Shipping → CM1 → Marketing → CM2 → Other Opex → EBITDA. Indigo bars are running subtotals; green/red bars are the revenue and cost lines that produce them.
          </p>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-[var(--muted)]">Loading finance data...</p> : null}
    </div>
  );
}

// ─── Sales Analytics Tab ─────────────────────────────────────────────────────

function SalesAnalyticsTab({ analytics, groupBy }) {
  const currency = analytics?.totals?.currency || "INR";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Revenue" value={formatMoney(analytics?.totals?.revenue, currency)} sub={groupBy} tone="green" icon={BadgeIndianRupee} />
        <KpiTile label="Orders" value={(analytics?.totals?.orders ?? 0).toLocaleString("en-IN")} sub="in range" tone="blue" icon={Package} />
        <KpiTile label="Average Order Value" value={formatMoney(analytics?.totals?.aov, currency)} sub="AOV" tone="indigo" icon={ChartNoAxesCombined} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Orders & Revenue</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">Filtered sales pulse for the selected range.</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.trend || []} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e5eaf1" vertical={false} />
                <XAxis dataKey="period" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} width={56} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill="#3730a3" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(analytics?.topProducts || []).length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No synced sales in this range yet.</p>
            ) : (
              analytics.topProducts.map((product) => (
                <div key={product.title} className="flex items-center justify-between rounded-md border border-[var(--line)] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{product.title}</p>
                    <p className="text-xs text-[var(--muted)]">{product.quantity} units sold</p>
                  </div>
                  <p className="font-bold">{formatMoney(product.revenue, currency)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Channel Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(analytics?.channelBreakdown || []).length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No channel data in this range yet.</p>
            ) : (
              analytics.channelBreakdown.map((channel) => (
                <div key={channel.channelId} className="flex items-center justify-between rounded-md border border-[var(--line)] px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Store size={14} className="text-[var(--primary)]" />
                    <p className="font-semibold">{channel.orders} orders</p>
                  </div>
                  <p className="font-bold">{formatMoney(channel.revenue, currency)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Expenses Tab ────────────────────────────────────────────────────────────

const expenseCategories = ["rent", "salary", "utilities", "packaging", "shipping", "software", "marketing", "misc", "other"];

function ExpenseFormModal({ onClose, onSaved, initial }) {
  const [form, setForm] = useState(
    initial
      ? {
        category: initial.category || "other",
        description: initial.description || "",
        amount: initial.amount ?? "",
        date: isoDay(new Date(initial.date)),
        paymentMethod: initial.paymentMethod || "",
      }
      : { category: "other", description: "", amount: "", date: isoDay(new Date()), paymentMethod: "" },
  );
  const [splits, setSplits] = useState(initial?.splitBetween?.length ? initial.splitBetween : []);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listUsers().then((res) => setUsers(res.users || [])).catch(() => { });
  }, []);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addSplitRow() {
    const used = new Set(splits.map((s) => String(s.userId)));
    const nextUser = users.find((u) => !used.has(String(u._id || u.id)));
    if (!nextUser) return;
    setSplits((current) => [...current, { userId: nextUser._id || nextUser.id, userName: nextUser.name, amount: "" }]);
  }

  function updateSplit(index, field, value) {
    setSplits((current) =>
      current.map((s, i) => {
        if (i !== index) return s;
        if (field === "userId") {
          const user = users.find((u) => String(u._id || u.id) === value);
          return { ...s, userId: value, userName: user?.name || "" };
        }
        return { ...s, [field]: value };
      }),
    );
  }

  function removeSplit(index) {
    setSplits((current) => current.filter((_, i) => i !== index));
  }

  const splitTotal = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const amountNum = Number(form.amount) || 0;
  const splitMismatch = splits.length > 0 && Math.abs(splitTotal - amountNum) > 0.5;

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = { ...form, splitBetween: splits.filter((s) => s.userId && Number(s.amount) > 0) };
      const result = initial?._id
        ? await updateExpense(initial._id, payload)
        : await createExpense(payload);
      onSaved(result.expense);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Edit Expense" : "Add Expense"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Category">
          <select className={fieldClass} value={form.category} onChange={(event) => setField("category", event.target.value)}>
            {expenseCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat[0].toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <input className={fieldClass} value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="e.g. Warehouse rent - August" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)">
            <input type="number" min="0" className={fieldClass} value={form.amount} onChange={(event) => setField("amount", event.target.value)} required />
          </Field>
          <Field label="Date">
            <input type="date" className={fieldClass} value={form.date} onChange={(event) => setField("date", event.target.value)} />
          </Field>
        </div>
        <Field label="Payment Method">
          <input className={fieldClass} value={form.paymentMethod} onChange={(event) => setField("paymentMethod", event.target.value)} placeholder="UPI, Bank Transfer, Cash..." />
        </Field>

        {/* Spent by — split across partners */}
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Spent By (optional)</span>
            <button
              type="button"
              onClick={addSplitRow}
              disabled={splits.length >= users.length}
              className="text-xs font-semibold text-indigo-700 hover:underline disabled:opacity-40"
            >
              + Add person
            </button>
          </div>
          {splits.length === 0 ? (
            <p className="mt-1.5 text-xs text-[var(--muted)]">Not assigned yet — leave blank to tag later, or add who paid.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {splits.map((split, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    className="h-9 flex-1 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-indigo-600"
                    value={split.userId}
                    onChange={(e) => updateSplit(index, "userId", e.target.value)}
                  >
                    {users.map((u) => (
                      <option key={u._id || u.id} value={u._id || u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    placeholder="₹ amount"
                    className="h-9 w-28 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-indigo-600"
                    value={split.amount}
                    onChange={(e) => updateSplit(index, "amount", e.target.value)}
                  />
                  <button type="button" onClick={() => removeSplit(index)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                    <X size={14} />
                  </button>
                </div>
              ))}
              {splitMismatch ? (
                <p className="text-xs font-medium text-amber-700">
                  Split total {formatMoney(splitTotal)} doesn&rsquo;t match expense amount {formatMoney(amountNum)} — that&rsquo;s fine if intentional.
                </p>
              ) : null}
            </div>
          )}
        </div>

        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving..." : "Save Expense"}
        </Button>
      </form>
    </Modal>
  );
}

const EXPENSE_CATEGORIES = ["rent", "salary", "utilities", "packaging", "shipping", "software", "marketing", "misc", "other"];

function ExpensesTab({ expenses, isLoading, onRefresh, range, initialCategoryFilter, onConsumeInitialFilter }) {
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deletingId, setDeletingId] = useState("");
  const [partnerSummary, setPartnerSummary] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(initialCategoryFilter || "all");

  // A KPI tile on Overview can jump here with a category pre-applied (e.g.
  // "Marketing Spend" -> category=marketing) — consume it once so switching
  // tabs manually afterward doesn't keep re-forcing the filter back.
  useEffect(() => {
    if (!initialCategoryFilter) return;
    setCategoryFilter(initialCategoryFilter);
    onConsumeInitialFilter?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCategoryFilter]);

  useEffect(() => {
    if (!range) return;
    getExpensesByPartner(range).then(setPartnerSummary).catch(() => { });
  }, [range, expenses]);

  async function handleDelete(expenseId) {
    setDeletingId(expenseId);
    try {
      await deleteExpense(expenseId);
      await onRefresh();
    } finally {
      setDeletingId("");
    }
  }

  const filteredExpenses =
    categoryFilter === "all" ? expenses
      : categoryFilter === "not-marketing" ? expenses.filter((e) => e.category !== "marketing")
      // Matches the Overview tab's "Other Expenses" card definition exactly —
      // everything except marketing and shipping, since those two have their
      // own dedicated cards there.
      : categoryFilter === "other" ? expenses.filter((e) => e.category !== "marketing" && e.category !== "shipping")
      : expenses.filter((e) => e.category === categoryFilter);

  const total = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Expenses</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {filteredExpenses.length} of {expenses.length} entries, {formatMoney(total)}{categoryFilter !== "all" ? " (filtered)" : ""} in this range.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-md border border-[var(--line)] bg-white px-2.5 text-xs font-semibold outline-none focus:border-[var(--primary)]"
          >
            <option value="all">All categories</option>
            <option value="not-marketing">Not marketing</option>
            <option value="other">Other (not marketing or shipping)</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <Button onClick={() => { setEditingExpense(null); setShowForm(true); }}>
            <Plus size={16} />
            Add Expense
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {/* Spend by partner summary */}
        {partnerSummary ? (
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            {partnerSummary.byPartner.map((p) => (
              <div key={p.userId} className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">{p.userName}</p>
                <p className="mt-0.5 text-lg font-bold text-slate-900">{formatMoney(p.total)}</p>
                <p className="text-[11px] text-[var(--muted)]">{p.count} expense{p.count !== 1 ? "s" : ""}</p>
              </div>
            ))}
            {partnerSummary.unassigned.count > 0 ? (
              <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Unassigned</p>
                <p className="mt-0.5 text-lg font-bold text-slate-900">{formatMoney(partnerSummary.unassigned.total)}</p>
                <p className="text-[11px] text-[var(--muted)]">{partnerSummary.unassigned.count} not tagged yet</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {isLoading ? <p className="text-sm text-[var(--muted)]">Loading expenses...</p> : null}
        {!isLoading && !filteredExpenses.length ? (
          <p className="text-sm text-[var(--muted)]">
            {expenses.length ? "No expenses match this category in this range." : "No expenses recorded in this range yet."}
          </p>
        ) : null}
        {filteredExpenses.length ? (
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-xs uppercase text-slate-500">
                <th className="py-3 pr-4 font-semibold">Date</th>
                <th className="py-3 pr-4 font-semibold">Category</th>
                <th className="py-3 pr-4 font-semibold">Description</th>
                <th className="py-3 pr-4 font-semibold">Spent By</th>
                <th className="py-3 pr-4 font-semibold">Payment</th>
                <th className="py-3 pr-0 text-right font-semibold">Amount</th>
                <th className="py-3 pl-4 text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((expense) => (
                <tr key={expense._id || expense.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/60">
                  <td className="py-3 pr-4">{new Date(expense.date).toLocaleDateString("en-IN")}</td>
                  <td className="py-3 pr-4">
                    <Badge tone="slate">{expense.category}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    {expense.description || "-"}
                    {expense.source === "meta-ad-sync" ? (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-700">
                        <Megaphone size={10} /> Auto (Meta)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">
                    {expense.splitBetween?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {expense.splitBetween.map((s, i) => (
                          <span key={i} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                            {s.userName} {formatMoney(s.amount)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Unassigned</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">{expense.paymentMethod || "-"}</td>
                  <td className="py-3 pr-0 text-right font-bold text-rose-700">{formatMoney(expense.amount)}</td>
                  <td className="py-3 pl-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="rounded-md p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
                        onClick={() => { setEditingExpense(expense); setShowForm(true); }}
                        aria-label="Edit expense"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                        onClick={() => handleDelete(expense._id || expense.id)}
                        disabled={deletingId === (expense._id || expense.id) || expense.source === "meta-ad-sync"}
                        aria-label="Delete expense"
                        title={expense.source === "meta-ad-sync" ? "Auto-synced from Meta — reappears on the next sync. Disconnect the Ads channel to stop it." : undefined}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </CardContent>
      {showForm ? (
        <ExpenseFormModal
          initial={editingExpense}
          onClose={() => { setShowForm(false); setEditingExpense(null); }}
          onSaved={() => onRefresh()}
        />
      ) : null}
    </Card>
  );
}

// ─── Vendors & Purchases Tab ─────────────────────────────────────────────────

const vendorCategories = ["raw-material", "packaging", "services", "other"];
const purchaseItemCategories = ["sticker", "spice", "packaging", "raw-material", "other"];

function VendorFormModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", category: "raw-material", contactPerson: "", phone: "", email: "", gstin: "", address: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const result = await createVendor(form);
      onSaved(result.vendor);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add Vendor" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Vendor / Supplier Name">
          <input className={fieldClass} value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="e.g. Rajasthan Spice Traders" required />
        </Field>
        <Field label="Category">
          <select className={fieldClass} value={form.category} onChange={(event) => setField("category", event.target.value)}>
            {vendorCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace("-", " ")}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact Person">
            <input className={fieldClass} value={form.contactPerson} onChange={(event) => setField("contactPerson", event.target.value)} />
          </Field>
          <Field label="Phone">
            <input className={fieldClass} value={form.phone} onChange={(event) => setField("phone", event.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input className={fieldClass} value={form.email} onChange={(event) => setField("email", event.target.value)} />
          </Field>
          <Field label="GSTIN">
            <input className={fieldClass} value={form.gstin} onChange={(event) => setField("gstin", event.target.value)} />
          </Field>
        </div>
        <Field label="Address">
          <textarea className={cn(fieldClass, "min-h-20 resize-y")} value={form.address} onChange={(event) => setField("address", event.target.value)} />
        </Field>
        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving..." : "Save Vendor"}
        </Button>
      </form>
    </Modal>
  );
}

function emptyPurchaseItem() {
  return { name: "", category: "raw-material", quantity: "", unit: "kg", unitCost: "" };
}

function PurchaseFormModal({ vendors, onClose, onSaved }) {
  const [vendorId, setVendorId] = useState(vendors[0]?._id || vendors[0]?.id || "");
  const [purchaseDate, setPurchaseDate] = useState(isoDay(new Date()));
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [items, setItems] = useState([emptyPurchaseItem()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const total = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0), 0);

  function updateItem(index, key, value) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  }

  function addItem() {
    setItems((current) => [...current, emptyPurchaseItem()]);
  }

  function removeItem(index) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const vendor = vendors.find((v) => (v._id || v.id) === vendorId);

    try {
      const result = await createPurchase({
        vendorId,
        vendorName: vendor?.name || "",
        purchaseDate,
        invoiceNumber,
        paymentStatus,
        paymentMethod,
        items,
      });
      onSaved(result.purchase);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Record Raw Material Purchase" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vendor">
            <select className={fieldClass} value={vendorId} onChange={(event) => setVendorId(event.target.value)} required>
              <option value="" disabled>
                Select vendor
              </option>
              {vendors.map((vendor) => (
                <option key={vendor._id || vendor.id} value={vendor._id || vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Purchase Date">
            <input type="date" className={fieldClass} value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Invoice Number">
            <input className={fieldClass} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
          </Field>
          <Field label="Payment Status">
            <select className={fieldClass} value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </Field>
          <Field label="Payment Method">
            <input className={fieldClass} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} placeholder="UPI, Cash..." />
          </Field>
        </div>

        <div className="rounded-md border border-[var(--line)] p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Items purchased</p>
            <Button type="button" variant="secondary" className="h-8 px-2 text-xs" onClick={addItem}>
              <Plus size={14} />
              Add Item
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-4">
                  <label className="text-xs font-semibold text-slate-500">Item name</label>
                  <input
                    className={fieldClass}
                    placeholder="e.g. Turmeric powder, poly stickers"
                    value={item.name}
                    onChange={(event) => updateItem(index, "name", event.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500">Category</label>
                  <select className={fieldClass} value={item.category} onChange={(event) => updateItem(index, "category", event.target.value)}>
                    {purchaseItemCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500">Qty</label>
                  <input type="number" min="0" className={fieldClass} value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} required />
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-semibold text-slate-500">Unit</label>
                  <input className={fieldClass} value={item.unit} onChange={(event) => updateItem(index, "unit", event.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500">Unit cost (₹)</label>
                  <input type="number" min="0" className={fieldClass} value={item.unitCost} onChange={(event) => updateItem(index, "unitCost", event.target.value)} required />
                </div>
                <div className="col-span-1 pb-2 text-right">
                  {items.length > 1 ? (
                    <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" onClick={() => removeItem(index)} aria-label="Remove item">
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-[var(--line)] pt-3">
            <p className="text-sm font-semibold text-slate-600">Total amount</p>
            <p className="text-lg font-bold text-slate-950">{formatMoney(total)}</p>
          </div>
        </div>

        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        {!vendors.length ? <p className="text-sm font-medium text-amber-700">Add a vendor first before recording a purchase.</p> : null}
        <Button type="submit" className="w-full" disabled={saving || !vendors.length}>
          {saving ? "Saving..." : "Save Purchase"}
        </Button>
      </form>
    </Modal>
  );
}

function VendorsPurchasesTab({ vendors, purchases, isLoading, onRefresh }) {
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [busyId, setBusyId] = useState("");

  async function handleDeleteVendor(vendorId) {
    setBusyId(vendorId);
    try {
      await deleteVendor(vendorId);
      await onRefresh();
    } finally {
      setBusyId("");
    }
  }

  async function handleDeletePurchase(purchaseId) {
    setBusyId(purchaseId);
    try {
      await deletePurchase(purchaseId);
      await onRefresh();
    } finally {
      setBusyId("");
    }
  }

  const totalPurchases = purchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Vendors</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">{vendors.length} suppliers for raw material, stickers, and packaging.</p>
          </div>
          <Button onClick={() => setShowVendorForm(true)}>
            <Plus size={16} />
            Add Vendor
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? <p className="text-sm text-[var(--muted)]">Loading vendors...</p> : null}
          {!isLoading && !vendors.length ? <p className="text-sm text-[var(--muted)]">No vendors added yet.</p> : null}
          {vendors.map((vendor) => (
            <div key={vendor._id || vendor.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{vendor.name}</p>
                  <Badge tone="slate">{vendor.category}</Badge>
                </div>
                <p className="text-sm text-[var(--muted)]">{[vendor.contactPerson, vendor.phone, vendor.email].filter(Boolean).join(" · ") || "No contact details"}</p>
              </div>
              <button
                className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                onClick={() => handleDeleteVendor(vendor._id || vendor.id)}
                disabled={busyId === (vendor._id || vendor.id)}
                aria-label="Delete vendor"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Raw Material Purchases</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">{purchases.length} purchases, {formatMoney(totalPurchases)} in this range.</p>
          </div>
          <Button onClick={() => setShowPurchaseForm(true)}>
            <Plus size={16} />
            Record Purchase
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? <p className="text-sm text-[var(--muted)]">Loading purchases...</p> : null}
          {!isLoading && !purchases.length ? <p className="text-sm text-[var(--muted)]">No purchases recorded in this range yet.</p> : null}
          {purchases.length ? (
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-xs uppercase text-slate-500">
                  <th className="py-3 pr-4 font-semibold">Date</th>
                  <th className="py-3 pr-4 font-semibold">Vendor</th>
                  <th className="py-3 pr-4 font-semibold">Items</th>
                  <th className="py-3 pr-4 font-semibold">Payment</th>
                  <th className="py-3 pr-0 text-right font-semibold">Amount</th>
                  <th className="py-3 pl-4 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase._id || purchase.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/60">
                    <td className="py-3 pr-4">{new Date(purchase.purchaseDate).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 pr-4 font-semibold">{purchase.vendorName || "-"}</td>
                    <td className="py-3 pr-4 text-[var(--muted)]">{(purchase.items || []).map((item) => `${item.name} (${item.quantity}${item.unit})`).join(", ")}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={purchase.paymentStatus === "paid" ? "green" : purchase.paymentStatus === "partial" ? "amber" : "rose"}>{purchase.paymentStatus}</Badge>
                    </td>
                    <td className="py-3 pr-0 text-right font-bold">{formatMoney(purchase.totalAmount)}</td>
                    <td className="py-3 pl-4 text-right">
                      <button
                        className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                        onClick={() => handleDeletePurchase(purchase._id || purchase.id)}
                        disabled={busyId === (purchase._id || purchase.id)}
                        aria-label="Delete purchase"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>

      {showVendorForm ? <VendorFormModal onClose={() => setShowVendorForm(false)} onSaved={() => onRefresh()} /> : null}
      {showPurchaseForm ? <PurchaseFormModal vendors={vendors} onClose={() => setShowPurchaseForm(false)} onSaved={() => onRefresh()} /> : null}
    </div>
  );
}

// ─── Ad Spend (Meta) Tab ─────────────────────────────────────────────────────

function LinkProductModal({ insight, onClose, onSaved }) {
  const [productTitle, setProductTitle] = useState(insight.linkedProductTitle || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await linkAdProduct(insight.id, productTitle);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Link "${insight.adName}" to a product`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Product title">
          <input className={fieldClass} value={productTitle} onChange={(event) => setProductTitle(event.target.value)} placeholder="Match the exact Shopify product title" />
        </Field>
        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving..." : "Save Link"}
        </Button>
      </form>
    </Modal>
  );
}

function MetaConnectCard() {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setConnecting(true);
    setError("");
    try {
      const result = await connectMetaAds();
      window.location.href = result.installUrl;
    } catch (err) {
      setError(err.message);
      setConnecting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Connect Meta Ads</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">Sync daily spend, impressions, and clicks per campaign and ad from Meta Ads Manager.</p>
        </div>
        <Badge tone="indigo">Amazon Ads skipped for now</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={connect} disabled={connecting}>
          <Target size={16} />
          {connecting ? "Opening Meta..." : "Connect Meta Ads"}
        </Button>
        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          Attributed revenue and ROAS only work for orders whose checkout link carries UTM parameters (Meta Ads Manager → Account
          Settings → URL Parameters, e.g. <code>utm_source=facebook&utm_campaign=&#123;&#123;campaign.name&#125;&#125;&utm_content=&#123;&#123;ad.name&#125;&#125;</code>).
          Spend and campaign data will still sync correctly either way.
        </div>
      </CardContent>
    </Card>
  );
}

const accountStatusMap = {
  1: { label: "Active", tone: "green" },
  2: { label: "Disabled", tone: "rose" },
  3: { label: "Unsettled", tone: "amber" },
  7: { label: "Pending review", tone: "amber" },
  8: { label: "Pending settlement", tone: "amber" },
  9: { label: "In grace period", tone: "amber" },
  100: { label: "Pending closure", tone: "rose" },
  101: { label: "Closed", tone: "rose" },
};

function AccountSwitcher({ adAccounts, currentAccountId, loadingAccounts, selecting, onChoose, error }) {
  const [open, setOpen] = useState(false);
  const current = adAccounts.find((account) => account.id === currentAccountId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-white px-3.5 py-2.5 text-left transition hover:border-slate-300 sm:w-auto sm:min-w-[280px]"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{current?.name || "Select ad account"}</p>
          <p className="truncate text-xs text-[var(--muted)]">{currentAccountId || "No account selected"}{current?.currency ? ` · ${current.currency}` : ""}</p>
        </div>
        <ChevronsUpDown size={15} className="shrink-0 text-slate-400" />
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1.5 max-h-80 w-full min-w-[320px] overflow-y-auto rounded-lg border border-[var(--line)] bg-white p-1.5 shadow-xl sm:w-96">
          {loadingAccounts ? <p className="px-3 py-2 text-sm text-[var(--muted)]">Loading ad accounts...</p> : null}
          {!loadingAccounts && !adAccounts.length ? <p className="px-3 py-2 text-sm text-[var(--muted)]">No ad accounts found on this Meta login.</p> : null}
          {adAccounts.map((account) => {
            const status = accountStatusMap[account.account_status] || null;
            const isActive = account.id === currentAccountId;
            return (
              <button
                key={account.id}
                type="button"
                disabled={selecting}
                onClick={() => {
                  setOpen(false);
                  if (!isActive) onChoose(account);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition",
                  isActive ? "bg-[var(--primary-soft)]" : "hover:bg-slate-50",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{account.name}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{account.id} · {account.currency}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {status ? <Badge tone={status.tone} dot>{status.label}</Badge> : null}
                  {isActive ? <Check size={16} className="text-[var(--primary)]" /> : null}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}

function AdsTab({ adsChannel, adsSummary, isLoading, onRefresh, range }) {
  const [adAccounts, setAdAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [syncNotice, setSyncNotice] = useState(null);
  const [linkTarget, setLinkTarget] = useState(null);
  const [todaySpend, setTodaySpend] = useState(null);
  const [checkingToday, setCheckingToday] = useState(false);

  const channelId = adsChannel?._id || adsChannel?.id;
  const hasAdAccount = Boolean(adsChannel?.external?.adAccountId);

  useEffect(() => {
    if (!channelId) return;
    setLoadingAccounts(true);
    listMetaAdAccounts(channelId)
      .then((result) => setAdAccounts(result.adAccounts || []))
      .catch((err) => setActionError(err.message))
      .finally(() => setLoadingAccounts(false));
  }, [channelId]);

  async function chooseAccount(account) {
    setSelecting(true);
    setActionError("");
    setSyncNotice(null);
    try {
      await selectMetaAdAccount(channelId, { adAccountId: account.id, adAccountName: account.name, adAccountCurrency: account.currency });
      // Auto-sync right after switching so numbers reflect the newly picked account without an extra click.
      const result = await syncAdInsights(channelId, { days: 30 });
      setSyncNotice({ tone: "green", text: `Switched to ${account.name}. Synced ${result.syncedRows} ad-day rows for the last 30 days.` });
      await onRefresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSelecting(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setActionError("");
    setSyncNotice(null);
    try {
      const result = await syncAdInsights(channelId, { days: 30 });
      if (!result.syncedRows) {
        setSyncNotice({
          tone: "amber",
          text: "Meta returned 0 ad-day rows for this account in the last 30 days. Either this account has no delivery in that window, or it's not the account you meant to track — switch accounts above if you have more than one.",
        });
      } else {
        setSyncNotice({ tone: "green", text: `Synced ${result.syncedRows} ad-day rows from Meta.` });
      }
      await onRefresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  // Live look at today's spend so far — never written anywhere. The
  // "official" spend figure only ever updates via the daily 8am sync, so
  // clicking this as often as wanted can't make the reported total drift.
  async function checkToday() {
    setCheckingToday(true);
    setActionError("");
    try {
      const result = await getMetaAdSpendToday(channelId);
      setTodaySpend(result);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setCheckingToday(false);
    }
  }

  async function recompute() {
    setRecomputing(true);
    setActionError("");
    try {
      const result = await recomputeAdAttribution(channelId, { from: range.from, to: range.to });
      setSyncNotice({ tone: "green", text: `Recomputed attribution for ${result.updated} ad-day rows.` });
      await onRefresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setRecomputing(false);
    }
  }

  if (!adsChannel) {
    return <MetaConnectCard />;
  }

  const totals = adsSummary?.totals || {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{adsChannel.name}</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Last sync {adsChannel.sync?.lastSyncAt ? new Date(adsChannel.sync.lastSyncAt).toLocaleString("en-IN") : "not synced yet"}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" className="h-9" onClick={checkToday} disabled={checkingToday || !hasAdAccount} title="Live look at today's spend so far — doesn't change the official figure">
              <Eye size={14} className={checkingToday ? "animate-pulse" : ""} />
              {checkingToday ? "Checking…" : "Check Today"}
            </Button>
            <Button variant="secondary" className="h-9" onClick={recompute} disabled={recomputing}>
              <Link2 size={14} className={recomputing ? "animate-pulse" : ""} />
              Recompute Attribution
            </Button>
            <Button className="h-9" onClick={sync} disabled={syncing || !hasAdAccount}>
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing..." : "Sync Meta Data"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Ad account</p>
            <AccountSwitcher
              adAccounts={adAccounts}
              currentAccountId={adsChannel.external?.adAccountId}
              loadingAccounts={loadingAccounts}
              selecting={selecting}
              onChoose={chooseAccount}
              error={actionError}
            />
          </div>
          {todaySpend ? (
            <div className="flex items-center justify-between rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm">
              <span className="font-semibold text-indigo-900">Today ({todaySpend.date}) so far: {formatMoney(todaySpend.spend, todaySpend.currency)}</span>
              <span className="text-xs text-indigo-500">Live preview — not saved. The figures below update at the next daily sync (8am).</span>
            </div>
          ) : null}
          {syncNotice ? (
            <div className={cn("rounded-md px-3 py-2 text-sm font-medium", syncNotice.tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
              {syncNotice.text}
            </div>
          ) : null}
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            ROAS below is calculated from orders auto-matched by UTM parameters. If your Meta ads don&apos;t carry UTM tags yet, spend
            will show correctly but attributed revenue may read as 0 — add UTM parameters in Meta Ads Manager to enable matching.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Spend (Meta-reported)" value={formatMoney(totals.spend, totals.currency)} sub={`${(totals.clicks || 0).toLocaleString("en-IN")} clicks`} tone="indigo" icon={Megaphone}
          calc="Sum of Meta's own daily 'spend' figure across every ad in this range, exactly as reported by their Insights API — pre-GST."
        />
        <KpiTile
          label="Total Cost (incl. 18% GST)"
          value={formatMoney(totals.spendWithGst, totals.currency)}
          sub={`+${formatMoney(totals.gstAmount, totals.currency)} GST — informational, not an Expense entry`}
          tone="rose"
          icon={Coins}
          calc="Spend (Meta-reported) × 1.18 — the real cash outflow, since Meta bills 18% GST on top of what their own dashboard shows as 'spend'."
        />
        <KpiTile
          label="Attributed Revenue" value={formatMoney(totals.attributedRevenue, totals.currency)} sub={`${totals.attributedOrders || 0} orders`} tone="green" icon={BadgeIndianRupee}
          calc="Sum of totalPrice for synced orders auto-matched to an ad by UTM parameters (utm_campaign/utm_content). Needs UTM tags set in Meta Ads Manager — reads as ₹0 without them, even if spend is real."
        />
        <KpiTile
          label="ROAS" value={`${totals.roas || 0}x`} sub="on Meta-reported spend" tone={totals.roas >= 1 ? "green" : "rose"} icon={Target}
          calc="Attributed Revenue ÷ Spend (Meta-reported, pre-GST)."
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="CPA" value={formatMoney(totals.cpa, totals.currency)} sub={`per attributed order`} tone="blue" icon={Activity}
          calc="Spend (Meta-reported) ÷ Attributed Orders."
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery & Engagement</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile label="Impressions" value={(totals.impressions || 0).toLocaleString("en-IN")} sub="times shown" tone="slate" icon={Eye} />
          <KpiTile label="Reach" value={(totals.reach || 0).toLocaleString("en-IN")} sub="approx, sums daily reach" tone="slate" icon={Users} />
          <KpiTile label="Frequency" value={(totals.frequency || 0).toFixed(2)} sub="impressions / reach" tone="slate" icon={Repeat} />
          <KpiTile label="CPM" value={formatMoney(totals.cpm, totals.currency)} sub="cost per 1,000 impressions" tone="amber" icon={ImageIcon} />
          <KpiTile label="All Clicks" value={(totals.clicks || 0).toLocaleString("en-IN")} sub="incl. likes, shares, etc." tone="slate" icon={MousePointerClick} />
          <KpiTile label="Link Clicks" value={(totals.linkClicks || 0).toLocaleString("en-IN")} sub="clicks to your site" tone="indigo" icon={Link2} />
          <KpiTile label="CTR" value={`${totals.ctr || 0}%`} sub="all clicks / impressions" tone="blue" icon={Percent} />
          <KpiTile label="CPC (Link)" value={formatMoney(totals.costPerLinkClick, totals.currency)} sub="cost per link click" tone="amber" icon={Coins} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spend vs Attributed Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={adsSummary?.trend || []} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e5eaf1" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} width={56} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="spend" name="Spend" fill="#b45309" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#16a34a" strokeWidth={3} dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? <p className="text-sm text-[var(--muted)]">Loading campaigns...</p> : null}
          {!isLoading && !(adsSummary?.campaigns || []).length ? <p className="text-sm text-[var(--muted)]">No Meta data synced for this range yet. Click Sync Meta Data.</p> : null}
          {(adsSummary?.campaigns || []).map((campaign) => (
            <div key={campaign.campaignId || campaign.campaignName} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--line)] px-3 py-2 text-sm">
              <p className="font-semibold">{campaign.campaignName}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
                <span>Spend {formatMoney(campaign.spend)}</span>
                <span>Revenue {formatMoney(campaign.revenue)}</span>
                <Badge tone={campaign.roas >= 1 ? "green" : "rose"}>{campaign.roas}x ROAS</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ad Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(adsSummary?.ads || []).length ? (
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-xs uppercase text-slate-500">
                  <th className="py-3 pr-4 font-semibold">Ad</th>
                  <th className="py-3 pr-4 font-semibold">Linked Product</th>
                  <th className="py-3 pr-4 text-right font-semibold">Spend</th>
                  <th className="py-3 pr-4 text-right font-semibold">Revenue</th>
                  <th className="py-3 pr-4 text-right font-semibold">ROAS</th>
                  <th className="py-3 pl-4 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {adsSummary.ads.map((ad) => (
                  <tr key={ad.adId} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/60">
                    <td className="py-3 pr-4">
                      <p className="font-semibold">{ad.adName}</p>
                      <p className="text-xs text-[var(--muted)]">{ad.campaignName}</p>
                    </td>
                    <td className="py-3 pr-4">{ad.linkedProductTitle || <span className="text-[var(--muted)]">Not linked</span>}</td>
                    <td className="py-3 pr-4 text-right">{formatMoney(ad.spend)}</td>
                    <td className="py-3 pr-4 text-right">{formatMoney(ad.revenue)}</td>
                    <td className="py-3 pr-4 text-right">
                      <Badge tone={ad.roas >= 1 ? "green" : "rose"}>{ad.roas}x</Badge>
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => setLinkTarget(ad)}>
                        <Link2 size={14} />
                        Link product
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>

      {linkTarget ? <LinkProductModal insight={linkTarget} onClose={() => setLinkTarget(null)} onSaved={() => onRefresh()} /> : null}
    </div>
  );
}

// ─── Root Component ──────────────────────────────────────────────────────────

export function FinanceView({ defaultTab = "overview" }) {
  const [activeTab, setActiveTab] = useState(tabs.some((t) => t.key === defaultTab) ? defaultTab : "overview");
  // Set by an Overview KPI tile click (e.g. "Marketing Spend" -> "marketing")
  // and consumed once by ExpensesTab so a manual tab switch afterward doesn't
  // keep re-forcing the filter.
  const [pendingExpenseFilter, setPendingExpenseFilter] = useState(null);

  function navigateFromKpi(tab, expenseFilter) {
    if (expenseFilter) setPendingExpenseFilter(expenseFilter);
    setActiveTab(tab);
  }

  const [preset, setPreset] = useState("30d");
  const [custom, setCustom] = useState({ from: LIFETIME_START, to: isoDay(new Date()) });
  const [groupBy, setGroupBy] = useState("day");
  const range = useMemo(() => resolveRange(preset, custom), [preset, custom]);

  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [trend, setTrend] = useState(null);
  const [economics, setEconomics] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [adsChannel, setAdsChannel] = useState(null);
  const [adsSummary, setAdsSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [oauthNotice, setOauthNotice] = useState(null);
  // Guards against out-of-order responses: if the user switches tabs (e.g.
  // Yesterday -> Today) before the first request finishes, the slower response
  // must never overwrite state after a newer request has already started —
  // otherwise the UI can show "Today" selected while rendering Yesterday's numbers.
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (!status) return;

    if (status === "connected") {
      setOauthNotice({ tone: "green", text: "Meta Ads connected. Select an ad account below to start syncing." });
      setActiveTab("ads");
    } else if (status === "error") {
      setOauthNotice({ tone: "rose", text: params.get("message") || "Meta connection failed." });
      setActiveTab("ads");
    }

    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  async function refreshAll() {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError("");
    try {
      const [summaryRes, analyticsRes, trendRes, economicsRes, expensesRes, vendorsRes, purchasesRes, channelsRes] = await Promise.all([
        getFinanceSummary(range),
        getSalesAnalytics({ ...range, groupBy }),
        getFinanceTrend({ ...range, groupBy }),
        getUnitEconomics(range),
        listExpenses(range),
        listVendors(),
        listPurchases(range),
        listAdsChannels(),
      ]);

      // A newer request has since started (user clicked another tab) — this
      // response is stale, discard it instead of overwriting fresher state.
      if (requestIdRef.current !== requestId) return;

      setSummary(summaryRes.summary);
      setAnalytics(analyticsRes.analytics);
      setTrend(trendRes.trend || []);
      setEconomics(economicsRes.economics);
      setExpenses(expensesRes.expenses || []);
      setVendors(vendorsRes.vendors || []);
      setPurchases(purchasesRes.purchases || []);

      const metaChannel = (channelsRes.channels || []).find((channel) => channel.provider === "meta") || null;
      setAdsChannel(metaChannel);

      if (metaChannel) {
        const adsSummaryRes = await getAdsSummary(range);
        if (requestIdRef.current !== requestId) return;
        setAdsSummary(adsSummaryRes.summary);
      } else {
        setAdsSummary(null);
      }
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err.message);
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, groupBy]);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge tone="indigo">Finance</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Finance & Ad Spend</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] md:text-base">
            Sales, expenses, vendor & raw-material purchases, and Meta ad spend with ROAS — all in one place.
          </p>
        </div>
        <RangeControls preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} groupBy={groupBy} setGroupBy={setGroupBy} onRefresh={refreshAll} isLoading={isLoading} />
      </section>

      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-all",
              activeTab === tab.key
                ? "bg-gradient-to-b from-[#4338ca] to-[var(--primary)] text-white shadow-[0_4px_10px_-3px_rgba(55,48,163,0.55)]"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {oauthNotice ? (
        <div
          className={cn(
            "mb-4 flex items-start justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium",
            oauthNotice.tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
          )}
        >
          <span>{oauthNotice.text}</span>
          <button onClick={() => setOauthNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      ) : null}
      {error ? <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}

      {activeTab === "overview" ? <OverviewTab range={range} groupBy={groupBy} summary={summary} analytics={analytics} trend={trend} economics={economics} isLoading={isLoading} onNavigate={navigateFromKpi} /> : null}
      {activeTab === "sales" ? <SalesAnalyticsTab analytics={analytics} groupBy={groupBy} /> : null}
      {activeTab === "expenses" ? (
        <ExpensesTab
          expenses={expenses}
          isLoading={isLoading}
          onRefresh={refreshAll}
          range={range}
          initialCategoryFilter={pendingExpenseFilter}
          onConsumeInitialFilter={() => setPendingExpenseFilter(null)}
        />
      ) : null}
      {activeTab === "purchases" ? <VendorsPurchasesTab vendors={vendors} purchases={purchases} isLoading={isLoading} onRefresh={refreshAll} /> : null}
      {activeTab === "ads" ? <AdsTab adsChannel={adsChannel} adsSummary={adsSummary} isLoading={isLoading} onRefresh={refreshAll} range={range} /> : null}
    </div>
  );
}
