import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-700 active:translate-y-px shadow-xs",
  secondary:
    "border border-[var(--line)] bg-[var(--panel)] text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:translate-y-px shadow-xs",
  ghost:
    "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
};

export function Button({ className, variant = "primary", ...props }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
