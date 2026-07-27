"use client";

import {
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  automations,
  channelCatalog,
  financeBreakdown,
  modules,
  roles,
} from "@/lib/data";
import {
  clearSession,
  createShopifyConnection,
  getChannelDashboard,
  getSession,
  listChannels,
  listSyncedRecords,
  syncChannel,
  updateSyncedRecord,
} from "@/lib/api";
import { useCommerceStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const menu = [
  { label: "Dashboard", icon: Gauge },
  { label: "Company", icon: Building2 },
  { label: "Users", icon: Users },
  { label: "Orders", icon: ShoppingCart },
  { label: "Products", icon: Package },
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

const chartColors = ["#0f766e", "#2563eb", "#d94635", "#d97706", "#64748b", "#16a34a"];
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
            <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-700 text-white">
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
                    ? "bg-teal-50 text-teal-800"
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
          <div className="rounded-lg border border-teal-100 bg-teal-50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-teal-900">
              <ShieldCheck size={16} />
              Role Matrix
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {roles.slice(0, 5).map((role) => (
                <Badge key={role} tone="teal">
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
          <Building2 size={17} className="text-teal-700" />
          <span className="truncate text-sm font-semibold">{companyName}</span>
          <ChevronDown size={16} className="text-slate-500" />
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="h-10 w-full rounded-md border border-[var(--line)] bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            placeholder="Search orders, SKU, customer, shipment, invoice"
          />
        </div>
        <select
          className="hidden h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-semibold outline-none focus:border-teal-600 md:block"
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

function SalesCharts({ salesTrend, channelMix }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sales, Profit, Orders</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">Daily operating pulse across connected channels.</p>
          </div>
          <Badge tone="green">ROAS 4.8x</Badge>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#0f766e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e5eaf1" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatCurrency} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="sales" name="Sales" stroke="#0f766e" fill="url(#salesGradient)" strokeWidth={3} />
                <Area type="monotone" dataKey="profit" name="Profit" stroke="#d94635" fill="transparent" strokeWidth={3} />
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
          <CardTitle>Channel Integrations</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">Connect, reconnect, sync, webhooks, and logs.</p>
        </div>
        <Button variant="secondary" onClick={() => setShowConnect((value) => !value)}>
          <PlugZap size={16} />
          Shopify
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showConnect ? (
          <form onSubmit={handleConnect} className="rounded-lg border border-teal-100 bg-teal-50 p-3">
            <label className="text-sm font-semibold text-teal-950" htmlFor="shopify-shop">
              Shopify store
            </label>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                id="shopify-shop"
                className="h-10 rounded-md border border-teal-200 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                placeholder="your-store.myshopify.com"
                value={shop}
                onChange={(event) => setShop(event.target.value)}
              />
              <Button type="submit" disabled={isConnecting}>
                <PlugZap size={16} />
                {isConnecting ? "Opening" : "Connect"}
              </Button>
            </div>
            {connectError ? <p className="mt-2 text-sm font-medium text-rose-700">{connectError}</p> : null}
          </form>
        ) : null}
        {channelsError ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{channelsError}</p> : null}
        {isLoadingChannels ? <p className="text-sm text-[var(--muted)]">Loading connected channels...</p> : null}
        {!isLoadingChannels && !connectedChannels.length ? (
          <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm text-[var(--muted)]">
            Shopify is not connected yet. Connect {defaultShopifyShop} first, then run Sync to pull order totals into this panel.
          </div>
        ) : null}
        {connectedChannels.map((channel) => {
          const channelId = channel._id || channel.id;
          const isSyncing = syncingId === channelId || channel.sync?.orders === "running";
          const orderCount = channel.metrics?.orderCount || 0;
          const salesTotal = Number(channel.metrics?.salesTotal || 0);
          const currency = channel.metrics?.currency || "INR";

          return (
            <div key={channelId} className="grid gap-3 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{channel.name || "Shopify"}</p>
                  <Badge tone={channel.status === "connected" ? "green" : "amber"}>{channel.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">{channel.shop}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {orderCount.toLocaleString("en-IN")} orders synced, {currency} {salesTotal.toLocaleString("en-IN")} sales, last sync {formatChannelSync(channel.sync)}
                </p>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-teal-700" style={{ width: channel.sync?.orders === "failed" ? "38%" : "98%" }} />
                </div>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <Button variant="ghost" className="h-9 px-2" aria-label={`${channel.name || "Shopify"} logs`}>
                  <ClipboardList size={16} />
                </Button>
                <Button variant="secondary" className="h-9" onClick={() => handleSync(channelId)} disabled={isSyncing}>
                  <RefreshCw size={15} className={isSyncing ? "animate-spin" : ""} />
                  {isSyncing ? "Syncing" : "Sync Data"}
                </Button>
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
    <form onSubmit={handleConnect} className={cn("rounded-lg border border-teal-100 bg-teal-50 p-3", compact && "bg-white")}>
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-semibold text-teal-950" htmlFor={compact ? "shopify-shop-compact" : "shopify-shop"}>
          Shopify login
        </label>
        <Badge tone="green">Company mapped</Badge>
      </div>
      <Button type="submit" className="mt-3 w-full" disabled={isConnecting}>
        <PlugZap size={16} />
        {isConnecting ? "Opening Shopify" : "Connect with Shopify"}
      </Button>
      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          id={compact ? "shopify-shop-compact" : "shopify-shop"}
          className="h-10 rounded-md border border-teal-200 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
          placeholder="Optional dev store: your-store.myshopify.com"
          value={shop}
          onChange={(event) => setShop(event.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={isConnecting}>
          Dev Connect
        </Button>
      </div>
      {connectError ? <p className="mt-2 text-sm font-medium text-rose-700">{connectError}</p> : null}
      <p className="mt-2 text-xs leading-5 text-teal-900">
        Public app me button direct Shopify install/login kholega. Dev app me store domain dalna padega.
      </p>
    </form>
  );
}

function ChannelCard({ channel, connectedChannel, onSyncChannel }) {
  const isShopify = channel.provider === "shopify";
  const isConnected = Boolean(connectedChannel);
  const badgeTone = isConnected ? "green" : channel.status === "Available" ? "green" : channel.status === "Next" ? "blue" : "slate";
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

  return (
    <Card className="flex min-h-[220px] flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "grid h-10 w-10 place-items-center rounded-md text-white",
                channel.accent === "green" && "bg-emerald-600",
                channel.accent === "blue" && "bg-blue-600",
                channel.accent === "amber" && "bg-amber-600",
                channel.accent === "slate" && "bg-slate-600",
              )}
            >
              <PlugZap size={19} />
            </div>
            <div>
              <h3 className="font-bold">{channel.name}</h3>
              <p className="text-xs font-semibold uppercase text-slate-500">{channel.phase}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{channel.description}</p>
        </div>
        <Badge tone={badgeTone}>{isConnected ? "Connected" : channel.status}</Badge>
      </div>

      <div className="mt-auto pt-4">
        {isShopify && isConnected ? (
          <div className="space-y-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
            <div>
              <p className="text-sm font-semibold text-emerald-950">{connectedChannel.shop}</p>
              <p className="mt-1 text-xs text-emerald-900">Last sync {formatChannelSync(connectedChannel.sync)}</p>
            </div>
            <Button className="w-full" onClick={() => onSyncChannel?.(connectedChannel._id || connectedChannel.id)}>
              <RefreshCw size={16} />
              Sync Shopify Data
            </Button>
            {!canEditShopify ? (
              <>
                <p className="text-xs leading-5 text-amber-900">Reconnect once to approve product, order, and customer editing.</p>
                <Button variant="secondary" className="w-full" onClick={reconnectShopify} disabled={isReconnecting}>
                  <PlugZap size={16} />
                  {isReconnecting ? "Opening Shopify" : "Reconnect for Edit Access"}
                </Button>
                {reconnectError ? <p className="text-xs font-medium text-rose-700">{reconnectError}</p> : null}
              </>
            ) : null}
          </div>
        ) : isShopify ? (
          <ShopifyConnectForm compact />
        ) : (
          <Button variant="secondary" className="w-full" disabled>
            <PlugZap size={16} />
            Connect Soon
          </Button>
        )}
      </div>
    </Card>
  );
}

function ChannelsView({ connectedChannels, channelsError, isLoadingChannels, setConnectedChannels, setChannelsError, onRefreshData, onSyncAll }) {
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

  const connectedShopify = connectedChannels.find((entry) => entry.provider === "shopify" && entry.status === "connected");

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge tone="teal">Phase 3 channel integrations</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">Channels</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] md:text-base">
            Connect marketplaces and stores company-wise. Shopify is active now; the remaining channel cards are ready for the next connectors.
          </p>
        </div>
        <Button onClick={onSyncAll} disabled={!connectedChannels.length}>
          <RefreshCw size={16} />
          Sync Connected Channels
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {channelCatalog.map((channel) => (
          <ChannelCard key={channel.provider} channel={channel} connectedChannel={channel.provider === "shopify" ? connectedShopify : null} onSyncChannel={syncOne} />
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
              <CardTitle>Company Mapping</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">Every channel is saved against the authenticated company.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-[var(--muted)]">
            <p>Frontend creates a dev session, backend signs a JWT with `companyId`, and Shopify OAuth state carries that company into callback.</p>
            <p>After merchant approval, the backend saves `{`{ companyId, provider: "shopify", shop, accessToken }`}` in the Channel collection or memory store.</p>
            <Badge tone="green">Ready for Shopify</Badge>
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

function Roadmap() {
  const statusTone = useMemo(
    () => ({
      Live: "green",
      Ready: "blue",
      Build: "amber",
      Mapped: "teal",
      Design: "slate",
      Queued: "slate",
    }),
    [],
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Implementation Roadmap</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">Phases from the product brief, grouped into dashboard modules.</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <div key={module.name} className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{module.name}</p>
                <Badge tone={statusTone[module.status]}>{module.status}</Badge>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{module.phase}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const modulePages = {
  Orders: {
    eyebrow: "Phase 9",
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
    eyebrow: "Phase 4",
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
    eyebrow: "Phase 5",
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
  Shipping: {
    eyebrow: "Phase 10",
    title: "Shipping",
    subtitle: "Create shipments, generate label, invoice, manifest, track, cancel, NDR, returns, exchange, pickup, and bulk ship.",
    actions: ["Create Shipment", "Generate Label", "Generate Manifest", "Track", "Bulk Ship"],
    cards: [
      ["Ready to Ship", "312", "Packed and waiting for courier assignment."],
      ["In Transit", "1,842", "Live tracking pending integration."],
      ["NDR", "28", "Needs customer follow-up."],
      ["RTO", "19", "Return to origin under review."],
    ],
  },
  CRM: {
    eyebrow: "Phase 12",
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
    eyebrow: "Phase 14",
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
    eyebrow: "Phase 16",
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
    eyebrow: "Phase 18",
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
    eyebrow: "Phase 20",
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
    eyebrow: "Phase 1",
    title: "Settings",
    subtitle: "Company, users, roles, permissions, security, API configuration, notifications, and audit setup.",
    actions: ["Company Details", "Manage Users", "Roles", "Security", "API Keys"],
    cards: [
      ["Authentication", "Active", "JWT login/signup enabled."],
      ["Roles", "7", "Owner, Admin, Manager, Support, Warehouse, Marketing, Accountant."],
      ["Permissions", "Mapped", "Backend-enforced role permissions."],
      ["Audit Logs", "Planned", "Future activity tracking."],
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
    "mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
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
          className="h-10 w-full rounded-md border border-[var(--line)] bg-white pl-10 pr-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          placeholder={`Search ${resource}`}
          value={filters.query}
          onChange={(event) => setFilter("query", event.target.value)}
        />
      </div>
      <select
        className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-semibold outline-none focus:border-teal-600"
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
        className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-semibold outline-none focus:border-teal-600"
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
            className={cn("h-8 flex-1 rounded px-2 text-xs font-semibold", filters.quick === value ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100")}
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
          {(record.lineItems || []).length > 3 ? <p className="text-xs font-semibold text-teal-700">+{record.lineItems.length - 3} more</p> : null}
        </div>
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
          {(record.variants || []).length > 3 ? <p className="text-xs font-semibold text-teal-700">+{record.variants.length - 3} variants</p> : null}
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

function CustomerCells({ record }) {
  return (
    <>
      <td className="py-3 pr-4 align-top">
        <p className="font-bold">{record.name || record.email || record.phone || record.externalId}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{record.email || "No email"}</p>
        <p className="mt-1 text-xs text-slate-500">{record.phone || "No phone"}</p>
      </td>
      <td className="py-3 pr-4 align-top">
        <p className="text-sm">{record.defaultAddress?.city || "No city"}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{record.defaultAddress?.province || "No state"}, {record.defaultAddress?.country || "No country"}</p>
      </td>
      <td className="py-3 pr-4 align-top">
        <p className="font-bold">{recordMoney(record.totalSpent, record.currency)}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{Number(record.ordersCount || 0).toLocaleString("en-IN")} orders</p>
      </td>
      <td className="py-3 pr-4 align-top">
        <Badge tone={record.ordersCount > 0 ? "green" : "slate"}>{record.state || "customer"}</Badge>
        <p className="mt-2 max-w-[220px] truncate text-xs text-[var(--muted)]">{tagsText(record.tags) || "No tags"}</p>
      </td>
    </>
  );
}

function RecordTable({ resource, records, onEdit }) {
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
            <th className="py-3 pr-4 font-semibold">{resource === "products" ? "Variants" : resource === "customers" ? "Address" : "Items"}</th>
            <th className="py-3 pr-4 font-semibold">{resource === "products" ? "Inventory" : resource === "customers" ? "Value" : "Amount"}</th>
            <th className="py-3 pr-4 font-semibold">{resource === "products" ? "Status / Tags" : resource === "customers" ? "State / Tags" : "Payment / Fulfillment"}</th>
            <th className="py-3 pr-4 font-semibold">Channel</th>
            <th className="py-3 pr-0 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const recordId = record.id || record._id;
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
                <td className="py-3 pr-0 text-right">
                  <Button variant="secondary" className="h-9" onClick={() => onEdit(record)}>
                    Edit
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecordEditor({ resource, record, value, setValue, onSave, onClose, isSaving, error }) {
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
              <FormField label="Tags" value={value.tags} onChange={(nextValue) => setField("tags", nextValue)} />
              <FormField label="Note" value={value.note} onChange={(nextValue) => setField("note", nextValue)} as="textarea" />
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
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-4">
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

  async function loadRecords({ keepSelection = true } = {}) {
    setError("");
    setIsLoading(true);

    try {
      const result = await listSyncedRecords(resource);
      const nextRecords = result.records || [];
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
          <Badge tone="teal">{name}</Badge>
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
            <RecordTable resource={resource} records={filteredRecords} onEdit={selectRecord} />
          </CardContent>
        </Card>
      </section>
      <RecordEditor
        resource={resource}
        record={selected}
        value={formValue}
        setValue={setFormValue}
        onSave={saveRecord}
        onClose={() => {
          setSelected(null);
          setFormValue({});
          setError("");
        }}
        isSaving={isSaving}
        error={error}
      />
    </div>
  );
}

function ModuleView({ name, setActiveView }) {
  if (recordResourceByView[name]) {
    return <RecordsModuleView name={name} />;
  }

  const page = modulePages[name];

  if (!page) return null;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge tone="teal">{page.eyebrow}</Badge>
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
              <p className="mt-1 text-sm text-[var(--muted)]">Feature-complete UI shell ready for API integration.</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {page.actions.map((action) => (
                <button key={action} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-left text-sm font-semibold hover:border-teal-600">
                  {action}
                  <span className="text-xs text-teal-700">Open</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Implementation Notes</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">This page is ready visually; backend CRUD can be attached phase by phase.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-[var(--muted)]">
            <p>Each page follows the same panel layout: summary metrics, command actions, and a workbench area.</p>
            <p>Phase 1 auth already protects this route. Future APIs should use the current JWT companyId for data isolation.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export function Dashboard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeView, setActiveView] = useState("Dashboard");
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [connectedChannels, setConnectedChannels] = useState([]);
  const [channelsError, setChannelsError] = useState("");
  const [isLoadingChannels, setIsLoadingChannels] = useState(true);

  const kpiItems = withKpiIcons(dashboardData?.kpis?.length ? dashboardData.kpis : zeroKpis);
  const chartSalesTrend = dashboardData?.salesTrend?.length ? dashboardData.salesTrend : zeroSalesTrend;
  const chartChannelMix = dashboardData?.channelMix?.length ? dashboardData.channelMix : zeroChannelMix;
  const recentOrders = dashboardData?.recentOrders || [];
  const inventoryItems = dashboardData?.inventory || [];

  async function refreshChannels() {
    setChannelsError("");
    setIsLoadingChannels(true);

    try {
      const result = await listChannels();
      setConnectedChannels(result.channels || []);
    } catch (error) {
      setChannelsError(error.message);
    } finally {
      setIsLoadingChannels(false);
    }
  }

  async function refreshDashboardData() {
    try {
      const result = await getChannelDashboard();
      setDashboardData(result.dashboard || null);
    } catch (error) {
      setChannelsError(error.message);
    }
  }

  async function syncAllChannels() {
    const syncableChannels = connectedChannels.filter((channel) => channel.status === "connected");

    setChannelsError("");

    try {
      for (const channel of syncableChannels) {
        const channelId = channel._id || channel.id;
        const result = await syncChannel(channelId);
        setConnectedChannels((current) =>
          current.map((entry) => (String(entry._id || entry.id) === String(channelId) ? { ...entry, ...result.channel, _id: entry._id || result.channel.id } : entry)),
        );
      }

      await Promise.all([refreshChannels(), refreshDashboardData()]);
    } catch (error) {
      setChannelsError(error.message);
    }
  }

  useEffect(() => {
    const savedSession = getSession();

    if (!savedSession?.token) {
      router.replace("/login");
      return;
    }

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);

      if (params.get("view") === "Channels" || params.get("provider") === "shopify") {
        setActiveView("Channels");
        window.history.replaceState(null, "", "/panel");
      }
    }

    setSession(savedSession);
    setCheckingSession(false);
  }, [router]);

  useEffect(() => {
    if (!session?.token) return;

    refreshChannels();
    refreshDashboardData();
  }, [session]);

  if (checkingSession) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--background)] px-4 text-center">
        <div>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-teal-700 text-white">
            <Layers3 size={24} />
          </div>
          <p className="mt-4 font-semibold">Opening secure panel</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Checking company session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[288px_minmax(0,1fr)]">
      <Sidebar open={open} setOpen={setOpen} activeView={activeView} setActiveView={setActiveView} />
      <main className="min-w-0">
        <Topbar setOpen={setOpen} session={session} onSyncAll={syncAllChannels} canSync={connectedChannels.some((channel) => channel.status === "connected")} />
        {activeView === "Channels" ? (
          <ChannelsView
            connectedChannels={connectedChannels}
            channelsError={channelsError}
            isLoadingChannels={isLoadingChannels}
            setConnectedChannels={setConnectedChannels}
            setChannelsError={setChannelsError}
            onRefreshData={() => Promise.all([refreshChannels(), refreshDashboardData()])}
            onSyncAll={syncAllChannels}
          />
        ) : activeView === "Company" ? (
          <CompanyView
            onCompanyUpdate={(company) => {
              setSession((current) => (current ? { ...current, company } : current));
            }}
          />
        ) : activeView === "Users" ? (
          <UsersView />
        ) : activeView !== "Dashboard" ? (
          <ModuleView name={activeView} setActiveView={setActiveView} />
        ) : (
        <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
          <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="teal">Unified commerce command center</Badge>
                <Badge tone="blue">JWT-ready</Badge>
                <Badge tone="slate">MongoDB service model</Badge>
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
            <SalesCharts salesTrend={chartSalesTrend} channelMix={chartChannelMix} />
          </section>

          <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
            <OrdersPanel orders={recentOrders} />
            <ChannelsPanel
              connectedChannels={connectedChannels}
              setConnectedChannels={setConnectedChannels}
              channelsError={channelsError}
              setChannelsError={setChannelsError}
              isLoadingChannels={isLoadingChannels}
              onRefreshData={() => Promise.all([refreshChannels(), refreshDashboardData()])}
            />
          </section>

          <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <InventoryPanel inventory={inventoryItems} />
            <div className="grid gap-4">
              <FinancePanel />
              <AutomationPanel />
            </div>
          </section>

          <section className="mt-6">
            <Roadmap />
          </section>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] py-5 text-sm text-[var(--muted)]">
            <span>Architecture: Frontend &gt; Backend API &gt; Services &gt; MongoDB &gt; external APIs.</span>
            <span>Socket.io-ready for live orders, stock, notifications, and sync logs.</span>
          </footer>
        </div>
        )}
      </main>
    </div>
  );
}
