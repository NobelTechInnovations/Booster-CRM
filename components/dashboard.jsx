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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  automations,
  channelCatalog,
  channelMix,
  channels,
  financeBreakdown,
  inventory,
  kpis,
  modules,
  orders,
  roles,
  salesTrend,
} from "@/lib/data";
import { clearSession, createShopifyConnection, getSession } from "@/lib/api";
import { useCommerceStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const menu = [
  { label: "Dashboard", icon: Gauge },
  { label: "Orders", icon: ShoppingCart },
  { label: "Products", icon: Package },
  { label: "Inventory", icon: Boxes },
  { label: "Channels", icon: PlugZap },
  { label: "Shipping", icon: Truck },
  { label: "CRM", icon: UserRound },
  { label: "Finance", icon: CircleDollarSign },
  { label: "Ads", icon: Activity },
  { label: "Automation", icon: Workflow },
  { label: "Reports", icon: ClipboardList },
  { label: "Settings", icon: Settings },
];

const chartColors = ["#0f766e", "#2563eb", "#d94635", "#d97706", "#64748b", "#16a34a"];

function formatCurrency(value) {
  return `₹${Math.round(value / 1000)}k`;
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

function Topbar({ setOpen, session }) {
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
        <Button variant="secondary" className="hidden sm:inline-flex">
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
  const Icon = item.icon;
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

function SalesCharts() {
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

function ChannelsPanel() {
  const [showConnect, setShowConnect] = useState(false);
  const [shop, setShop] = useState("");
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
        {channels.map((channel) => (
          <div key={channel.name} className="grid gap-3 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{channel.name}</p>
                <Badge tone={channel.state === "Connected" ? "green" : "amber"}>{channel.state}</Badge>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">{channel.orders} orders synced, last sync {channel.sync}</p>
              <div className="mt-3 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-teal-700" style={{ width: `${channel.health}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-2 sm:justify-end">
              <Button variant="ghost" className="h-9 px-2" aria-label={`${channel.name} logs`}>
                <ClipboardList size={16} />
              </Button>
              <Button variant="secondary" className="h-9">
                <RefreshCw size={15} />
                Sync
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ShopifyConnectForm({ compact = false }) {
  const [shop, setShop] = useState("");
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

function ChannelCard({ channel }) {
  const isShopify = channel.provider === "shopify";
  const badgeTone = channel.status === "Available" ? "green" : channel.status === "Next" ? "blue" : "slate";

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
        <Badge tone={badgeTone}>{channel.status}</Badge>
      </div>

      <div className="mt-auto pt-4">
        {isShopify ? (
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

function ChannelsView() {
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
        <Button>
          <RefreshCw size={16} />
          Sync Connected Channels
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {channelCatalog.map((channel) => (
          <ChannelCard key={channel.provider} channel={channel} />
        ))}
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <ChannelsPanel />
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

function OrdersPanel() {
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
                <td className={cn("py-3 pr-0 text-right font-bold", order.profit.startsWith("-") ? "text-rose-600" : "text-emerald-700")}>
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

function InventoryPanel() {
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

export function Dashboard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeView, setActiveView] = useState("Dashboard");
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const savedSession = getSession();

    if (!savedSession?.token) {
      router.replace("/login");
      return;
    }

    setSession(savedSession);
    setCheckingSession(false);
  }, [router]);

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
        <Topbar setOpen={setOpen} session={session} />
        {activeView === "Channels" ? (
          <ChannelsView />
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
            {kpis.map((item) => (
              <KpiCard key={item.label} item={item} />
            ))}
          </section>

          <section className="mt-6">
            <SalesCharts />
          </section>

          <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
            <OrdersPanel />
            <ChannelsPanel />
          </section>

          <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <InventoryPanel />
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
