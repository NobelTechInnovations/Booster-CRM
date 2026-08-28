import { cn } from "@/lib/utils";

const tones = {
  green:  "bg-emerald-50  text-emerald-700 ring-1 ring-emerald-600/15",
  amber:  "bg-amber-50    text-amber-700   ring-1 ring-amber-600/15",
  rose:   "bg-rose-50     text-rose-700    ring-1 ring-rose-600/15",
  blue:   "bg-blue-50     text-blue-700    ring-1 ring-blue-600/15",
  slate:  "bg-slate-100   text-slate-600   ring-1 ring-slate-600/10",
  indigo: "bg-indigo-50   text-indigo-700  ring-1 ring-indigo-600/15",
  gold:   "bg-amber-50    text-amber-800   ring-1 ring-amber-600/15",
  teal:   "bg-teal-50     text-teal-700    ring-1 ring-teal-600/15",
};

const dotTones = {
  green:  "bg-emerald-500",
  amber:  "bg-amber-500",
  rose:   "bg-rose-500",
  blue:   "bg-blue-500",
  slate:  "bg-slate-400",
  indigo: "bg-indigo-500",
  gold:   "bg-amber-600",
  teal:   "bg-teal-500",
};

export function Badge({ tone = "slate", className, dot = false, children, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tones[tone] || tones.slate,
        className,
      )}
      {...props}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dotTones[tone] || dotTones.slate)} /> : null}
      {children}
    </span>
  );
}
