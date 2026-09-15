"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

// A small "i" affordance that explains what a card/metric actually means —
// used next to KPI labels across Dashboard and Finance.
//
// Was previously a native `title` attribute — technically "worked", but a
// bare hover cue with no visual affordance and the browser's own ~1s delay
// reads as "nothing happens" far more often than it reads as "a tooltip is
// about to appear", which is exactly what got reported. This is a real,
// immediately-visible popover instead: a dark card that appears the instant
// you hover or focus the icon, with an arrow pointing back at it. It's
// positioned as a sibling INSIDE the same relatively-positioned wrapper as
// the icon (not the card), so it isn't clipped by anything the icon's own
// container does — the caller (KpiTile) also had to drop its
// `overflow-hidden` for this to have room to actually show.
export function InfoTooltip({ text, className }) {
  if (!text) return null;
  return (
    <span className={cn("group/tip relative inline-flex shrink-0", className)}>
      <button
        type="button"
        tabIndex={0}
        aria-label={text}
        onClick={(e) => e.preventDefault()}
        className="inline-flex text-slate-300 outline-none transition hover:text-indigo-500 focus-visible:text-indigo-500"
      >
        <Info size={13} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-60 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-[11.5px] font-medium normal-case leading-snug tracking-normal text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {text}
        <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900" />
      </span>
    </span>
  );
}
