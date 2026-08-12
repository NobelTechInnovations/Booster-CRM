import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Layers3,
  LockKeyhole,
  Package,
  PlugZap,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: ShoppingCart,
    title: "Unified Order Management",
    desc: "Centralise orders from Shopify, Amazon and other channels. Auto-sync, dedup, and manage everything from one panel.",
    accent: "#3730a3",
    bg: "#eef0fc",
  },
  {
    icon: Truck,
    title: "One-Click Shipping",
    desc: "Rate-check across Velocity, Shiprocket and more. Auto-fill customer details, choose courier, ship — all in under 30 seconds.",
    accent: "#0369a1",
    bg: "#e0f2fe",
  },
  {
    icon: CircleDollarSign,
    title: "Finance & P&L Tracking",
    desc: "Sales analytics, expense tracking, vendor purchases, and real-time ad spend with attributed ROAS from Meta Ads.",
    accent: "#b45309",
    bg: "#fef3c7",
  },
  {
    icon: PlugZap,
    title: "Multi-Channel Integrations",
    desc: "Native OAuth for Shopify, Amazon SP-API, Meta Marketing API. One-click connect, instant data sync.",
    accent: "#059669",
    bg: "#d1fae5",
  },
  {
    icon: BarChart3,
    title: "Live Analytics Dashboard",
    desc: "Today's sales, revenue trends, top products, fulfillment rate — all updated the moment an order comes in.",
    accent: "#7c3aed",
    bg: "#ede9fe",
  },
  {
    icon: Users,
    title: "Team & Role Management",
    desc: "Owner, Admin, Operations, Finance, Marketing, Accountant — granular permissions for every team role.",
    accent: "#be185d",
    bg: "#fce7f3",
  },
];

const stats = [
  { label: "Orders Managed", value: "50K+", icon: ShoppingCart },
  { label: "Channels Supported", value: "12+", icon: PlugZap },
  { label: "Avg. Ship Time", value: "<30s", icon: Zap },
  { label: "Brands Running", value: "Growing", icon: TrendingUp },
];

const checks = [
  "Shopify & Amazon real-time sync",
  "Meta Ads ROAS attribution",
  "Multi-warehouse shipping",
  "Role-based access control",
  "Finance & vendor management",
  "CRM with follow-up reminders",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 border-b border-[var(--line)]/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-[var(--navy)] text-white shadow-[0_4px_12px_-2px_rgba(79,70,229,0.55)]">
              <Layers3 size={20} />
            </div>
            <div>
              <p className="text-sm font-bold leading-5 text-slate-900">CommerceOS</p>
              <p className="text-[11px] font-medium text-[var(--muted)]">Sukirti Commerce Hub</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">Features</a>
            <a href="#stats" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">Platform</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="secondary" className="h-9">
                <LockKeyhole size={15} />
                Login
              </Button>
            </Link>
            <Link href="/signup">
              <Button className="h-9">
                Get Started
                <ArrowRight size={15} />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.13) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 80% 80%, rgba(180,83,9,0.07) 0%, transparent 60%)",
          }}
        />

        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 lg:grid-cols-[1fr_440px] lg:items-center lg:py-28 lg:px-6">
          <div>
            <Badge tone="indigo" className="inline-flex items-center gap-1.5">
              <Sparkles size={11} />
              Built for DTC & multi-brand sellers
            </Badge>
            <h1 className="mt-5 max-w-2xl text-[2.6rem] font-extrabold leading-[1.12] tracking-tight text-slate-950 md:text-6xl">
              The Commerce OS
              <br />
              <span className="bg-gradient-to-r from-indigo-700 to-indigo-500 bg-clip-text text-transparent">
                built for growing brands.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 md:text-lg">
              Connect Shopify and Amazon, manage fulfillment, track finances with Meta Ads ROAS, and run your entire e-commerce operation from a single, role-based command centre.
            </p>

            <ul className="mt-6 grid grid-cols-2 gap-2">
              {checks.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <CheckCircle2 size={16} className="shrink-0 text-indigo-600" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup">
                <Button className="h-11 px-5 text-sm">
                  Create Company Workspace
                  <Building2 size={17} />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="secondary" className="h-11 px-5 text-sm">
                  Login to Panel
                  <ChevronRight size={17} />
                </Button>
              </Link>
            </div>
          </div>

          {/* Dashboard Preview Card */}
          <div
            className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_20px_60px_-12px_rgba(11,21,51,0.18)]"
            style={{ background: "linear-gradient(160deg, #fff 70%, #f4f6ff 100%)" }}
          >
            {/* Mini topbar */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-600 to-[var(--navy)] text-white">
                  <Layers3 size={14} />
                </div>
                <span className="text-xs font-bold text-slate-800">CommerceOS Panel</span>
              </div>
              <div className="flex gap-1">
                <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>
            </div>

            {/* KPI row */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: "Today's Sales", value: "₹18.4k", change: "+23%", color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Pending Orders", value: "34", change: "Ship now", color: "text-indigo-600", bg: "bg-indigo-50" },
                { label: "ROAS (Meta)", value: "3.2×", change: "₹5.1k spend", color: "text-amber-700", bg: "bg-amber-50" },
                { label: "Net Margin", value: "38%", change: "After costs", color: "text-violet-600", bg: "bg-violet-50" },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-[var(--line)] p-3">
                  <p className="text-[11px] font-medium text-slate-500">{kpi.label}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{kpi.value}</p>
                  <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${kpi.bg} ${kpi.color}`}>
                    {kpi.change}
                  </span>
                </div>
              ))}
            </div>

            {/* Fake trend bars */}
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="mb-3 text-[11px] font-semibold text-slate-600">Revenue — Last 7 days</p>
              <div className="flex h-16 items-end gap-1.5">
                {[40, 65, 45, 80, 55, 90, 72].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-sm bg-gradient-to-t from-indigo-700 to-indigo-400" style={{ height: `${h}%`, opacity: 0.7 + i * 0.04 }} />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[9px] font-medium text-slate-400">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}
              </div>
            </div>

            {/* Orders mini-list */}
            <div className="mt-3 space-y-2">
              {[
                { name: "#4521", customer: "Priya M.", amount: "₹899", status: "Prepaid", dot: "bg-emerald-500" },
                { name: "#4520", customer: "Rahul K.", amount: "₹1,299", status: "COD", dot: "bg-amber-500" },
                { name: "#4519", customer: "Anjali S.", amount: "₹549", status: "Prepaid", dot: "bg-emerald-500" },
              ].map((order) => (
                <div key={order.name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className={`h-1.5 w-1.5 rounded-full ${order.dot}`} />
                    <span className="font-bold text-slate-800">{order.name}</span>
                    <span className="text-slate-500">{order.customer}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{order.amount}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium ring-1 ring-slate-200">{order.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section id="stats" className="border-y border-[var(--line)]/60 bg-[var(--navy)]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 lg:grid-cols-4 lg:px-6">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center py-10 text-center">
              <stat.icon size={20} className="mb-3 text-indigo-300" />
              <p className="text-3xl font-extrabold text-white">{stat.value}</p>
              <p className="mt-1 text-sm font-medium text-indigo-200/70">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-20 lg:px-6">
        <div className="text-center">
          <Badge tone="indigo" className="inline-flex items-center gap-1.5">
            <Zap size={11} />
            Everything you need
          </Badge>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">
            One platform for your entire operation
          </h2>
          <p className="mt-3 mx-auto max-w-xl text-base text-slate-600">
            From order intake to shipping to finance — CommerceOS replaces five tools with one.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_-8px_rgba(11,21,51,0.12)]"
            >
              <div
                className="grid h-11 w-11 place-items-center rounded-xl"
                style={{ background: feature.bg, color: feature.accent }}
              >
                <feature.icon size={22} />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-6">
        <div
          className="rounded-3xl p-10 text-center md:p-16"
          style={{
            background: "linear-gradient(135deg, #0b1533 0%, #1e1b4b 100%)",
            boxShadow: "0 20px 60px -12px rgba(11,21,51,0.4)",
          }}
        >
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-white">
            <ShieldCheck size={26} />
          </div>
          <h2 className="text-3xl font-extrabold text-white md:text-4xl">Ready to scale your brand?</h2>
          <p className="mt-4 mx-auto max-w-xl text-base text-indigo-200">
            Create your company workspace and connect your first channel in under 5 minutes. No setup fees. Designed for Indian DTC brands.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <button className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-indigo-900 shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition hover:bg-indigo-50">
                Create Company
                <Building2 size={18} />
              </button>
            </Link>
            <Link href="/login">
              <button className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 px-6 text-sm font-semibold text-white transition hover:bg-white/10">
                Login to Panel
                <ArrowRight size={18} />
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--line)]/60 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--navy)] text-white">
              <Layers3 size={14} />
            </div>
            <span className="text-sm font-bold text-slate-700">CommerceOS</span>
          </div>
          <p className="text-xs text-slate-400">Sukirti Naturals · Sukirti Spices · Kaleva — All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
