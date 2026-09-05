import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Headset,
  Layers3,
  LockKeyhole,
  Mail,
  MessageCircle,
  PlugZap,
  Receipt,
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
import { Reveal } from "@/components/reveal";

// ─── Hero checklist ──────────────────────────────────────────────────────────
const checks = [
  "Shopify & Amazon real-time sync",
  "WhatsApp inbox + template automation",
  "Email automation on every order event",
  "Multi-courier shipping in under 30s",
  "Meta Ads ROAS & real P&L",
  "GST-ready CGST / SGST / IGST reports",
];

// ─── Capability stats — platform claims, not usage numbers ──────────────────
// Deliberately not "50K+ orders processed"-style usage metrics: this is a
// pre-launch homepage, and claiming usage the product hasn't had yet would
// be dishonest marketing copy. Every number below is something verifiable
// straight from the code (integration count, role count, the fulfillment
// speed the Ship flow is built around).
const stats = [
  { label: "Native Integrations", value: "10+", icon: PlugZap },
  { label: "Avg. Ship Time", value: "<30s", icon: Zap },
  { label: "Role-Based Access Levels", value: "7", icon: Users },
  { label: "Automated Customer Engagement", value: "24/7", icon: MessageCircle },
];

// ─── Benefits — outcomes, not features ───────────────────────────────────────
const benefits = [
  {
    icon: Layers3,
    title: "Replace 5+ tools with one panel",
    desc: "Order management, shipping, WhatsApp, email marketing, and a support desk — stop paying for and switching between separate subscriptions.",
  },
  {
    icon: Zap,
    title: "Ship an order in under 30 seconds",
    desc: "Compare live courier rates across every connected partner and generate a real AWB without ever leaving the order.",
  },
  {
    icon: TrendingUp,
    title: "See your real profit, not just revenue",
    desc: "COGS, expenses, and Meta Ads spend roll up into one P&L with attributed ROAS — no spreadsheet reconciliation at month-end.",
  },
  {
    icon: MessageCircle,
    title: "Customers get answered, even offline",
    desc: "WhatsApp templates, automatic order-event emails, and support tickets that escalate and auto-close on their own after 48 hours.",
  },
];

// ─── Feature showcase — grouped exactly the way the panel's own sidebar and
// in-app Guide (components/guide-view.jsx) organize these modules, so the
// copy here never drifts from what's actually shipped. Four groups keep an
// otherwise 11-item wall of tiles scannable instead of overwhelming.
const featureGroups = [
  {
    key: "sell",
    label: "Sell everywhere",
    desc: "Bring every storefront into one order queue.",
    items: [
      { icon: ShoppingCart, title: "Unified Orders", desc: "Shopify and Amazon orders sync in real time via webhooks — no manual CSV uploads, no duplicate entries." },
      { icon: ArrowLeftRight, title: "Store Migration", desc: "Moving to a new Shopify store? Copy customers and orders across without losing history or double-counting revenue." },
    ],
  },
  {
    key: "fulfill",
    label: "Fulfill fast",
    desc: "From \"To Ship\" to a booked AWB in seconds.",
    items: [
      { icon: Truck, title: "Multi-Courier Shipping", desc: "Compare live rates across Delhivery, Shiprocket, Shipway, Velocity and Shipmozo, then book a real shipment in one click." },
      { icon: Boxes, title: "Inventory & Warehouse Sync", desc: "Stock levels stay in sync across every connected channel and warehouse automatically." },
    ],
  },
  {
    key: "engage",
    label: "Engage customers",
    desc: "Every conversation, on every channel, in one inbox.",
    items: [
      { icon: MessageCircle, title: "WhatsApp Inbox", desc: "Chat in real time via the official Cloud API, or scan a QR code with Smart WhatsApp to pair an existing number directly — no migration needed." },
      { icon: Camera, title: "Social Media", desc: "Reply to Instagram and Facebook comments on your posts without ever leaving the panel." },
      { icon: Mail, title: "Email & Automation", desc: "Connect your own SMTP, build templates, and send them automatically on order placed, shipped, delivered, refunded, or a custom trigger." },
      { icon: Headset, title: "Support Tickets", desc: "A public help page for customers with a real lifecycle — staff close requests need customer confirmation, and unanswered ones auto-resolve after 48 hours." },
    ],
  },
  {
    key: "grow",
    label: "Grow with data",
    desc: "Numbers your accountant and your ad manager both trust.",
    items: [
      { icon: CircleDollarSign, title: "Finance & Meta Ads ROAS", desc: "Real-time ad spend and attributed return from Meta Ads, rolled into one P&L alongside your actual costs." },
      { icon: Receipt, title: "GST-Ready Reports", desc: "Automatic CGST/SGST vs IGST split based on your store's place of supply and each order's delivery state." },
      { icon: Users, title: "Team & Roles", desc: "Seven built-in roles — Owner, Admin, Manager, Support, Warehouse, Marketing, Accountant — each scoped to exactly what their job needs." },
    ],
  },
];

// ─── How it works ────────────────────────────────────────────────────────────
const steps = [
  { number: "01", icon: PlugZap, title: "Connect your channels", desc: "One-click OAuth for Shopify and Amazon — no manual CSV uploads or API keys to hunt down." },
  { number: "02", icon: ShoppingCart, title: "Orders sync automatically", desc: "New orders, inventory, and customer data flow in via real-time webhooks the moment they happen." },
  { number: "03", icon: Truck, title: "Ship with any courier", desc: "Compare live rates across your connected shipping partners and generate a label in under 30 seconds." },
  { number: "04", icon: MessageCircle, title: "Engage & automate", desc: "WhatsApp, email, and support tickets stay on top of every customer — automatically, even when you're offline." },
];

// ─── Plans — mirrors the real, admin-configured plans (see Plan model /
// app/admin/plans). Update this list if pricing or included features
// change there; it's intentionally static copy, not a live fetch, since
// there's no public plans endpoint yet.
const plans = [
  {
    name: "Trial",
    price: "Free",
    period: "for 7 days",
    blurb: "Every feature unlocked — see if Wokbook fits before you commit.",
    limits: "Up to 2 users · 3 sales channels · 1 shipping partner",
    features: ["WhatsApp (Cloud API)", "Smart WhatsApp", "Social Media", "Automation", "Advanced Reports"],
    cta: "Start free trial",
    highlight: false,
  },
  {
    name: "Growth",
    price: "₹999",
    period: "/ month",
    blurb: "For brands past their first few hundred orders.",
    limits: "Up to 5 users · 5 sales channels · 2 shipping partners",
    features: ["WhatsApp (Cloud API)", "Automation", "Social Media"],
    cta: "Get Growth",
    highlight: true,
  },
  {
    name: "Premium",
    price: "₹1,999",
    period: "/ month",
    blurb: "For multi-brand sellers running serious volume.",
    limits: "Unlimited users, sales channels & shipping partners",
    features: ["WhatsApp (Cloud API)", "Smart WhatsApp", "Social Media", "Automation", "Advanced Reports", "Multi-Channel Selling", "Store Migration"],
    footnote: "+ ₹2 per order fulfillment fee, billed from your wallet as orders ship.",
    cta: "Get Premium",
    highlight: false,
  },
];

const faqs = [
  {
    q: "Do I need to migrate my whole store to get started?",
    a: "No — connect your existing Shopify or Amazon store with one-click OAuth and orders start syncing in minutes. If you're specifically moving to a new Shopify store, Store Migration copies customers and orders across without losing history or double-counting revenue.",
  },
  {
    q: "Can I use my own WhatsApp number?",
    a: "Yes, either way: connect via the official WhatsApp Cloud API for the full automation/template experience, or scan a QR code with Smart WhatsApp to pair an existing number directly — no separate Meta migration required.",
  },
  {
    q: "What happens when my trial ends?",
    a: "You keep your data. Upgrade to Growth or Premium anytime from Settings → Plan & Billing to keep your integrations, automations, and WhatsApp/email sending running without interruption.",
  },
  {
    q: "Is the GST report accurate for inter-state orders?",
    a: "Yes — it compares your store's configured Place of Supply against each order's actual delivery state to automatically classify it as CGST+SGST (same state) or IGST (different state), with the correct rate split either way.",
  },
  {
    q: "Can my team have different access levels?",
    a: "Yes — invite teammates as Owner, Admin, Manager, Support, Warehouse, Marketing, or Accountant. Each role only sees and can do what actually fits that job, from day one.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-white">
              <Layers3 size={20} />
            </div>
            <div>
              <p className="text-sm  leading-5 text-slate-900">Wokbook</p>
              <p className="text-[11px] font-medium text-[var(--muted)]">Commerce Operations Platform</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">Features</a>
            <a href="#benefits" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">Benefits</a>
            <a href="#pricing" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">Pricing</a>
            <a href="#faq" className="text-sm font-medium text-slate-600 transition hover:text-slate-900">FAQ</a>
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
        {/* Ambient brand-color glow — decorative only, purely CSS, no perf cost */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[var(--primary)]/10 blur-3xl" aria-hidden="true" />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 lg:grid-cols-[1fr_440px] lg:items-center lg:py-28 lg:px-4">
          <div>
            <Badge tone="indigo" className="inline-flex items-center gap-1.5">
              <Sparkles size={11} />
              Built for DTC & multi-brand sellers
            </Badge>
            <h1 className="mt-5 max-w-2xl text-[2.6rem] font-bold leading-[1.12] tracking-tight text-slate-950 md:text-6xl">
              The Commerce OS
              <br />
              <span className="text-[var(--primary)]">built for growing brands.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 md:text-lg">
              Connect Shopify and Amazon, manage fulfillment, chat with customers on WhatsApp, automate emails, resolve support tickets, and track real profit with Meta Ads ROAS — all from one role-based panel.
            </p>

            <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
          <div className="relative">
            {/* Floating notification chip — hidden on small screens to avoid overlap */}
            <div className="absolute -right-4 -top-4 z-10 hidden items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 shadow-md md:flex">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                <MessageCircle size={14} />
              </div>
              <div className="leading-tight">
                <p className="text-[11px] font-semibold text-slate-800">New WhatsApp reply</p>
                <p className="text-[10px] text-slate-400">Priya M. · just now</p>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-xs">
              {/* Mini topbar */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--primary)] text-white">
                    <Layers3 size={14} />
                  </div>
                  <span className="text-xs  text-slate-800">Wokbook Panel</span>
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
                    <p className="mt-1 text-xl  text-slate-900">{kpi.value}</p>
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
                      <span className=" text-slate-800">{order.name}</span>
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
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y border-[var(--line)] bg-[var(--panel-soft)]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-10 lg:grid-cols-4 lg:px-4">
          {stats.map((stat, i) => (
            <Reveal as="div" key={stat.label} delay={i * 60} className="flex flex-col items-center rounded-2xl border border-[var(--line)] bg-white py-8 text-center">
              <stat.icon size={20} className="mb-3 text-[var(--primary)]" />
              <p className="text-3xl font-bold text-slate-950">{stat.value}</p>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">{stat.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Benefits ── */}
      <section id="benefits" className="mx-auto max-w-7xl px-4 py-20 lg:px-4">
        <Reveal as="div" className="text-center">
          <Badge tone="indigo" className="inline-flex items-center gap-1.5">
            <ShieldCheck size={11} />
            Why teams switch
          </Badge>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
            Built to save you time and money
          </h2>
          <p className="mt-3 mx-auto max-w-xl text-base text-slate-600">
            Not just another dashboard — every module here replaces a tool you're probably already paying for separately.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((b, i) => (
            <Reveal
              as="div"
              key={b.title}
              delay={i * 70}
              className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-xs"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                <b.icon size={22} />
              </div>
              <h3 className="mt-4 text-base  text-slate-900">{b.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{b.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="border-y border-[var(--line)] bg-[var(--panel-soft)] py-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-4">
          <Reveal as="div" className="text-center">
            <Badge tone="indigo" className="inline-flex items-center gap-1.5">
              <Zap size={11} />
              Everything in your panel
            </Badge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              One platform for your entire operation
            </h2>
            <p className="mt-3 mx-auto max-w-xl text-base text-slate-600">
              From order intake to shipping to customer engagement to finance — Wokbook replaces five tools with one.
            </p>
          </Reveal>

          <div className="mt-14 space-y-14">
            {featureGroups.map((group, gi) => (
              <div key={group.key}>
                <Reveal as="div" delay={gi * 40} className="mb-6 flex items-baseline justify-between gap-4 border-b border-slate-200 pb-3">
                  <h3 className="text-lg  text-slate-900">{group.label}</h3>
                  <p className="hidden text-sm text-slate-500 sm:block">{group.desc}</p>
                </Reveal>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {group.items.map((feature, i) => (
                    <Reveal
                      as="div"
                      key={feature.title}
                      delay={i * 60}
                      className="group rounded-2xl border border-[var(--line)] bg-white p-6 shadow-xs transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_-8px_rgba(11,21,51,0.12)]"
                    >
                      <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                        <feature.icon size={22} />
                      </div>
                      <h3 className="mt-4 text-base  text-slate-900">{feature.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{feature.desc}</p>
                    </Reveal>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-4">
          <Reveal as="div" className="text-center">
            <Badge tone="indigo" className="inline-flex items-center gap-1.5">
              <Zap size={11} />
              How it works
            </Badge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              Live in minutes, not weeks
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <Reveal as="div" key={step.number} delay={i * 70} className="relative rounded-2xl border border-[var(--line)] bg-white p-6">
                <span className="text-4xl font-bold text-[var(--primary-soft)]">{step.number}</span>
                <div className="mt-3 grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                  <step.icon size={19} />
                </div>
                <h3 className="mt-4 text-base  text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="border-y border-[var(--line)] bg-[var(--panel-soft)] py-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-4">
          <Reveal as="div" className="text-center">
            <Badge tone="indigo" className="inline-flex items-center gap-1.5">
              <CircleDollarSign size={11} />
              Simple, transparent pricing
            </Badge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
              A plan for every stage of growth
            </h2>
            <p className="mt-3 mx-auto max-w-xl text-base text-slate-600">
              Start free, upgrade when you're ready. No setup fees, cancel anytime.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {plans.map((plan, i) => (
              <Reveal
                as="div"
                key={plan.name}
                delay={i * 80}
                className={`relative flex flex-col rounded-3xl border bg-white p-8 ${
                  plan.highlight ? "border-[var(--primary)] shadow-lg lg:-translate-y-2" : "border-[var(--line)] shadow-xs"
                }`}
              >
                {plan.highlight ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--primary)] px-3 py-1 text-[11px] font-semibold text-white">
                    Most Popular
                  </span>
                ) : null}

                <h3 className="text-lg  text-slate-900">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tracking-tight text-slate-950">{plan.price}</span>
                  <span className="text-sm font-medium text-slate-500">{plan.period}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{plan.blurb}</p>
                <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">{plan.limits}</p>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-indigo-600" />
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.footnote ? <p className="mt-4 text-[11px] leading-4 text-slate-400">{plan.footnote}</p> : null}

                <Link href="/signup" className="mt-6 block">
                  <Button variant={plan.highlight ? "primary" : "secondary"} className="h-11 w-full text-sm">
                    {plan.cta}
                    <ArrowRight size={16} />
                  </Button>
                </Link>
              </Reveal>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-slate-400">
            All prices in INR, excluding applicable taxes. Only Premium carries a per-order fulfillment fee — Growth and Trial have none.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-20 lg:px-4">
        <Reveal as="div" className="text-center">
          <Badge tone="indigo" className="inline-flex items-center gap-1.5">
            <Sparkles size={11} />
            Questions
          </Badge>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">
            Frequently asked questions
          </h2>
        </Reveal>

        <div className="mt-10 space-y-3">
          {faqs.map((item, i) => (
            <Reveal as="div" key={item.q} delay={i * 50}>
              <details className="group rounded-2xl border border-[var(--line)] bg-white px-5 py-4 open:shadow-xs">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-900 marker:content-none">
                  {item.q}
                  <ChevronRight size={16} className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-7xl px-4 py-16 lg:px-4">
        <Reveal as="div" className="rounded-3xl border border-[var(--line)] bg-white p-10 text-center shadow-xs md:p-16">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <ShieldCheck size={26} />
          </div>
          <h2 className="text-3xl font-bold text-slate-950">Ready to scale your brand?</h2>
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
        </Reveal>
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
                <span className="text-sm  text-slate-900">Wokbook</span>
              </Link>
              <p className="mt-3 max-w-xs text-sm leading-6 text-slate-500">
                The commerce operating system for DTC and multi-brand sellers — orders, shipping, WhatsApp, email, support, finance, and ads in one panel.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Product</p>
              <ul className="mt-3 space-y-2.5">
                <li><a href="#features" className="text-sm text-slate-600 hover:text-[var(--primary)]">Features</a></li>
                <li><a href="#benefits" className="text-sm text-slate-600 hover:text-[var(--primary)]">Benefits</a></li>
                <li><a href="#pricing" className="text-sm text-slate-600 hover:text-[var(--primary)]">Pricing</a></li>
                <li><a href="#faq" className="text-sm text-slate-600 hover:text-[var(--primary)]">FAQ</a></li>
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
            <p className="text-xs text-slate-400">Wokbook · Commerce Operating System — All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
