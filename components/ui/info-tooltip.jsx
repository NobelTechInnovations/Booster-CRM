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
// anchored beside the icon on desktop and to the viewport bottom on phones
// so long explanations stay inside the screen. Hidden tooltips use display:
// none so they cannot widen the page while inactive.
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
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 hidden rounded-lg bg-slate-900 px-3 py-2 text-[11.5px] font-medium normal-case leading-snug tracking-normal text-white shadow-xl group-hover/tip:block group-focus-within/tip:block sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-full sm:mt-2 sm:w-60 sm:-translate-x-1/2"
      >
        {text}
        <span className="absolute -top-1 left-1/2 hidden h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900 sm:block" />
      </span>
    </span>
  );
}
