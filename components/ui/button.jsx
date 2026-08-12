import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-gradient-to-b from-[#4338ca] to-[var(--primary)] text-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_6px_16px_-6px_rgba(55,48,163,0.55)] hover:from-[#4c41d6] hover:to-[#3f38b8] hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_20px_-6px_rgba(55,48,163,0.6)] active:translate-y-px active:shadow-[0_1px_2px_rgba(15,23,42,0.08)]",
  secondary:
    "border border-[var(--line)] bg-white text-[var(--foreground)] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50 active:translate-y-px",
  ghost: "text-[var(--muted)] hover:bg-slate-100 hover:text-[var(--foreground)]",
};

export function Button({ className, variant = "primary", ...props }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0 disabled:shadow-none",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
