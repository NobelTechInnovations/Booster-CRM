import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)] active:translate-y-px",
  secondary:
    "border border-[var(--line)] bg-white text-[var(--foreground)] hover:border-slate-300 hover:bg-slate-50 active:translate-y-px",
  ghost: "text-[var(--muted)] hover:bg-slate-100 hover:text-[var(--foreground)]",
};

export function Button({ className, variant = "primary", ...props }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-[13px] font-semibold transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
