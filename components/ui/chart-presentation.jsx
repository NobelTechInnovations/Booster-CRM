import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChartViewport({ label, className, children }) {
  return (
    <div className="thin-scrollbar max-w-full overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
      <div className={cn("h-80 min-w-[560px]", className)}>{children}</div>
    </div>
  );
}

// Presentation only: callers supply the existing series and formatted values.
export function ChartLegend({ items }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Chart legend">
      {items.map(({ label, color, type = "bar" }) => (
        <li key={label} className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <span
            aria-hidden="true"
            className={type === "bar" ? "h-2.5 w-2.5 rounded-sm" : "h-0 w-4 border-t-2"}
            style={{
              backgroundColor: type === "bar" ? color : undefined,
              borderColor: color,
              borderTopStyle: type === "dashed" || type === "dotted" ? type : "solid",
            }}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function ChartTooltipContent({ label, entries }) {
  return (
    <div className="min-w-44 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-lg">
      <p className="mb-2 border-b border-slate-100 pb-2 font-semibold text-slate-900">{label}</p>
      <div className="space-y-2">
        {entries.map(({ key, name, color, value }) => (
          <div key={key} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
              {name}
            </span>
            <span className="font-semibold tabular-nums text-slate-900">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartEmptyState({ title, description }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center">
      <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400">
        <BarChart3 size={19} aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-64 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}
