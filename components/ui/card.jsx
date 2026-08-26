import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return (
    <section
      className={cn(
        "rounded-lg border border-[var(--line)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("flex items-start justify-between gap-4 border-b border-[var(--line)] px-4 py-3.5", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn("text-[14px] font-semibold tracking-tight text-[var(--foreground)]", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-4", className)} {...props} />;
}
