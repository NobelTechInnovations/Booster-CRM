import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

// A small "i" affordance that explains what a card/metric actually means —
// used next to KPI labels across Dashboard and Finance. Deliberately a
// native title tooltip (not a custom popover): most of these cards use
// overflow-hidden, which would clip a positioned popover, and a native
// tooltip needs no portal, no clipping logic, and still shows on hover
// and (via tabIndex) on keyboard focus.
export function InfoTooltip({ text, className }) {
  if (!text) return null;
  return (
    <span
      title={text}
      tabIndex={0}
      role="note"
      aria-label={text}
      className={cn(
        "inline-flex shrink-0 cursor-help text-slate-300 outline-none transition hover:text-indigo-500 focus-visible:text-indigo-500",
        className,
      )}
    >
      <Info size={13} />
    </span>
  );
}
