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

const steps = [
  { number: "01", icon: PlugZap, title: "Connect your channels", desc: "One-click OAuth for Shopify and Amazon — no manual CSV uploads or API keys to hunt down." },
  { number: "02", icon: ShoppingCart, title: "Orders sync automatically", desc: "New orders, inventory, and customer data flow in via real-time webhooks the moment they happen." },
  { number: "03", icon: Truck, title: "Ship with any courier", desc: "Compare live rates across your connected shipping partners and generate a label in under 30 seconds." },
  { number: "04", icon: CircleDollarSign, title: "Track the real P&L", desc: "Revenue, COGS, expenses, and Meta Ads ROAS roll up into one finance view — no spreadsheet reconciliation." },
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
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-white">
              <Layers3 size={20} />
            </div>
            <div>
              <p className="text-sm font-bold leading-5 text-slate-900">Wokbook</p>
              <p className="text-[11px] font-medium text-[var(--muted)]">Commerce Operations Platform</p>
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
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 lg:grid-cols-[1fr_440px] lg:items-center lg:py-28 lg:px-4">
          <div>
            <Badge tone="indigo" className="inline-flex items-center gap-1.5">
              <Sparkles size={11} />
              Built for DTC & multi-brand sellers
            </Badge>
            <h1 className="mt-5 max-w-2xl text-[2.6rem] font-extrabold leading-[1.12] tracking-tight text-slate-950 md:text-6xl">
              The Commerce OS
              <br />
              <span className="text-[var(--primary)]">built for growing brands.</span>
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
                <Button className="h-11 px-4 text-sm">
                  Create Company Workspace
                  <Building2 size={17} />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="secondary" className="h-11 px-4 text-sm">
                  Login to Panel
                  <ChevronRight size={17} />
                </Button>
              </Link>
            </div>
          </div>

          {/* Dashboard Preview Card */}
          <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
            {/* Mini topbar */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--primary)] text-white">
                  <Layers3 size={14} />
                </div>
                <span className="text-xs font-bold text-slate-800">Wokbook Panel</span>
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
                  <div key={i} className="flex-1 rounded-t-sm bg-[var(--primary)]" style={{ height: `${h}%`, opacity: 0.6 + i * 0.05 }} />
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
      <section id="stats" className="border-y border-[var(--line)] bg-[var(--panel-soft)]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-10 lg:grid-cols-4 lg:px-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center rounded-2xl border border-[var(--line)] bg-white py-8 text-center">
              <stat.icon size={20} className="mb-3 text-[var(--primary)]" />
              <p className="text-3xl font-extrabold text-slate-950">{stat.value}</p>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-20 lg:px-4">
        <div className="text-center">
          <Badge tone="indigo" className="inline-flex items-center gap-1.5">
            <Zap size={11} />
            Everything you need
          </Badge>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">
            One platform for your entire operation
          </h2>
          <p className="mt-3 mx-auto max-w-xl text-base text-slate-600">
            From order intake to shipping to finance — Wokbook replaces five tools with one.
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

      {/* ── How it works ── */}
      <section id="how-it-works" className="border-y border-[var(--line)] bg-[var(--panel-soft)] py-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-4">
          <div className="text-center">
            <Badge tone="indigo" className="inline-flex items-center gap-1.5">
              <Zap size={11} />
              How it works
            </Badge>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">
              Live in minutes, not weeks
            </h2>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.number} className="relative rounded-2xl border border-[var(--line)] bg-white p-6">
                <span className="text-4xl font-extrabold text-[var(--primary-soft)]">{step.number}</span>
                <div className="mt-3 grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                  <step.icon size={19} />
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-4">
        <div className="rounded-3xl border border-[var(--line)] bg-white p-10 text-center shadow-sm md:p-16">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <ShieldCheck size={26} />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-950 md:text-4xl">Ready to scale your brand?</h2>
          <p className="mt-4 mx-auto max-w-xl text-base text-slate-600">
            Create your company workspace and connect your first channel in under 5 minutes. No setup fees. Designed for Indian DTC brands.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button className="h-12 px-4 text-sm">
                Create Company
                <Building2 size={18} />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" className="h-12 px-4 text-sm">
                Login to Panel
                <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--line)] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-4">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <Link href="/" className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--primary)] text-white">
                  <Layers3 size={16} />
                </div>
                <span className="text-sm font-bold text-slate-900">Wokbook</span>
              </Link>
              <p className="mt-3 max-w-xs text-sm leading-6 text-slate-500">
                The commerce operating system for DTC and multi-brand sellers — orders, shipping, finance, and ads in one panel.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Product</p>
              <ul className="mt-3 space-y-2.5">
                <li><a href="#features" className="text-sm text-slate-600 hover:text-[var(--primary)]">Features</a></li>
                <li><a href="#stats" className="text-sm text-slate-600 hover:text-[var(--primary)]">Platform</a></li>
                <li><a href="#how-it-works" className="text-sm text-slate-600 hover:text-[var(--primary)]">How it works</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Account</p>
              <ul className="mt-3 space-y-2.5">
                <li><Link href="/login" className="text-sm text-slate-600 hover:text-[var(--primary)]">Login</Link></li>
                <li><Link href="/signup" className="text-sm text-slate-600 hover:text-[var(--primary)]">Create company workspace</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-[var(--line)] pt-6">
            <p className="text-xs text-slate-400">Wokbook · Ecommerce Operating System — All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
