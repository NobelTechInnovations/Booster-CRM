import { cn } from "@/lib/utils";

// Plain pulsing placeholder block — the base primitive every skeleton below
// composes from. Shape it with className (h-4 w-24, rounded-full, etc.).
export function Skeleton({ className, ...props }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/70", className)} {...props} />;
}

// Mimics a KpiTile — used wherever a row of stat cards is still loading.
export function KpiTileSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-4">
      <div className="flex items-start justify-between">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-7 w-20" />
      <Skeleton className="mt-3 h-5 w-28 rounded-full" />
    </div>
  );
}

export function KpiRowSkeleton({ count = 4 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <KpiTileSkeleton key={i} />
      ))}
    </div>
  );
}

// Mimics a data table — header row + N body rows of varying-width bars, so
// it reads as "a table is coming" rather than a blank/generic pulse block.
export function TableSkeleton({ rows = 6, cols = 4 }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <div className="flex gap-6 border-b border-[var(--line)] px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 border-b border-slate-100 px-4 py-3.5 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-[140px]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Mimics a list of order/shipment cards (Fulfillment, Orders "ready to ship"
// style lists) — a title line + a couple of meta lines per row.
export function ListRowsSkeleton({ rows = 4 }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3.5">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-8 w-24 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}
