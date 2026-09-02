"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { hasFeature } from "@/lib/features";

// Wraps a plan-gated view (Smart WhatsApp, Social, Automation) — renders
// the real thing when the company's plan includes it, or an upsell card
// when it doesn't. Nav items themselves stay visible either way (see
// app/panel/layout.jsx) — this is where "not included" actually shows up,
// not a vanished menu item. This is UX only; the real boundary is the
// backend's requireFeature() middleware on the same routes.
export function FeatureGate({ session, feature, label, children }) {
  if (hasFeature(session, feature)) return children;

  return (
    <div className="mx-auto flex max-w-[1920px] flex-col items-center justify-center px-4 py-24 text-center lg:px-8">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
        <Lock size={24} />
      </div>
      <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-950">{label} isn't on your current plan</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
        Upgrade to a plan that includes {label} to unlock it for your workspace.
      </p>
      <Link
        href="/panel/settings?tab=billing"
        className="mt-6 flex h-10 items-center gap-1.5 rounded-lg bg-indigo-700 px-4 text-sm font-semibold text-white hover:bg-indigo-800"
      >
        <Sparkles size={15} />
        View plans &amp; upgrade
      </Link>
    </div>
  );
}
