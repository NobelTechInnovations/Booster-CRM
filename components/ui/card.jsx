import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_1px_3px_rgba(15,23,42,0.05)]",
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
        "flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }) {
  return (
    <h2
      className={cn("text-[14px] font-semibold tracking-tight text-slate-900", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-5", className)} {...props} />;
}
