"use client";

import Link from "next/link";
import { BarChart3, CheckCircle2, Layers3, Package, PlugZap, ShieldCheck, Truck } from "lucide-react";

const bullets = [
  { icon: PlugZap, text: "Connect Shopify & Amazon in one click" },
  { icon: BarChart3, text: "Live sales analytics with Meta Ads ROAS" },
  { icon: Truck, text: "Multi-courier shipping in under 30 seconds" },
  { icon: Package, text: "Finance, vendors, and P&L tracking" },
  { icon: ShieldCheck, text: "Role-based access for your whole team" },
];

export function AuthLayout({ eyebrow, title, text, children }) {
  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[1fr_520px]">
      {/* ── Left panel: brand story ── */}
      <section
        className="relative hidden flex-col justify-between overflow-hidden px-10 py-10 lg:flex"
        style={{
          background: "linear-gradient(155deg, #0b1533 0%, #1e1b4b 55%, #0b1533 100%)",
        }}
      >
        {/* Decorative glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 30% 40%, rgba(99,102,241,0.22) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 70% 70%, rgba(180,83,9,0.12) 0%, transparent 60%)",
          }}
        />

        {/* Logo */}
        <Link href="/" className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-white/20">
            <Layers3 size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Wokbook</p>
            <p className="text-[11px] font-medium text-indigo-200/60">Commerce Operations Platform</p>
          </div>
        </Link>

        {/* Main copy */}
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300/80">{eyebrow}</p>
          <h1 className="mt-3 max-w-md text-[2.2rem] font-extrabold leading-[1.15] tracking-tight text-white">
            {title}
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-indigo-200/70">{text}</p>

          <ul className="mt-8 space-y-3">
            {bullets.map((b) => (
              <li key={b.text} className="flex items-center gap-3">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-indigo-200">
                  <b.icon size={15} />
                </div>
                <span className="text-sm font-medium text-indigo-100/80">{b.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom badge */}
        <div className="relative flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] p-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/20">
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <p className="text-xs font-medium text-indigo-100/70">
            Secure company workspace · Role-based access · Channel-ready architecture.
          </p>
        </div>
      </section>

      {/* ── Right panel: form ── */}
      <section className="flex min-h-screen items-center justify-center border-l border-[var(--line)] bg-[var(--panel-soft)] px-4 py-10">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <Link href="/" className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-[var(--navy)] text-white">
              <Layers3 size={18} />
            </div>
            <span className="text-sm font-bold text-slate-900">Wokbook</span>
          </Link>
          {children}
        </div>
      </section>
    </main>
  );
}
