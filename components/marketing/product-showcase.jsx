import {
  Bell,
  ChevronDown,
  Headset,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Users,
  Workflow,
} from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "./eyebrow";

const SIDEBAR = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: ShoppingCart, label: "Orders" },
  { icon: Users, label: "Customers" },
  { icon: MessageCircle, label: "WhatsApp" },
  { icon: Headset, label: "Support" },
  { icon: Workflow, label: "Automation" },
  { icon: Receipt, label: "Reports" },
  { icon: Settings, label: "Settings" },
];

const KPIS = [
  { label: "Revenue (MTD)", value: "₹12.4L" },
  { label: "Orders", value: "482" },
  { label: "Active Channels", value: "6" },
  { label: "Inventory Synced", value: "99.8%" },
];

const ORDERS = [
  { channel: "Shopify", order: "#4531", status: "Fulfilled", tone: "bg-emerald-50 text-emerald-700", revenue: "₹2,140", date: "5 Sep" },
  { channel: "Amazon", order: "#A-2291", status: "Processing", tone: "bg-amber-50 text-amber-700", revenue: "₹899", date: "5 Sep" },
  { channel: "Shopify", order: "#4530", status: "Shipped", tone: "bg-blue-50 text-blue-700", revenue: "₹3,450", date: "4 Sep" },
  { channel: "Amazon", order: "#A-2288", status: "Fulfilled", tone: "bg-emerald-50 text-emerald-700", revenue: "₹1,299", date: "4 Sep" },
];

// This is deliberately the largest, most detailed visual on the page — the
// spec for this redesign calls it out as one of the strongest elements. All
// data is illustrative demo content (a placeholder store name, round demo
// numbers) the same way every SaaS marketing screenshot uses example data —
// it's a picture of what the product looks like, not a claim about a real
// customer or real usage.
export function ProductShowcase() {
  return (
    <section className="mx-auto max-w-[1320px] px-6 py-24 lg:px-10">
      <Reveal as="div" className="mx-auto max-w-[640px] text-center">
        <Eyebrow>
          <span className="mx-auto">Inside the panel</span>
        </Eyebrow>
        <h2 className="mt-4 text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--mkt-text)] md:text-[2.75rem]">
          One command center for every order.
        </h2>
        <p className="mt-4 text-[17px] leading-[1.65] text-[var(--mkt-muted)]">
          Not a mockup of what we might build — this is the actual panel your team logs into every day.
        </p>
      </Reveal>

      <Reveal
        as="div"
        delay={100}
        className="mx-auto mt-14 max-w-[1200px] overflow-hidden rounded-2xl border border-[var(--mkt-border)] bg-white shadow-[0_30px_80px_-30px_rgba(20,21,26,0.18)]"
      >
        <div className="flex min-w-[720px] overflow-x-auto lg:min-w-0">
          {/* Sidebar */}
          <div className="w-[188px] shrink-0 border-r border-black/[0.05] bg-[var(--mkt-bg)] p-3">
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="grid h-6 w-6 place-items-center rounded-md bg-[var(--primary)] text-white">
                <span className="text-[10px] font-bold">W</span>
              </div>
              <span className="text-[12px] font-semibold text-[var(--mkt-text)]">Demo Store</span>
              <ChevronDown size={12} className="ml-auto text-[var(--mkt-muted-soft)]" />
            </div>
            <div className="mt-2 space-y-0.5">
              {SIDEBAR.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium ${
                    item.active ? "bg-white text-[var(--mkt-text)] shadow-[0_1px_2px_rgba(20,21,26,0.06)]" : "text-[var(--mkt-muted)]"
                  }`}
                >
                  <item.icon size={14} className={item.active ? "text-[var(--primary)]" : ""} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          {/* Main */}
          <div className="min-w-0 flex-1">
            {/* Topbar */}
            <div className="flex items-center gap-3 border-b border-black/[0.05] px-6 py-3.5">
              <div className="relative w-full max-w-[240px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--mkt-muted-soft)]" />
                <div className="h-8 w-full rounded-lg border border-black/[0.06] bg-[var(--mkt-bg)] pl-8 text-[12px] leading-8 text-[var(--mkt-muted-soft)]">
                  Search orders, customers…
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <SlidersHorizontal size={15} className="text-[var(--mkt-muted-soft)]" />
                <Bell size={15} className="text-[var(--mkt-muted-soft)]" />
                <div className="h-7 w-7 rounded-full bg-[var(--primary-soft)]" />
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 px-6 py-5 sm:grid-cols-4">
              {KPIS.map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-black/[0.05] p-3.5">
                  <p className="text-[11px] font-medium text-[var(--mkt-muted-soft)]">{kpi.label}</p>
                  <p className="mt-1 text-xl font-semibold text-[var(--mkt-text)]">{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Orders table */}
            <div className="overflow-x-auto px-6 pb-6">
              <table className="w-full min-w-[520px] text-left text-[12.5px]">
                <thead>
                  <tr className="border-y border-black/[0.05] text-[11px] font-semibold uppercase tracking-wide text-[var(--mkt-muted-soft)]">
                    <th className="py-2.5 pr-3 font-semibold">Channel</th>
                    <th className="px-3 py-2.5 font-semibold">Order</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Revenue</th>
                    <th className="pl-3 py-2.5 text-right font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {ORDERS.map((row) => (
                    <tr key={row.order} className="border-b border-black/[0.04] last:border-0">
                      <td className="py-3 pr-3">
                        <span className="rounded-full bg-[var(--mkt-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--mkt-text)]">{row.channel}</span>
                      </td>
                      <td className="px-3 py-3 font-medium text-[var(--mkt-text)]">{row.order}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.tone}`}>{row.status}</span>
                      </td>
                      <td className="px-3 py-3 font-semibold text-[var(--mkt-text)]">{row.revenue}</td>
                      <td className="pl-3 py-3 text-right text-[var(--mkt-muted-soft)]">{row.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
