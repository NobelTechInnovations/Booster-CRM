import { cn } from "@/lib/utils";

// Shared panel surfaces keep tables, charts, and forms visually consistent.
export function Card({ className, ...props }) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-slate-200/80 bg-[var(--panel)] shadow-[0_2px_6px_rgba(15,23,42,0.025)]",
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
        "flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }) {
  return (
    <h2
      className={cn("text-[15px] font-semibold leading-6 tracking-tight text-slate-900", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }) {
  return <div className={cn("min-w-0 p-4 sm:p-5", className)} {...props} />;
}
