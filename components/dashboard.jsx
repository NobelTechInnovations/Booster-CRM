"use client";

import {
  PackageCheck,
  Activity,
  Bell,
  Boxes,
  Building2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Filter,
  Gauge,
  Layers3,
  LifeBuoy,
  LogOut,
  Menu,
  Package,
  PlugZap,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  UserRound,
  Workflow,
  X,
  Ban,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CompanyView } from "@/components/company-view";
import { UsersView } from "@/components/users-view";
import { ShippingView } from "@/components/shipping-view";
import { FulfillmentView } from "@/components/fulfillment-view";
import { CustomerFollowUpModal } from "@/components/customer-followup-modal";
import { CreateOrderModal } from "@/components/create-order-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  automations,
  channelCatalog,
  financeBreakdown,
  roles,
} from "@/lib/data";
import {
  clearSession,
  createAmazonConnection,
  createAmazonPrivateConnection,
  createShopifyConnection,
  getChannelDashboard,
  getProductMappingOptions,
  getSession,
  listChannels,
  listProductMappings,
  listSyncedRecords,
  saveAmazonSetup,
  saveProductMapping,
  syncChannel,
  updateSyncedRecord,
  cancelFulfillmentOrder,
} from "@/lib/api";
import { useCommerceStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const menu = [
  { label: "Dashboard", icon: Gauge },
  { label: "Fulfillment", icon: PackageCheck },
  { label: "Company", icon: Building2 },
  { label: "Users", icon: Users },
  { label: "Orders", icon: ShoppingCart },
  { label: "Products", icon: Package },
  { label: "Product Mapping", icon: Workflow },
  { label: "Inventory", icon: Boxes },
  { label: "Channels", icon: PlugZap },
  { label: "Shipping", icon: Truck },
  { label: "Customers", icon: UserRound },
  { label: "Finance", icon: CircleDollarSign },
  { label: "Ads", icon: Activity },
  { label: "Automation", icon: Workflow },
  { label: "Reports", icon: ClipboardList },
  { label: "Settings", icon: Settings },
];

const chartColors = ["#3730a3", "#2563eb", "#b45309", "#d97706", "#64748b", "#16a34a"];
const defaultShopifyShop = "kghkjm-bs.myshopify.com";
const zeroKpis = [
  { label: "Today's Sales", value: "₹0", change: "Sync Shopify data", tone: "green" },
  { label: "Yesterday Sales", value: "₹0", change: "No synced orders", tone: "blue" },
  { label: "Monthly Sales", value: "₹0", change: "No synced orders", tone: "green" },
  { label: "Total Orders", value: "0", change: "0 pending", tone: "blue" },
  { label: "Products", value: "0", change: "0 low stock", tone: "green" },
  { label: "Customers", value: "0", change: "0 channels", tone: "teal" },
  { label: "Delivered", value: "0", change: "0% fulfilment", tone: "green" },
  { label: "Cancelled", value: "0", change: "0% orders", tone: "green" },
];
const zeroSalesTrend = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"].map((day) => ({ day, sales: 0, profit: 0, orders: 0 }));
const zeroChannelMix = [{ name: "No synced sales", value: 100 }];

function formatCurrency(value) {
  return `₹${Math.round(value / 1000)}k`;
}

function withKpiIcons(items) {
  const icons = [CircleDollarSign, Gauge, Activity, ShoppingCart, Package, Users, Truck, X];
  return items.map((item, index) => ({ ...item, icon: item.icon || icons[index % icons.length] }));
}

function formatChannelSync(sync) {
  if (!sync?.lastSyncAt) return "not synced yet";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(sync.lastSyncAt));
}

function Sidebar({ open, setOpen, activeView, setActiveView }) {
  return (
    <>
      <button
        aria-label="Close navigation"
        className={cn("fixed inset-0 z-30 bg-slate-950/35 lg:hidden", open ? "block" : "hidden")}
        onClick={() => setOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[var(--line)] bg-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--line)] px-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-[var(--navy)] text-white">
              <Layers3 size={21} />
            </div>
            <div>
              <p className="text-sm font-bold leading-5">CommerceOS</p>
              <p className="text-xs text-[var(--muted)]">Sukirti Commerce Hub</p>
            </div>
          </div>
          <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-4 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Operations</div>
          <div className="space-y-1">
            {menu.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setActiveView(item.label);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition",
                  item.label === activeView
                    ? "bg-indigo-50 text-indigo-800"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="border-t border-[var(--line)] p-4">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
              <ShieldCheck size={16} />
              Role Matrix
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {roles.slice(0, 5).map((role) => (
                <Badge key={role} tone="indigo">
                  {role}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function Topbar({ setOpen, session, onSyncAll, canSync }) {
  const { company, period, setPeriod } = useCommerceStore();
  const router = useRouter();
  const companyName = session?.company?.name || company;

  function logout() {
    clearSession();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-white/90 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <button className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <div className="hidden min-w-0 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 md:flex">
          <Building2 size={17} className="text-indigo-700" />
          <span className="truncate text-sm font-semibold">{companyName}</span>
          <ChevronDown size={16} className="text-slate-500" />
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="h-10 w-full rounded-md border border-[var(--line)] bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
            placeholder="Search orders, SKU, customer, shipment, invoice"
          />
        </div>
        <select
          className="hidden h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-600 md:block"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
        >
          <option>Today</option>
          <option>Yesterday</option>
          <option>This Month</option>
          <option>Last 90 Days</option>
        </select>
        <Button variant="secondary" className="hidden sm:inline-flex" onClick={onSyncAll} disabled={!canSync}>
          <RefreshCw size={16} />
          Sync
        </Button>
        <button className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-slate-600 hover:bg-slate-50" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <button
          className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-slate-600 hover:bg-slate-50"
          aria-label="Logout"
          onClick={logout}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}

function KpiCard({ item }) {
  const Icon = item.icon || Gauge;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--muted)]">{item.label}</p>
          <p className="mt-2 text-2xl font-bold tracking-normal">{item.value}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-md bg-slate-100 text-slate-700">
          <Icon size={19} />
        </div>
      </div>
      <Badge tone={item.tone} className="mt-4">
        {item.change}
      </Badge>
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
          {entry.name}: {entry.dataKey === "orders" ? entry.value : formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

const PERIOD_LABELS = { today: "Today", yesterday: "Yesterday", month: "This Month", last90: "Last 90 Days" };

function formatPeriodMoney(value) {
  const n = Math.round(value || 0);
  return n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${n}`;
}

function SalesCharts({ salesTrend, channelMix, period, periodSales, periodOrderCount }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sales, Profit, Orders</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">Daily operating pulse across connected channels.</p>
          </div>
          <Badge tone="indigo">{PERIOD_LABELS[period] || "Today"}: {formatPeriodMoney(periodSales)} · {periodOrderCount || 0} orders</Badge>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#3730a3" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3730a3" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e5eaf1" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatCurrency} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="sales" name="Sales" stroke="#3730a3" fill="url(#salesGradient)" strokeWidth={3} />
                <Area type="monotone" dataKey="profit" name="Profit" stroke="#b45309" fill="transparent" strokeWidth={3} />
                <Bar dataKey="orders" name="Orders" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Channel Wise</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">Revenue contribution by source.</p>
          </div>
          <Button variant="ghost" className="h-9 px-2" aria-label="Filter channels">
            <Filter size={16} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={channelMix} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {channelMix.map((entry, index) => (
                    <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {channelMix.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: chartColors[index] }} />
                  {item.name}
                </span>
                <span className="font-semibold">{item.value}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChannelsPanel({
  connectedChannels,
  setConnectedChannels,
  channelsError,
  setChannelsError,
  isLoadingChannels,
  onRefreshData,
}) {
  const [showConnect, setShowConnect] = useState(false);
  const [shop, setShop] = useState(defaultShopifyShop);
  const [connectError, setConnectError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState("");

  async function handleConnect(event) {
    event.preventDefault();
    setConnectError("");
    setIsConnecting(true);

    try {
      const result = await createShopifyConnection(shop);
      window.location.href = result.installUrl;
    } catch (error) {
      setConnectError(error.message);
      setIsConnecting(false);
    }
  }

  async function handleSync(channelId) {
    setChannelsError("");
    setSyncingId(channelId);

    try {
      const result = await syncChannel(channelId);
      setConnectedChannels((current) =>
        current.map((channel) => (String(channel._id || channel.id) === String(channelId) ? { ...channel, ...result.channel, _id: channel._id || result.channel.id } : channel)),
      );
      await onRefreshData?.();
    } catch (error) {
      setChannelsError(error.message);
    } finally {
      setSyncingId("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Active Integrations</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">All connected channels and their sync health.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {channelsError ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
            <span className="mt-0.5 shrink-0">⚠</span>{channelsError}
          </div>
        ) : null}
        {isLoadingChannels ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--muted)]">
            <RefreshCw size={14} className="animate-spin shrink-0" />
            Loading connected channels…
          </div>
        ) : null}
        {!isLoadingChannels && !connectedChannels.length ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-soft)] px-4 py-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100">
              <PlugZap size={22} className="text-slate-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-700">No channels connected</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Connect Shopify or Amazon above to start syncing.</p>
            </div>
          </div>
        ) : null}
        {connectedChannels.map((channel) => {
          const channelId = channel._id || channel.id;
          const isSyncing = syncingId === channelId || channel.sync?.orders === "running";
          const orderCount = channel.metrics?.orderCount || 0;
          const salesTotal = Number(channel.metrics?.salesTotal || 0);
          const currency = channel.metrics?.currency || "INR";
          const colors = PROVIDER_COLORS[channel.provider] || PROVIDER_COLORS.default;
          const syncFailed = channel.sync?.orders === "failed";

          return (
            <div key={channelId} className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white text-base font-extrabold ring-2", colors.bg, colors.ring)}>
                    {colors.label}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900">{channel.name || channel.provider}</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted)] truncate">{channel.shop}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="ghost" className="h-8 w-8 p-0 rounded-lg" aria-label="Logs">
                    <ClipboardList size={14} />
                  </Button>
                  <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => handleSync(channelId)} disabled={isSyncing}>
                    <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
                    {isSyncing ? "Syncing" : "Sync"}
                  </Button>
                </div>
              </div>

              {/* Metrics */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Orders</p>
                  <p className="text-sm font-bold text-slate-900">{orderCount.toLocaleString("en-IN")}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Revenue</p>
                  <p className="text-sm font-bold text-slate-900">
                    {currency === "INR" ? "₹" : ""}{salesTotal >= 1000 ? `${Math.round(salesTotal / 1000)}k` : salesTotal}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Last Sync</p>
                  <p className="text-sm font-bold text-slate-900">{formatChannelSync(channel.sync)}</p>
                </div>
              </div>

              {/* Sync health bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sync Health</span>
                  <span className={cn("text-[10px] font-semibold", syncFailed ? "text-rose-600" : "text-emerald-600")}>
                    {syncFailed ? "Degraded" : "Healthy"}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div
                    className={cn("h-1.5 rounded-full transition-all", syncFailed ? "bg-rose-400" : "bg-emerald-500")}
                    style={{ width: syncFailed ? "38%" : "98%" }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ShopifyConnectForm({ compact = false }) {
  const [shop, setShop] = useState(defaultShopifyShop);
  const [connectError, setConnectError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  async function handleConnect(event) {
    event.preventDefault();
    setConnectError("");
    setIsConnecting(true);
    try {
      const result = await createShopifyConnection(shop);
      window.location.href = result.installUrl;
    } catch (error) {
      setConnectError(error.message);
      setIsConnecting(false);
    }
  }

  return (
    <form onSubmit={handleConnect} className="space-y-3">
      <Button type="submit" className="w-full h-10 font-semibold" disabled={isConnecting}>
        <PlugZap size={16} />
        {isConnecting ? "Opening Shopify…" : "Connect with Shopify"}
      </Button>
      <div className="relative">
        <input
          id={compact ? "shopify-shop-compact" : "shopify-shop"}
          className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-slate-400"
          placeholder="Dev store: your-store.myshopify.com"
          value={shop}
          onChange={(event) => setShop(event.target.value)}
        />
      </div>
      {connectError ? (
        <p className="flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-2 text-xs font-medium text-rose-700">
          <span>⚠</span>{connectError}
        </p>
      ) : null}
      <p className="text-[11px] leading-4 text-slate-500">
        Installs the public app via Shopify OAuth. For dev stores, enter the domain above.
      </p>
    </form>
  );
}

function AmazonConnectForm({ compact = false }) {
  const [form, setForm] = useState({
    applicationId: "",
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    sellerId: "",
    sellerCentralUrl: "https://sellercentral.amazon.in",
    marketplaceId: "A21TJRUUN4KGV",
    spApiEndpoint: "https://sellingpartnerapi-eu.amazon.com",
    syncDays: "30",
    draftMode: true,
  });
  const [connectError, setConnectError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleConnect(event) {
    event.preventDefault();
    setConnectError("");
    setIsConnecting(true);
    try {
      await saveAmazonSetup(form);
      if (form.refreshToken.trim()) {
        await createAmazonPrivateConnection({ refreshToken: form.refreshToken, sellerId: form.sellerId });
        window.location.href = "/panel?view=Channels&provider=amazon&status=connected";
        return;
      }
      const result = await createAmazonConnection();
      window.location.href = result.installUrl;
    } catch (error) {
      setConnectError(error.message);
      setIsConnecting(false);
    }
  }

  const inputClass = "h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-xs outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100 placeholder:text-slate-400";

  return (
    <form onSubmit={handleConnect} className="space-y-2.5">
      <div className="grid gap-2">
        <input className={inputClass} placeholder="Refresh token (private app)" value={form.refreshToken} onChange={(e) => setField("refreshToken", e.target.value)} />
        <input className={inputClass} placeholder="Seller ID (optional)" value={form.sellerId} onChange={(e) => setField("sellerId", e.target.value)} />
      </div>
      <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:underline">
        {showAdvanced ? "Hide" : "Show"} OAuth / advanced fields
        <ChevronDown size={12} className={cn("transition-transform", showAdvanced && "rotate-180")} />
      </button>
      {showAdvanced && (
        <div className="grid gap-2">
          <input className={inputClass} placeholder="Application ID: amzn1.sellerapps.app.xxxx" value={form.applicationId} onChange={(e) => setField("applicationId", e.target.value)} />
          <input className={inputClass} placeholder="LWA client ID" value={form.clientId} onChange={(e) => setField("clientId", e.target.value)} />
          <input className={inputClass} type="password" placeholder="LWA client secret" value={form.clientSecret} onChange={(e) => setField("clientSecret", e.target.value)} />
          <input className={inputClass} placeholder="Seller Central URL" value={form.sellerCentralUrl} onChange={(e) => setField("sellerCentralUrl", e.target.value)} />
          <input className={inputClass} placeholder="Marketplace ID" value={form.marketplaceId} onChange={(e) => setField("marketplaceId", e.target.value)} />
          <input className={inputClass} placeholder="SP-API endpoint" value={form.spApiEndpoint} onChange={(e) => setField("spApiEndpoint", e.target.value)} />
          <input className={inputClass} placeholder="Sync days" value={form.syncDays} onChange={(e) => setField("syncDays", e.target.value)} />
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={form.draftMode} onChange={(e) => setField("draftMode", e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
            Draft app authorization
          </label>
        </div>
      )}
      <Button type="submit" className="w-full h-10 font-semibold" disabled={isConnecting}>
        <PlugZap size={16} />
        {isConnecting ? "Connecting…" : form.refreshToken.trim() ? "Connect Private App" : "Connect via OAuth"}
      </Button>
      {connectError ? (
        <p className="flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-2 text-xs font-medium text-rose-700">
          <span>⚠</span>{connectError}
        </p>
      ) : null}
    </form>
  );
}

// Provider brand colours (bg, text, ring)
const PROVIDER_COLORS = {
  shopify:    { bg: "bg-emerald-600", ring: "ring-emerald-200", label: "S" },
  amazon:     { bg: "bg-amber-500",   ring: "ring-amber-200",   label: "A" },
  woocommerce:{ bg: "bg-violet-600",  ring: "ring-violet-200",  label: "W" },
  flipkart:   { bg: "bg-blue-600",    ring: "ring-blue-200",    label: "F" },
  meesho:     { bg: "bg-pink-600",    ring: "ring-pink-200",    label: "M" },
  default:    { bg: "bg-slate-500",   ring: "ring-slate-200",   label: "?" },
};

function ChannelCard({ channel, connectedChannel, onSyncChannel }) {
  const isShopify = channel.provider === "shopify";
  const isAmazon = channel.provider === "amazon";
  const isConnected = Boolean(connectedChannel);
  const isAvailable = channel.status === "Available";
  const colors = PROVIDER_COLORS[channel.provider] || PROVIDER_COLORS.default;
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState("");
  const canEditShopify =
    !isShopify ||
    ["write_products", "write_orders", "write_customers"].every((scope) => connectedChannel?.scopes?.includes(scope));

  async function reconnectShopify() {
    setReconnectError("");
    setIsReconnecting(true);
    try {
      const result = await createShopifyConnection(connectedChannel?.shop || defaultShopifyShop);
      window.location.href = result.installUrl;
    } catch (error) {
      setReconnectError(error.message);
      setIsReconnecting(false);
    }
  }

  const orderCount = connectedChannel?.metrics?.orderCount || 0;
  const salesTotal = Number(connectedChannel?.metrics?.salesTotal || 0);
  const currency = connectedChannel?.metrics?.currency || "INR";

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md",
        isConnected ? "border-emerald-200" : "border-[var(--line)]",
      )}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 p-5 pb-4">
        <div className="flex items-center gap-3">
          {/* Provider logo tile */}
          <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white text-lg font-extrabold ring-4", colors.bg, colors.ring)}>
            {colors.label}
          </div>
          <div>
            <h3 className="font-bold text-slate-900">{channel.name}</h3>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{channel.phase}</p>
          </div>
        </div>
        {/* Status badge */}
        {isConnected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        ) : isAvailable ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
            Available
          </span>
        ) : channel.status === "Next" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
            Coming next
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
            Planned
          </span>
        )}
      </div>

      {/* Description */}
      <p className="px-5 pb-4 text-sm leading-6 text-[var(--muted)]">{channel.description}</p>

      {/* Connected metrics strip */}
      {isConnected && (
        <div className="mx-5 mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Orders Synced</p>
            <p className="mt-0.5 text-lg font-extrabold text-slate-900">{orderCount.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Revenue</p>
            <p className="mt-0.5 text-lg font-extrabold text-slate-900">
              {currency === "INR" ? "₹" : currency + " "}{salesTotal >= 1000 ? `${Math.round(salesTotal / 1000)}k` : salesTotal.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="col-span-2 flex items-center gap-1.5 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
            <RefreshCw size={11} />
            Last sync: {formatChannelSync(connectedChannel.sync)}
          </div>
        </div>
      )}

      {/* Action area */}
      <div className="mt-auto px-5 pb-5">
        {isConnected ? (
          <div className="space-y-2">
            <Button className="w-full h-10 font-semibold" onClick={() => onSyncChannel?.(connectedChannel._id || connectedChannel.id)}>
              <RefreshCw size={15} />
              Sync {channel.name}
            </Button>
            {!canEditShopify ? (
              <>
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Reconnect once to approve product, order &amp; customer editing.
                </p>
                <Button variant="secondary" className="w-full h-9" onClick={reconnectShopify} disabled={isReconnecting}>
                  <PlugZap size={14} />
                  {isReconnecting ? "Opening Shopify…" : "Reconnect for Edit Access"}
                </Button>
                {reconnectError ? <p className="text-xs font-medium text-rose-700">{reconnectError}</p> : null}
              </>
            ) : null}
          </div>
        ) : isShopify ? (
          <ShopifyConnectForm compact />
        ) : isAmazon ? (
          <AmazonConnectForm compact />
        ) : (
          <button
            disabled
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-2.5 text-sm font-semibold text-slate-400 cursor-not-allowed"
          >
            <PlugZap size={15} />
            Connect Soon
          </button>
        )}
      </div>
    </div>
  );
}

export function ChannelsView({ connectedChannels, channelsError, isLoadingChannels, setConnectedChannels, setChannelsError, onRefreshData, onSyncAll }) {
  async function syncOne(channelId) {
    setChannelsError("");

    try {
      const result = await syncChannel(channelId);
      setConnectedChannels((current) =>
        current.map((channel) => (String(channel._id || channel.id) === String(channelId) ? { ...channel, ...result.channel, _id: channel._id || result.channel.id } : channel)),
      );
      await onRefreshData?.();
    } catch (error) {
      setChannelsError(error.message);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge tone="indigo">Channel Integrations</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">Channels</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] md:text-base">
            Connect your marketplaces and stores to sync orders, products, and inventory in real time.
          </p>
        </div>
        <Button onClick={onSyncAll} disabled={!connectedChannels.length}>
          <RefreshCw size={16} />
          Sync Connected Channels
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {channelCatalog.map((channel) => (
          <ChannelCard
            key={channel.provider}
            channel={channel}
            connectedChannel={connectedChannels.find((entry) => entry.provider === channel.provider && entry.status === "connected") || null}
            onSyncChannel={syncOne}
          />
        ))}
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <ChannelsPanel
          connectedChannels={connectedChannels}
          setConnectedChannels={setConnectedChannels}
          channelsError={channelsError}
          setChannelsError={setChannelsError}
          isLoadingChannels={isLoadingChannels}
          onRefreshData={onRefreshData}
        />
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Channel Guide</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">How channel data flows into CommerceOS.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { step: "01", title: "Connect", desc: "Authorise your store via OAuth. Each channel is tied to your company workspace." },
              { step: "02", title: "Sync", desc: "Pull orders, products, customers, and inventory from the marketplace in one click." },
              { step: "03", title: "Operate", desc: "Fulfil, ship, and report across all channels from a single dashboard." },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-xs font-extrabold text-indigo-700">
                  {item.step}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{item.desc}</p>
                </div>
              </div>
            ))}
            <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800">
              <span className="font-semibold">Tip:</span> Revenue shown on the dashboard excludes cancelled and refunded orders — matching Shopify&rsquo;s analytics view.
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function OrdersPanel({ orders }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Central Order Panel</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">Confirm, pack, ship, cancel, return, refund, exchange.</p>
        </div>
        <Button>
          <Sparkles size={16} />
          Bulk Ship
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-xs uppercase text-slate-500">
              <th className="py-3 pr-4 font-semibold">Order</th>
              <th className="py-3 pr-4 font-semibold">Customer</th>
              <th className="py-3 pr-4 font-semibold">Channel</th>
              <th className="py-3 pr-4 font-semibold">Status</th>
              <th className="py-3 pr-4 font-semibold">Payment</th>
              <th className="py-3 pr-4 font-semibold">Courier</th>
              <th className="py-3 pr-0 text-right font-semibold">Profit</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-slate-100 last:border-0">
                <td className="py-3 pr-4 font-semibold">{order.id}</td>
                <td className="py-3 pr-4">{order.customer}</td>
                <td className="py-3 pr-4">{order.channel}</td>
                <td className="py-3 pr-4">
                  <Badge tone={order.status === "Return" ? "rose" : "blue"}>{order.status}</Badge>
                </td>
                <td className="py-3 pr-4">{order.payment}</td>
                <td className="py-3 pr-4">{order.courier}</td>
                <td className={cn("py-3 pr-0 text-right font-bold", String(order.profit).startsWith("-") ? "text-rose-600" : "text-emerald-700")}>
                  {order.profit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function InventoryPanel({ inventory }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Inventory & Raw Materials</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">Stock, reserved, recipe deduction, and low stock alerts.</p>
        </div>
        <Button variant="secondary">
          <Boxes size={16} />
          Create PO
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {inventory.map((item) => (
          <div key={item.sku} className="grid gap-3 rounded-lg border border-[var(--line)] p-3 md:grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_auto] md:items-center">
            <div>
              <p className="font-semibold">{item.product}</p>
              <p className="text-sm text-[var(--muted)]">{item.sku}</p>
            </div>
            <Metric label="Available" value={item.available.toLocaleString("en-IN")} />
            <Metric label="Reserved" value={item.reserved.toLocaleString("en-IN")} />
            <Metric label="Raw Cover" value={item.raw} />
            <Badge tone={item.alert === "Low" ? "rose" : item.alert === "Watch" ? "amber" : "green"}>{item.alert}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}

function FinancePanel() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Order Profit Calculator</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">Real order-level profit after costs, fees, GST, and ads.</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={financeBreakdown} layout="vertical" margin={{ left: 18, right: 8, top: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e5eaf1" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={92} />
              <Tooltip formatter={(value) => `${value}%`} />
              <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                {financeBreakdown.map((item, index) => (
                  <Cell key={item.label} fill={chartColors[index % chartColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function AutomationPanel() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Automation Builder</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">Order, abandoned checkout, inventory, and repeat customer workflows.</p>
        </div>
        <Button variant="secondary">
          <Workflow size={16} />
          New Rule
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {automations.map((item) => (
          <div key={item.trigger} className="rounded-lg border border-[var(--line)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{item.trigger}</p>
              <Badge tone={item.status === "Active" ? "green" : "slate"}>{item.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">{item.action}</p>
            <p className="mt-3 text-xs font-semibold uppercase text-slate-500">{item.runs} runs this month</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}


const modulePages = {
  Orders: {
    eyebrow: "Order Operations",
    title: "Order Management",
    subtitle: "Central order panel for Shopify, WooCommerce, Amazon, Flipkart, manual, phone, WhatsApp, Instagram, and Facebook orders.",
    actions: ["Confirm", "Pack", "Ship", "Cancel", "Return", "Refund", "Exchange", "Print Invoice", "Print Label"],
    cards: [
      ["Pending Orders", "184", "Needs confirmation and stock allocation."],
      ["Processing Orders", "312", "Ready for packing, label, and invoice."],
      ["Shipped", "1,842", "Courier handover completed."],
      ["Returns", "46", "Return, refund, or exchange review."],
    ],
  },
  Products: {
    eyebrow: "Catalog",
    title: "Product Management",
    subtitle: "Master product catalog with SKU, barcode, brand, category, GST, HSN, weight, dimensions, images, and variants.",
    actions: ["Create Product", "Add Variant", "Map SKU", "Upload Images", "Bulk Import"],
    cards: [
      ["Master Products", "428", "Single source of truth for every channel."],
      ["Mapped SKUs", "1,942", "Shopify, WooCommerce, Amazon, and Flipkart mapping."],
      ["Variants", "836", "Color, size, and weight combinations."],
      ["Missing Data", "29", "Products needing GST, HSN, image, or dimensions."],
    ],
  },
  Inventory: {
    eyebrow: "Stock Control",
    title: "Inventory",
    subtitle: "Stock, warehouse, reserved, available, damaged, lost, low-stock alerts, transfer, barcode, batch, and expiry tracking.",
    actions: ["Adjust Stock", "Transfer", "Scan Barcode", "Create Alert", "View History"],
    cards: [
      ["Available Stock", "18,420", "Sellable units across warehouses."],
      ["Reserved", "592", "Committed to open orders."],
      ["Low Stock", "14", "SKUs below reorder level."],
      ["Damaged/Lost", "37", "Needs audit and adjustment."],
    ],
  },
  CRM: {
    eyebrow: "Customer Relations",
    title: "CRM",
    subtitle: "Customer profile with orders, returns, calls, WhatsApp, emails, notes, tags, lifetime value, RFM score, and segments.",
    actions: ["Create Segment", "Add Follow-up", "Add Note", "Tag Customer", "Export"],
    cards: [
      ["Customers", "22,418", "Unified customer profiles."],
      ["Repeat Customers", "38.2%", "Customers with more than one order."],
      ["Follow-ups", "146", "Calls, WhatsApp, and reminders due."],
      ["High LTV", "824", "Top customers for retention campaigns."],
    ],
  },
  Finance: {
    eyebrow: "Finance",
    title: "Finance",
    subtitle: "Income, expenses, profit, GST, tax, cash flow, wallet, COD, bank, UPI, bills, and invoices.",
    actions: ["Add Expense", "Attach Bill", "View GST", "COD Report", "Cash Flow"],
    cards: [
      ["Income", "₹86.4L", "Monthly booked revenue."],
      ["Expenses", "₹11.2L", "Ads, shipping, packaging, raw material, salary."],
      ["Profit", "₹18.7L", "Estimated contribution after costs."],
      ["COD Pending", "₹9.8L", "Courier remittance pending."],
    ],
  },
  Ads: {
    eyebrow: "Ad Performance",
    title: "Ads Tracking",
    subtitle: "Meta, Google, Amazon Ads, manual spend, ROAS, CPA, CTR, orders, revenue, and campaign-sale mapping.",
    actions: ["Connect Meta", "Connect Google", "Add Manual Spend", "Map Campaign", "View ROAS"],
    cards: [
      ["Spend", "₹6.4L", "This month across platforms."],
      ["ROAS", "4.8x", "Revenue generated per ad rupee."],
      ["CPA", "₹218", "Cost per acquired order."],
      ["Tracked Orders", "2,940", "Orders mapped to campaign source."],
    ],
  },
  Automation: {
    eyebrow: "Automation",
    title: "Automation",
    subtitle: "Zapier-like builder for order received, order shipped, low stock, abandoned checkout, and repeat customer journeys.",
    actions: ["New Rule", "Add Trigger", "Add Delay", "Send WhatsApp", "Send Email"],
    cards: [
      ["Active Rules", "12", "Currently running automations."],
      ["Runs", "8,422", "Automation executions this month."],
      ["Drafts", "4", "Rules waiting for activation."],
      ["Failures", "7", "Needs retry or configuration check."],
    ],
  },
  Reports: {
    eyebrow: "Business Reports",
    title: "Reports",
    subtitle: "Sales, profit, growth, top products, worst products, top customers, repeat %, state, city, channel, payment, courier, RTO, refund, return.",
    actions: ["Sales Report", "Profit Report", "Inventory Report", "Courier Report", "Export CSV"],
    cards: [
      ["Sales Reports", "Ready", "Daily, monthly, and channel-wise summaries."],
      ["Profit Reports", "Ready", "Order-level profit and contribution."],
      ["Inventory Reports", "Ready", "Stock and raw material movement."],
      ["Courier Reports", "Ready", "RTO, NDR, delivery, and refund analysis."],
    ],
  },
  Settings: {
    eyebrow: "Settings",
    title: "Settings",
    subtitle: "Company, users, roles, permissions, security, API configuration, notifications, and audit setup.",
    actions: ["Company Details", "Manage Users", "Roles", "Security", "API Keys"],
    cards: [
      ["Authentication", "Active", "Secure login and signup enabled."],
      ["Roles", "7", "Owner, Admin, Manager, Support, Warehouse, Marketing, Accountant."],
      ["Permissions", "Mapped", "Role-based access enforced across every module."],
      ["Audit Logs", "Coming Soon", "Team activity tracking."],
    ],
  },
};

const recordResourceByView = {
  Orders: "orders",
  Products: "products",
  Customers: "customers",
};

function recordTitle(name) {
  return name;
}

function tagsText(tags) {
  return Array.isArray(tags) ? tags.join(", ") : String(tags || "");
}

function recordDisplayName(resource, record) {
  if (!record) return "";
  if (resource === "orders") return record.name || record.externalId;
  if (resource === "products") return record.title || record.externalId;
  return record.name || record.email || record.phone || record.externalId;
}

function recordSubtitle(resource, record) {
  if (!record) return "";
  if (resource === "orders") return `${record.customerName || "Guest customer"} - ${record.currency || "INR"} ${Number(record.totalPrice || 0).toLocaleString("en-IN")}`;
  if (resource === "products") return `${record.vendor || "Shopify"} - ${record.variants?.length || 0} variants`;
  return `${record.email || "No email"} - ${record.ordersCount || 0} orders`;
}

function editablePayload(resource, record) {
  if (resource === "orders") {
    return {
      email: record.email || "",
      phone: record.phone || "",
      note: record.note || "",
      tags: tagsText(record.tags),
    };
  }

  if (resource === "products") {
    return {
      title: record.title || "",
      vendor: record.vendor || "",
      productType: record.productType || "",
      status: record.status || "active",
      tags: tagsText(record.tags),
      variants: (record.variants || []).map((variant) => ({
        externalId: variant.externalId,
        title: variant.title || "",
        sku: variant.sku || "",
        price: variant.price ?? "",
        barcode: variant.barcode || "",
      })),
    };
  }

  return {
    firstName: record.firstName || "",
    lastName: record.lastName || "",
    email: record.email || "",
    phone: record.phone || "",
    note: record.note || "",
    tags: tagsText(record.tags),
  };
}

function FormField({ label, value, onChange, as = "input" }) {
  const className =
    "mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100";
  const safeValue = value ?? "";

  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      {as === "textarea" ? (
        <textarea className={cn(className, "min-h-24 resize-y")} value={safeValue} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className={className} value={safeValue} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function recordStatus(resource, record) {
  if (resource === "orders") return record.fulfillmentStatus || record.financialStatus || "open";
  if (resource === "products") return record.status || "product";
  return record.state || "customer";
}

function recordSearchText(resource, record) {
  const common = [recordDisplayName(resource, record), record.channelName, record.channelShop, tagsText(record.tags)];

  if (resource === "orders") {
    return [...common, record.customerName, record.email, record.phone, record.financialStatus, record.fulfillmentStatus, ...(record.lineItems || []).map((item) => `${item.title} ${item.sku}`)].join(" ").toLowerCase();
  }

  if (resource === "products") {
    return [...common, record.vendor, record.productType, record.status, ...(record.variants || []).map((variant) => `${variant.title} ${variant.sku} ${variant.barcode}`)].join(" ").toLowerCase();
  }

  return [...common, record.firstName, record.lastName, record.email, record.phone, record.defaultAddress?.city, record.defaultAddress?.province].join(" ").toLowerCase();
}

function matchesRecordFilters(resource, record, filters) {
  const query = filters.query.trim().toLowerCase();
  const status = filters.status;
  const channel = filters.channel;
  const quick = filters.quick;

  if (query && !recordSearchText(resource, record).includes(query)) return false;
  if (status !== "all" && recordStatus(resource, record) !== status) return false;
  if (channel !== "all" && String(record.channelId) !== channel) return false;

  if (quick === "pending" && resource === "orders") return record.fulfillmentStatus === "unfulfilled";
  if (quick === "paid" && resource === "orders") return record.financialStatus === "paid";
  if (quick === "low-stock" && resource === "products") return Number(record.totalInventory || 0) <= 5;
  if (quick === "draft" && resource === "products") return record.status === "draft";
  if (quick === "with-orders" && resource === "customers") return Number(record.ordersCount || 0) > 0;
  if (quick === "missing-email" && resource === "customers") return !record.email;

  return true;
}

function recordMoney(value, currency = "INR") {
  return `${currency || "INR"} ${Number(value || 0).toLocaleString("en-IN")}`;
}

function RecordFilters({ resource, records, filters, setFilters }) {
  const statusOptions = Array.from(new Set(records.map((record) => recordStatus(resource, record)).filter(Boolean))).sort();
  const channels = Array.from(
    new Map(records.map((record) => [String(record.channelId), { id: String(record.channelId), label: record.channelName || record.channelShop || "Channel" }])).values(),
  );
  const quickOptions =
    resource === "orders"
      ? [
          ["all", "All"],
          ["pending", "Pending"],
          ["paid", "Paid"],
        ]
      : resource === "products"
        ? [
            ["all", "All"],
            ["low-stock", "Low Stock"],
            ["draft", "Draft"],
          ]
        : [
            ["all", "All"],
            ["with-orders", "Has Orders"],
            ["missing-email", "Missing Email"],
          ];

  function setFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="grid gap-3 border-b border-[var(--line)] p-4 lg:grid-cols-[minmax(260px,1fr)_180px_180px_220px_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
        <input
          className="h-10 w-full rounded-md border border-[var(--line)] bg-white pl-10 pr-3 text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
          placeholder={`Search ${resource}`}
          value={filters.query}
          onChange={(event) => setFilter("query", event.target.value)}
        />
      </div>
      <select
        className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-600"
        value={filters.status}
        onChange={(event) => setFilter("status", event.target.value)}
      >
        <option value="all">All status</option>
        {statusOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-600"
        value={filters.channel}
        onChange={(event) => setFilter("channel", event.target.value)}
      >
        <option value="all">All channels</option>
        {channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {channel.label}
          </option>
        ))}
      </select>
      <div className="flex rounded-md border border-[var(--line)] bg-white p-1">
        {quickOptions.map(([value, label]) => (
          <button
            key={value}
            className={cn("h-8 flex-1 rounded px-2 text-xs font-semibold", filters.quick === value ? "bg-indigo-700 text-white" : "text-slate-600 hover:bg-slate-100")}
            onClick={() => setFilter("quick", value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <Button
        variant="secondary"
        className="h-10"
        onClick={() => setFilters({ query: "", status: "all", channel: "all", quick: "all" })}
      >
        <X size={16} />
        Clear
      </Button>
    </div>
  );
}

function OrderCells({ record }) {
  return (
    <>
      <td className="py-3 pr-4 align-top">
        <p className="font-bold">{record.name || record.externalId}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{record.customerName || "Guest customer"}</p>
        <p className="mt-1 text-xs text-slate-500">{record.email || record.phone || "No contact"}</p>
      </td>
      <td className="py-3 pr-4 align-top">
        <div className="max-w-[280px] space-y-1">
          {(record.lineItems || []).slice(0, 3).map((item) => (
            <p key={item.externalId || item.sku || item.title} className="truncate text-xs">
              {item.quantity}x {item.title} {item.sku ? `(${item.sku})` : ""}
            </p>
          ))}
          {(record.lineItems || []).length > 3 ? <p className="text-xs font-semibold text-indigo-700">+{record.lineItems.length - 3} more</p> : null}
        </div>
        {record.note && (
          <p className="mt-1.5 max-w-[280px] rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 border border-amber-200/70 truncate">
            📝 {record.note}
          </p>
        )}
      </td>
      <td className="py-3 pr-4 align-top">
        <p className="font-bold">{recordMoney(record.totalPrice, record.currency)}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">Tax {recordMoney(record.totalTax, record.currency)}</p>
      </td>
      <td className="py-3 pr-4 align-top">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={record.financialStatus === "paid" ? "green" : "amber"}>{record.financialStatus || "unknown"}</Badge>
          <Badge tone={record.fulfillmentStatus === "fulfilled" ? "green" : "blue"}>{record.fulfillmentStatus || "open"}</Badge>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">{record.shippingAddress?.city || "No city"}, {record.shippingAddress?.province || "No state"}</p>
      </td>
    </>
  );
}

function ProductCells({ record }) {
  return (
    <>
      <td className="py-3 pr-4 align-top">
        <div className="flex gap-3">
          {record.imageUrl ? <img src={record.imageUrl} alt="" className="h-12 w-12 rounded-md border border-[var(--line)] object-cover" /> : <div className="grid h-12 w-12 place-items-center rounded-md bg-slate-100"><Package size={18} /></div>}
          <div className="min-w-0">
            <p className="line-clamp-2 font-bold">{record.title || record.externalId}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{record.vendor || "Shopify"} / {record.productType || "No type"}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 align-top">
        <div className="max-w-[300px] space-y-1">
          {(record.variants || []).slice(0, 3).map((variant) => (
            <p key={variant.externalId || variant.sku || variant.title} className="truncate text-xs">
              {variant.title}: {variant.sku || "No SKU"} / {recordMoney(variant.price, "INR")} / stock {Number(variant.inventoryQuantity || 0).toLocaleString("en-IN")}
            </p>
          ))}
          {(record.variants || []).length > 3 ? <p className="text-xs font-semibold text-indigo-700">+{record.variants.length - 3} variants</p> : null}
        </div>
      </td>
      <td className="py-3 pr-4 align-top">
        <p className={cn("font-bold", Number(record.totalInventory || 0) <= 5 ? "text-amber-700" : "text-emerald-700")}>{Number(record.totalInventory || 0).toLocaleString("en-IN")}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">Total available</p>
      </td>
      <td className="py-3 pr-4 align-top">
        <Badge tone={record.status === "active" ? "green" : "slate"}>{record.status || "product"}</Badge>
        <p className="mt-2 max-w-[220px] truncate text-xs text-[var(--muted)]">{tagsText(record.tags) || "No tags"}</p>
      </td>
    </>
  );
}

const FOLLOWUP_STATUS_STYLES = {
  new:                 "bg-slate-100 text-slate-600",
  follow_up_scheduled: "bg-violet-100 text-violet-700",
  converted:           "bg-green-100 text-green-700",
  no_response:         "bg-amber-100 text-amber-700",
  closed:              "bg-rose-100 text-rose-700",
};

const FOLLOWUP_STATUS_LABELS = {
  new: "New",
  follow_up_scheduled: "Follow Up",
  converted: "Converted",
  no_response: "No Response",
  closed: "Closed",
};

function CustomerCells({ record }) {
  return (
    <>
      <td className="py-3 pr-4 align-top">
        <p className="font-bold">{record.name || record.email || record.phone || record.externalId}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{record.email || "No email"}</p>
        <p className="mt-1 text-xs text-slate-500">{record.phone || "No phone"}</p>
        {record.followUpStatus && (
          <span className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", FOLLOWUP_STATUS_STYLES[record.followUpStatus] || "bg-slate-100 text-slate-500")}>
            {FOLLOWUP_STATUS_LABELS[record.followUpStatus] || record.followUpStatus}
          </span>
        )}
      </td>
      <td className="py-3 pr-4 align-top">
        <p className="text-sm">{record.defaultAddress?.city || "No city"}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{record.defaultAddress?.province || "No state"}, {record.defaultAddress?.country || "No country"}</p>
        {record.nextFollowUpAt && (
          <p className="mt-1 text-[10px] text-violet-600">
            Next: {new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(record.nextFollowUpAt))}
          </p>
        )}
        {record.note && (
          <p className="mt-1 max-w-[220px] rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 border border-amber-200/70 truncate">
            📝 {record.note}
          </p>
        )}
      </td>
      <td className="py-3 pr-4 align-top">
        <p className="font-bold">{recordMoney(record.totalSpent, record.currency)}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{Number(record.ordersCount || 0).toLocaleString("en-IN")} orders</p>
        {record.followUps?.length > 0 && (
          <p className="mt-1 text-[10px] text-[var(--muted)]">{record.followUps.length} call log{record.followUps.length > 1 ? "s" : ""}</p>
        )}
      </td>
      <td className="py-3 pr-4 align-top">
        <Badge tone={record.ordersCount > 0 ? "green" : "slate"}>{record.state || "customer"}</Badge>
        <p className="mt-2 max-w-[220px] truncate text-xs text-[var(--muted)]">{tagsText(record.tags) || "No tags"}</p>
      </td>
    </>
  );
}

function RecordTable({ resource, records, onEdit, onFollowUp, onCreateOrder }) {
  if (!records.length) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel-soft)] p-5 text-sm text-[var(--muted)]">
        No synced {resource} found for this company yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-left text-xs uppercase text-slate-500">
            <th className="py-3 pr-4 font-semibold">{resource === "products" ? "Product" : resource === "customers" ? "Customer" : "Order"}</th>
            <th className="py-3 pr-4 font-semibold">{resource === "products" ? "Variants" : resource === "customers" ? "Address / Next Call" : "Items"}</th>
            <th className="py-3 pr-4 font-semibold">{resource === "products" ? "Inventory" : resource === "customers" ? "Value / History" : "Amount"}</th>
            <th className="py-3 pr-4 font-semibold">{resource === "products" ? "Status / Tags" : resource === "customers" ? "State / Tags" : "Payment / Fulfillment"}</th>
            <th className="py-3 pr-4 font-semibold">Channel</th>
            <th className="py-3 pr-0 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const recordId = record.externalId
              ? `${record.channelId || record.provider}::${record.externalId}`
              : String(record._id || record.id);
            return (
              <tr key={recordId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                {resource === "orders" ? <OrderCells record={record} /> : null}
                {resource === "products" ? <ProductCells record={record} /> : null}
                {resource === "customers" ? <CustomerCells record={record} /> : null}
                <td className="py-3 pr-4 align-top">
                  <Badge tone="green">Shopify</Badge>
                  <p className="mt-1 text-xs text-[var(--muted)]">{record.channelName || record.channelShop}</p>
                  <p className="mt-1 text-xs text-slate-500">{record.channelShop || record.shop}</p>
                </td>
                <td className="py-3 pr-0 text-right align-top">
                  <div className="flex flex-col items-end gap-1">
                    {resource === "customers" ? (
                      <>
                        <Button
                          variant="secondary"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => onFollowUp?.(record)}
                        >
                          📞 Follow Up
                        </Button>
                        <Button
                          className="h-7 px-2.5 text-xs"
                          onClick={() => onCreateOrder?.(record)}
                        >
                          + Order
                        </Button>
                      </>
                    ) : resource === "orders" ? (
                      <div className="flex flex-col items-end gap-1">
                        <Button variant="secondary" className="h-7 px-2.5 text-xs" onClick={() => onEdit(record)}>
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          className="h-7 px-2 text-[11px] border-rose-200 text-rose-700 hover:bg-rose-50"
                          onClick={() => onCancelOrder?.(record)}
                        >
                          <Ban size={11} className="mr-1" />
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button variant="secondary" className="h-9" onClick={() => onEdit(record)}>
                        Edit
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecordEditor({ resource, record, value, setValue, onSave, onCancelOrder, onClose, isSaving, error }) {
  if (!record) return null;

  function setField(field, nextValue) {
    setValue((current) => ({ ...current, [field]: nextValue }));
  }

  function setVariant(index, field, nextValue) {
    setValue((current) => ({
      ...current,
      variants: (current.variants || []).map((variant, variantIndex) => (variantIndex === index ? { ...variant, [field]: nextValue } : variant)),
    }));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
      <div className="thin-scrollbar max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-[var(--shadow)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--line)] bg-white p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{recordDisplayName(resource, record)}</CardTitle>
              <Badge tone="green">Shopify</Badge>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">{recordSubtitle(resource, record)}</p>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close editor">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 p-4">
          {resource === "orders" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Email" value={value.email} onChange={(nextValue) => setField("email", nextValue)} />
                <FormField label="Phone" value={value.phone} onChange={(nextValue) => setField("phone", nextValue)} />
              </div>
              <FormField label="Order Note" value={value.note} onChange={(nextValue) => setField("note", nextValue)} as="textarea" />
              <FormField label="Tags" value={value.tags} onChange={(nextValue) => setField("tags", nextValue)} />
            </>
          ) : null}

          {resource === "products" ? (
            <>
              <FormField label="Title" value={value.title} onChange={(nextValue) => setField("title", nextValue)} />
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField label="Vendor" value={value.vendor} onChange={(nextValue) => setField("vendor", nextValue)} />
                <FormField label="Product Type" value={value.productType} onChange={(nextValue) => setField("productType", nextValue)} />
                <FormField label="Status" value={value.status} onChange={(nextValue) => setField("status", nextValue)} />
              </div>
              <FormField label="Tags" value={value.tags} onChange={(nextValue) => setField("tags", nextValue)} />
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-700">Variants</p>
                {(value.variants || []).map((variant, index) => (
                  <div key={variant.externalId || index} className="rounded-lg border border-[var(--line)] p-3">
                    <p className="mb-2 text-sm font-semibold text-slate-700">{variant.title || "Variant"}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <FormField label="SKU" value={variant.sku} onChange={(nextValue) => setVariant(index, "sku", nextValue)} />
                      <FormField label="Price" value={String(variant.price ?? "")} onChange={(nextValue) => setVariant(index, "price", nextValue)} />
                      <FormField label="Barcode" value={variant.barcode} onChange={(nextValue) => setVariant(index, "barcode", nextValue)} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {resource === "customers" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="First Name" value={value.firstName} onChange={(nextValue) => setField("firstName", nextValue)} />
                <FormField label="Last Name" value={value.lastName} onChange={(nextValue) => setField("lastName", nextValue)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Email" value={value.email} onChange={(nextValue) => setField("email", nextValue)} />
                <FormField label="Phone" value={value.phone} onChange={(nextValue) => setField("phone", nextValue)} />
              </div>
              <FormField label="Tags" value={value.tags} onChange={(nextValue) => setField("tags", nextValue)} />
              <FormField label="Note" value={value.note} onChange={(nextValue) => setField("note", nextValue)} as="textarea" />
            </>
          ) : null}

          {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-4">
            {resource === "orders" && record && !record.cancelledAt && record.fulfillmentStatus !== "cancelled" ? (
              <Button
                variant="outline"
                className="border-rose-200 text-rose-700 hover:bg-rose-50"
                onClick={() => onCancelOrder?.(record)}
                disabled={isSaving}
              >
                <Ban size={15} className="mr-1" />
                Cancel Order on Shopify
              </Button>
            ) : <div />}
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={onSave} disabled={isSaving}>
                <RefreshCw size={16} className={isSaving ? "animate-spin" : ""} />
                {isSaving ? "Updating Shopify" : "Save to Shopify"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordsModuleView({ name }) {
  const resource = recordResourceByView[name];
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const [formValue, setFormValue] = useState({});
  const [filters, setFilters] = useState({ query: "", status: "all", channel: "all", quick: "all" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  // CRM modals (customers only)
  const [followUpCustomer, setFollowUpCustomer] = useState(null);
  const [createOrderCustomer, setCreateOrderCustomer] = useState(null);

  function openFollowUp(record) {
    setFollowUpCustomer(record);
  }

  function openCreateOrder(record) {
    setCreateOrderCustomer(record);
  }

  function handleCustomerUpdate(updatedCustomer) {
    if (!updatedCustomer) return;
    const updatedId = String(updatedCustomer._id || updatedCustomer.id);
    setRecords((current) =>
      current.map((r) => String(r._id || r.id) === updatedId ? { ...r, ...updatedCustomer, id: updatedId } : r)
    );
  }

  async function loadRecords({ keepSelection = true } = {}) {
    setError("");
    setIsLoading(true);

    try {
      const result = await listSyncedRecords(resource);
      const rawRecords = result.records || [];
      const seen = new Set();
      const nextRecords = rawRecords.filter((r) => {
        const key = String(r.externalId || r._id || r.id);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setRecords(nextRecords);

      const selectedId = selected?.id || selected?._id;
      const nextSelected = keepSelection && selectedId ? nextRecords.find((record) => String(record.id || record._id) === String(selectedId)) || null : null;

      setSelected(nextSelected);
      setFormValue(nextSelected ? editablePayload(resource, nextSelected) : {});
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRecords({ keepSelection: false });
  }, [resource]);

  function selectRecord(record) {
    setSelected(record);
    setFormValue(editablePayload(resource, record));
    setError("");
  }

  async function saveRecord() {
    if (!selected) return;

    setIsSaving(true);
    setError("");

    try {
      await updateSyncedRecord(resource, selected.id || selected._id, formValue);
      await loadRecords();
      setSelected(null);
      setFormValue({});
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancelOrder(record) {
    const orderIdToUse = record.externalId || record._id || record.id;
    if (!confirm(`Are you sure you want to cancel order ${record.name || orderIdToUse} on Shopify?`)) return;

    setIsSaving(true);
    setError("");
    try {
      await cancelFulfillmentOrder(orderIdToUse);
      await loadRecords();
      setSelected(null);
      setFormValue({});
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  const pageTitle = recordTitle(name);
  const filteredRecords = records.filter((record) => matchesRecordFilters(resource, record, filters));
  const totalValue =
    resource === "orders"
      ? records.reduce((total, record) => total + Number(record.totalPrice || 0), 0)
      : resource === "products"
        ? records.reduce((total, record) => total + Number(record.totalInventory || 0), 0)
        : records.reduce((total, record) => total + Number(record.totalSpent || 0), 0);
  const alertCount =
    resource === "orders"
      ? records.filter((record) => record.fulfillmentStatus === "unfulfilled").length
      : resource === "products"
        ? records.filter((record) => Number(record.totalInventory || 0) <= 5).length
        : records.filter((record) => !record.email).length;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge tone="indigo">{name}</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">{pageTitle}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] md:text-base">
            Synced Shopify {pageTitle.toLowerCase()} across connected channels with detail view and Shopify update.
          </p>
        </div>
        <Button variant="secondary" onClick={() => loadRecords()} disabled={isLoading}>
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Synced Records</p>
          <p className="mt-2 text-2xl font-bold">{records.length.toLocaleString("en-IN")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">{resource === "orders" ? "Sales Value" : resource === "products" ? "Total Inventory" : "Customer Spend"}</p>
          <p className="mt-2 text-2xl font-bold">{resource === "products" ? totalValue.toLocaleString("en-IN") : recordMoney(totalValue, "INR")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">{resource === "orders" ? "Pending Orders" : resource === "products" ? "Low Stock" : "Missing Email"}</p>
          <p className="mt-2 text-2xl font-bold">{alertCount.toLocaleString("en-IN")}</p>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>{pageTitle} List</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {isLoading ? "Loading synced records..." : `${filteredRecords.length.toLocaleString("en-IN")} of ${records.length.toLocaleString("en-IN")} records shown.`}
              </p>
            </div>
          </CardHeader>
          <RecordFilters resource={resource} records={records} filters={filters} setFilters={setFilters} />
          <CardContent>
            {error && !selected ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}
            <RecordTable resource={resource} records={filteredRecords} onEdit={selectRecord} onFollowUp={openFollowUp} onCreateOrder={openCreateOrder} onCancelOrder={handleCancelOrder} />
          </CardContent>
        </Card>
      </section>
      <RecordEditor
        resource={resource}
        record={selected}
        value={formValue}
        setValue={setFormValue}
        onSave={saveRecord}
        onCancelOrder={handleCancelOrder}
        onClose={() => {
          setSelected(null);
          setFormValue({});
          setError("");
        }}
        isSaving={isSaving}
        error={error}
      />

      {/* Customer CRM Modals */}
      {followUpCustomer && (
        <CustomerFollowUpModal
          customer={followUpCustomer}
          onClose={() => setFollowUpCustomer(null)}
          onUpdate={(updated) => {
            handleCustomerUpdate(updated);
            setFollowUpCustomer((current) => current ? { ...current, ...updated } : null);
          }}
          onCreateOrder={() => {
            setCreateOrderCustomer(followUpCustomer);
            setFollowUpCustomer(null);
          }}
        />
      )}
      {createOrderCustomer && (
        <CreateOrderModal
          customer={createOrderCustomer}
          onClose={() => setCreateOrderCustomer(null)}
          onOrderCreated={() => {
            setCreateOrderCustomer(null);
            loadRecords();
          }}
        />
      )}
    </div>
  );
}

function optionKey(option) {
  return [option.provider, option.channelId, option.productId, option.sku || ""].join("::");
}

function mappingOptionPayload(option) {
  return {
    provider: option.provider,
    channelId: option.channelId,
    productId: option.productId,
    productTitle: option.productTitle,
    sku: option.sku || "",
  };
}

function mappingName(option) {
  return `${option.productTitle || "Product"}${option.sku ? ` / ${option.sku}` : ""}`;
}

function ProductMappingView() {
  const [options, setOptions] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [rowSelections, setRowSelections] = useState({});
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");

  const shopifyOptions = useMemo(() => {
    const seen = new Set();
    return options.filter((option) => {
      if (option.provider !== "shopify" || (!option.productTitle && !option.sku)) return false;
      const key = optionKey(option);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [options]);
  const amazonOptions = useMemo(() => {
    const seen = new Set();
    return options.filter((option) => {
      if (option.provider !== "amazon" || (!option.productTitle && !option.sku)) return false;
      const key = optionKey(option);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [options]);
  const optionByKey = useMemo(() => new Map(options.map((option) => [optionKey(option), option])), [options]);

  async function loadMappingData() {
    setError("");
    setIsLoading(true);

    try {
      const [optionResult, mappingResult] = await Promise.all([getProductMappingOptions(), listProductMappings()]);
      const nextOptions = optionResult.options || [];
      const nextMappings = mappingResult.mappings || [];
      const nextOptionByKey = new Map(nextOptions.map((option) => [optionKey(option), option]));
      const nextSelections = {};

      nextMappings.forEach((mapping) => {
        const shopify = mapping.mappings?.find((entry) => entry.provider === "shopify");
        const amazon = mapping.mappings?.find((entry) => entry.provider === "amazon");
        if (!shopify || !amazon) return;

        const shopifyKey = optionKey(shopify);
        const amazonKey = optionKey(amazon);
        if (nextOptionByKey.has(shopifyKey) && nextOptionByKey.has(amazonKey)) {
          nextSelections[shopifyKey] = amazonKey;
        }
      });

      setOptions(nextOptions);
      setMappings(nextMappings);
      setRowSelections(nextSelections);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadMappingData();
  }, []);

  async function saveMapping(shopifyOption) {
    const shopifyKey = optionKey(shopifyOption);
    const amazonOption = optionByKey.get(rowSelections[shopifyKey]);
    if (!amazonOption) return;

    setSavingKey(shopifyKey);
    setError("");

    try {
      await saveProductMapping({
        masterName: mappingName(shopifyOption),
        mappings: [mappingOptionPayload(shopifyOption), mappingOptionPayload(amazonOption)],
      });
      await loadMappingData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingKey("");
    }
  }

  const visibleShopifyOptions = shopifyOptions.filter((option) =>
    `${option.productTitle || ""} ${option.sku || ""} ${option.channelName || ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  const mappedCount = mappings.filter((mapping) => mapping.mappings?.some((entry) => entry.provider === "shopify") && mapping.mappings?.some((entry) => entry.provider === "amazon")).length;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge tone="amber">Product Mapping</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">Map Channel SKUs</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] md:text-base">
            Match the same real products across Shopify and Amazon when channel SKUs are different.
          </p>
        </div>
        <Button variant="secondary" onClick={loadMappingData} disabled={isLoading}>
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Shopify SKUs</p>
          <p className="mt-2 text-2xl font-bold">{shopifyOptions.length.toLocaleString("en-IN")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Amazon SKUs</p>
          <p className="mt-2 text-2xl font-bold">{amazonOptions.length.toLocaleString("en-IN")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Saved Maps</p>
          <p className="mt-2 text-2xl font-bold">{mappedCount.toLocaleString("en-IN")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Source</p>
          <p className="mt-2 text-2xl font-bold">Real sync</p>
        </Card>
      </section>

      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>SKU Mapping Table</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {isLoading ? "Loading synced products..." : `${visibleShopifyOptions.length.toLocaleString("en-IN")} Shopify rows shown.`}
            </p>
          </div>
          <div className="relative min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              className="h-10 w-full rounded-md border border-[var(--line)] bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-700 focus:ring-2 focus:ring-indigo-100"
              placeholder="Search Shopify product or SKU"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}
          {!amazonOptions.length ? (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              Amazon products will appear here after Amazon OAuth and SP-API product sync are completed.
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-y border-[var(--line)] bg-[var(--panel-soft)] text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Shopify Product</th>
                  <th className="px-4 py-3">Shopify SKU</th>
                  <th className="px-4 py-3">Amazon Product / SKU</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {visibleShopifyOptions.map((shopifyOption) => {
                  const shopifyKey = optionKey(shopifyOption);
                  const selectedAmazonKey = rowSelections[shopifyKey] || "";
                  const selectedAmazon = optionByKey.get(selectedAmazonKey);
                  const isSaving = savingKey === shopifyKey;

                  return (
                    <tr key={shopifyKey} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-950">{shopifyOption.productTitle || "Untitled product"}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{shopifyOption.channelName || "Shopify"} · Product ID {shopifyOption.productId || "-"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={shopifyOption.sku ? "blue" : "slate"}>{shopifyOption.sku || "No SKU"}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-700 focus:ring-2 focus:ring-indigo-100"
                          value={selectedAmazonKey}
                          onChange={(event) =>
                            setRowSelections((current) => ({
                              ...current,
                              [shopifyKey]: event.target.value,
                            }))
                          }
                          disabled={!amazonOptions.length}
                        >
                          <option value="">Select Amazon product / SKU</option>
                          {amazonOptions.map((amazonOption) => (
                            <option key={optionKey(amazonOption)} value={optionKey(amazonOption)}>
                              {amazonOption.sku || "No SKU"} / {amazonOption.productTitle || "Untitled product"}
                            </option>
                          ))}
                        </select>
                        {selectedAmazon ? (
                          <p className="mt-1 text-xs text-[var(--muted)]">{selectedAmazon.channelName || "Amazon"} · Product ID {selectedAmazon.productId || "-"}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={selectedAmazon ? "green" : "slate"}>{selectedAmazon ? "Mapped" : "Not mapped"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="secondary" className="h-9" onClick={() => saveMapping(shopifyOption)} disabled={!selectedAmazon || isSaving}>
                          <RefreshCw size={15} className={isSaving ? "animate-spin" : ""} />
                          {isSaving ? "Saving" : "Save"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ModuleView({ name, setActiveView }) {
  if (name === "Product Mapping") {
    return <ProductMappingView />;
  }

  if (recordResourceByView[name]) {
    return <RecordsModuleView name={name} />;
  }

  const page = modulePages[name];

  if (!page) return null;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge tone="indigo">{page.eyebrow}</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">{page.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] md:text-base">{page.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {name === "Settings" ? (
            <>
              <Button variant="secondary" onClick={() => setActiveView("Company")}>Company Details</Button>
              <Button onClick={() => setActiveView("Users")}>Manage Users</Button>
            </>
          ) : (
            <Button>
              <Sparkles size={16} />
              New {name.slice(0, -1) || name}
            </Button>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {page.cards.map(([label, value, description]) => (
          <Card key={label} className="p-4">
            <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{description}</p>
          </Card>
        ))}
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{page.title} Workbench</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">Quick actions for this module.</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {page.actions.map((action) => (
                <button key={action} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-left text-sm font-semibold hover:border-indigo-600">
                  {action}
                  <span className="text-xs text-indigo-700">Open</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Coming Soon</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">This module is on our near-term roadmap.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-[var(--muted)]">
            <p>We&rsquo;re actively building this out. Reach out to your account manager if you&rsquo;d like it prioritized.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export function DashboardView() {
  const { dashboardData, connectedChannels, setConnectedChannels, channelsError, setChannelsError, isLoadingChannels } = useCommerceStore();

  const kpiItems = withKpiIcons(dashboardData?.kpis?.length ? dashboardData.kpis : zeroKpis);
  const chartSalesTrend = dashboardData?.salesTrend?.length ? dashboardData.salesTrend : zeroSalesTrend;
  const chartChannelMix = dashboardData?.channelMix?.length ? dashboardData.channelMix : zeroChannelMix;
  const recentOrders = dashboardData?.recentOrders || [];
  const inventoryItems = dashboardData?.inventory || [];

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="indigo">Live</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">Sukirti Commerce Hub</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] md:text-base">
            One operational view for multi-channel sales, orders, inventory, raw materials, shipping, CRM, finance, ads, analytics, and automations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary">
            <LifeBuoy size={16} />
            Support Queue
          </Button>
          <Button>
            <ShoppingCart size={16} />
            Create Manual Order
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
        {kpiItems.map((item) => (
          <KpiCard key={item.label} item={item} />
        ))}
      </section>

      <section className="mt-6">
        <SalesCharts
          salesTrend={chartSalesTrend}
          channelMix={chartChannelMix}
          period={dashboardData?.period}
          periodSales={dashboardData?.periodSales}
          periodOrderCount={dashboardData?.periodOrderCount}
        />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
        <OrdersPanel orders={recentOrders} />
        <ChannelsPanel
          connectedChannels={connectedChannels}
          setConnectedChannels={setConnectedChannels}
          channelsError={channelsError}
          setChannelsError={setChannelsError}
          isLoadingChannels={isLoadingChannels}
          onRefreshData={() => {}}
        />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <InventoryPanel inventory={inventoryItems} />
        <div className="grid gap-4">
          <FinancePanel />
          <AutomationPanel />
        </div>
      </section>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] py-5 text-sm text-[var(--muted)]">
        <span>CommerceOS — real-time multi-channel commerce operations.</span>
      </footer>
    </div>
  );
}
