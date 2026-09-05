import Link from "next/link";
import { ArrowRight, ChevronRight, Layers3, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "./eyebrow";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* A single restrained brand-color wash, not a glowing blob — kept far
          enough from any text that it never touches contrast. */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[var(--primary)]/[0.06] blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-[1320px] gap-16 px-6 py-24 lg:grid-cols-[1fr_460px] lg:items-center lg:py-32 lg:px-10">
        <div>
          <Eyebrow>Commerce Operations Platform</Eyebrow>
          <h1 className="mt-5 max-w-xl text-[2.75rem] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--mkt-text)] md:text-[4rem]">
            Run your entire
            <br />
            commerce operation
            <br />
            <span className="text-[var(--primary)]">from one platform.</span>
          </h1>
          <p className="mt-6 max-w-[560px] text-[17px] leading-[1.65] text-[var(--mkt-muted)]">
            Connect Shopify and Amazon, automate fulfillment, engage customers on WhatsApp and email, and see real profit — all from one role-based command center.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/signup">
              <Button className="h-11 px-5 text-[14px]">
                Get Started
                <ArrowRight size={16} />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" className="h-11 px-5 text-[14px]">
                Login to Panel
                <ChevronRight size={16} />
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-[var(--mkt-muted-soft)]">No credit card required — 7-day free trial, every feature unlocked.</p>
        </div>

        {/* Product visual */}
        <div className="relative">
          <div className="absolute -right-4 -top-4 z-10 hidden items-center gap-2 rounded-xl border border-[var(--mkt-border)] bg-white px-3 py-2 shadow-[0_8px_24px_-8px_rgba(20,21,26,0.14)] md:flex">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <MessageCircle size={14} />
            </div>
            <div className="leading-tight">
              <p className="text-[11px] font-semibold text-[var(--mkt-text)]">New WhatsApp reply</p>
              <p className="text-[10px] text-[var(--mkt-muted-soft)]">Priya M. · just now</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--mkt-border)] bg-white p-5 shadow-[0_24px_60px_-20px_rgba(20,21,26,0.16)]">
            <div className="flex items-center justify-between border-b border-black/[0.05] pb-3">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--primary)] text-white">
                  <Layers3 size={14} />
                </div>
                <span className="text-[13px] font-semibold text-[var(--mkt-text)]">Wokbook Panel</span>
              </div>
              <div className="flex gap-1.5">
                <div className="h-2 w-2 rounded-full bg-rose-300" />
                <div className="h-2 w-2 rounded-full bg-amber-300" />
                <div className="h-2 w-2 rounded-full bg-emerald-300" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: "Today's Sales", value: "₹18.4k", change: "+23%", tone: "text-emerald-700 bg-emerald-50" },
                { label: "Pending Orders", value: "34", change: "Ship now", tone: "text-[var(--primary)] bg-[var(--primary-soft)]" },
                { label: "ROAS (Meta)", value: "3.2×", change: "₹5.1k spend", tone: "text-amber-700 bg-amber-50" },
                { label: "Net Margin", value: "38%", change: "After costs", tone: "text-violet-700 bg-violet-50" },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-[var(--mkt-border)] p-3">
                  <p className="text-[11px] font-medium text-[var(--mkt-muted-soft)]">{kpi.label}</p>
                  <p className="mt-1 text-xl font-semibold text-[var(--mkt-text)]">{kpi.value}</p>
                  <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${kpi.tone}`}>{kpi.change}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-black/[0.05] bg-[var(--mkt-bg)] p-3">
              <p className="mb-3 text-[11px] font-semibold text-[var(--mkt-muted)]">Revenue — Last 7 days</p>
              <div className="flex h-16 items-end gap-1.5">
                {[40, 65, 45, 80, 55, 90, 72].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-sm bg-[var(--primary)]" style={{ height: `${h}%`, opacity: 0.55 + i * 0.06 }} />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[9px] font-medium text-[var(--mkt-muted-soft)]">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {[
                { name: "#4521", customer: "Priya M.", amount: "₹899", status: "Prepaid", dot: "bg-emerald-500" },
                { name: "#4520", customer: "Rahul K.", amount: "₹1,299", status: "COD", dot: "bg-amber-500" },
                { name: "#4519", customer: "Anjali S.", amount: "₹549", status: "Prepaid", dot: "bg-emerald-500" },
              ].map((order) => (
                <div key={order.name} className="flex items-center justify-between rounded-lg bg-[var(--mkt-bg)] px-3 py-2 text-[12px]">
                  <div className="flex items-center gap-2">
                    <div className={`h-1.5 w-1.5 rounded-full ${order.dot}`} />
                    <span className="font-semibold text-[var(--mkt-text)]">{order.name}</span>
                    <span className="text-[var(--mkt-muted-soft)]">{order.customer}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--mkt-text)]">{order.amount}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium ring-1 ring-black/[0.06]">{order.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
