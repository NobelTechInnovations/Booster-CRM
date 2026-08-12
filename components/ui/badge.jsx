import { cn } from "@/lib/utils";

const tones = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/15",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/15",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/15",
  slate: "bg-slate-100 text-slate-700 ring-slate-600/10",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
  gold: "bg-amber-50 text-amber-800 ring-amber-600/15",
};

const dotTones = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  blue: "bg-blue-500",
  slate: "bg-slate-400",
  indigo: "bg-indigo-500",
  gold: "bg-amber-600",
};

export function Badge({ tone = "slate", className, dot = false, children, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-tight ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dotTones[tone])} /> : null}
      {children}
    </span>
  );
}
