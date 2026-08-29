import { cn } from "@/lib/utils";

// Border kept intentionally faint (slate-200/70, not the full-strength
// --line token) and shadow reduced to a whisper — genuine containers like
// charts/panels still get separation, but the border itself should never be
// the first thing the eye registers on the page.
export function Card({ className, ...props }) {
  return (
    <section
      className={cn(
        "rounded-xl border border-slate-200/70 bg-[var(--panel)] shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }) {
  return (
    <h2
      className={cn("text-[15px] font-bold tracking-tight text-slate-900", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-6", className)} {...props} />;
}
