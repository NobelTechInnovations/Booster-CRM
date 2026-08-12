"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Boxes,
  CalendarRange,
  Download,
  FileSpreadsheet,
  IndianRupee,
  Package,
  Percent,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getReport } from "@/lib/api";

const REPORT_ICONS = {
  sales: TrendingUp,
  gst: Receipt,
  "profit-loss": IndianRupee,
  expenses: Percent,
  purchases: Boxes,
  channel: ShoppingBag,
  "payment-method": Truck,
  products: Package,
  customers: Users,
  cancelled: Ban,
};

const REPORTS = [
  { key: "sales", label: "Sales Report" },
  { key: "gst", label: "GST / Tax Report" },
  { key: "profit-loss", label: "Profit & Loss" },
  { key: "expenses", label: "Expense Report" },
  { key: "purchases", label: "Purchases & Raw Material" },
  { key: "channel", label: "Channel-wise Sales" },
  { key: "payment-method", label: "Payment Method Split" },
  { key: "products", label: "Product Performance" },
  { key: "customers", label: "Customer Report" },
  { key: "cancelled", label: "Cancelled & Returns" },
];

const RANGE_PRESETS = [
  ["7", "Last 7 Days"],
  ["30", "Last 30 Days"],
  ["90", "Last 90 Days"],
  ["365", "This Year"],
  ["lifetime", "Lifetime"],
  ["custom", "Custom Range"],
];

// Arbitrarily early — no real business data predates this, so it's a safe
// stand-in for "no lower bound" without a separate backend code path.
const LIFETIME_START = "2000-01-01";

// toISOString() converts to UTC first — for any timezone ahead of UTC (e.g. IST,
// +5:30), local midnight becomes the *previous* day in UTC, silently shifting the
// whole date range back by one day. Format from local date parts instead.
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toCsv(columns, rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => escape(row[c.key])).join(",")).join("\n");
  return `${header}\n${body}`;
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReportsView() {
  const [activeType, setActiveType] = useState("sales");
  const [rangeDays, setRangeDays] = useState("30");
  const [custom, setCustom] = useState({ from: LIFETIME_START, to: isoDate(new Date()) });
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState(null); // { key, dir: "asc" | "desc" }

  const { from, to } = useMemo(() => {
    const end = new Date();
    if (rangeDays === "lifetime") return { from: LIFETIME_START, to: isoDate(end) };
    if (rangeDays === "custom") return { from: custom.from || LIFETIME_START, to: custom.to || isoDate(end) };
    const start = new Date();
    start.setDate(end.getDate() - Number(rangeDays));
    return { from: isoDate(start), to: isoDate(end) };
  }, [rangeDays, custom]);

  async function loadReport() {
    setIsLoading(true);
    setError("");
    try {
      const res = await getReport(activeType, { from, to });
      setReport(res.report);
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadReport(); setSort(null); }, [activeType, from, to]);

  function toggleSort(key) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: "desc" };
      if (current.dir === "desc") return { key, dir: "asc" };
      return null; // third click clears back to the report's default order
    });
  }

  const sortedRows = useMemo(() => {
    if (!report) return [];
    if (!sort) return report.rows;
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    return [...report.rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      return String(av ?? "").localeCompare(String(bv ?? "")) * mul;
    });
  }, [report, sort]);

  function handleExport() {
    if (!report) return;
    const csv = toCsv(report.columns, sortedRows);
    downloadCsv(`${activeType}-report-${from}-to-${to}.csv`, csv);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="indigo">Business Reports</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">Reports</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)] md:text-base">
            Sales, tax, profit, expenses, and customer insights — export any report as CSV.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs text-slate-500">
            <CalendarRange size={13} />
            {from} → {to}
          </div>
          <select
            className="h-9 rounded-lg border border-[var(--line)] bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-500"
            value={rangeDays}
            onChange={(e) => setRangeDays(e.target.value)}
          >
            {RANGE_PRESETS.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          {rangeDays === "custom" ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-white px-2 py-1">
              <input
                type="date"
                className="h-7 rounded border-0 bg-transparent px-1 text-xs font-semibold text-slate-700 outline-none"
                value={custom.from}
                max={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                className="h-7 rounded border-0 bg-transparent px-1 text-xs font-semibold text-slate-700 outline-none"
                value={custom.to}
                min={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              />
            </div>
          ) : null}
          <button
            onClick={handleExport}
            disabled={!report || !report.rows.length}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-700 px-3.5 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:opacity-40"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[240px_1fr]">
        {/* Report type sidebar */}
        <div className="flex gap-2 overflow-x-auto xl:flex-col xl:overflow-visible">
          {REPORTS.map((r) => {
            const Icon = REPORT_ICONS[r.key] || FileSpreadsheet;
            const active = activeType === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setActiveType(r.key)}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold transition xl:shrink ${
                  active
                    ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                    : "border-[var(--line)] bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/40"
                }`}
              >
                <Icon size={15} className={active ? "text-indigo-600" : "text-slate-400"} />
                <span className="whitespace-nowrap xl:whitespace-normal">{r.label}</span>
              </button>
            );
          })}
        </div>

        {/* Report table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-10 text-center text-sm text-[var(--muted)]">Generating report…</div>
            ) : error ? (
              <div className="p-10 text-center text-sm font-medium text-rose-600">{error}</div>
            ) : !report || report.rows.length === 0 ? (
              <div className="p-12 text-center">
                <FileSpreadsheet size={36} className="mx-auto mb-3 text-slate-300" />
                <p className="font-semibold text-slate-700">No data for this period</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Try a wider date range or sync your channels first.</p>
              </div>
            ) : (
              <>
                <div className="border-b border-[var(--line)] bg-slate-50 px-5 py-3">
                  <p className="font-bold text-slate-900">{report.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{report.description} · {report.rows.length} rows</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--line)] text-xs uppercase text-slate-500">
                        {report.columns.map((c, ci) => {
                          // Alignment is decided once per column (from actual row data) and
                          // reused identically on the header — previously the header forced
                          // the *last* column right-aligned regardless of its data type,
                          // which misaligned headers against text-valued last columns.
                          const isNumeric = report.rows.some((r) => typeof r[c.key] === "number");
                          const isActive = sort?.key === c.key;
                          return (
                            <th
                              key={c.key}
                              className={`py-3 px-4 font-semibold first:pl-5 last:pr-5 ${isNumeric ? "text-right" : "text-left"}`}
                            >
                              <button
                                onClick={() => toggleSort(c.key)}
                                className={`inline-flex items-center gap-1 hover:text-slate-800 ${isNumeric ? "flex-row-reverse" : ""} ${isActive ? "text-indigo-700" : ""}`}
                              >
                                {c.label}
                                {isActive ? (
                                  sort.dir === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />
                                ) : (
                                  <ArrowUpDown size={11} className="text-slate-300" />
                                )}
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row, idx) => (
                        <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                          {report.columns.map((c, ci) => {
                            const isNumeric = report.rows.some((r) => typeof r[c.key] === "number");
                            return (
                              <td
                                key={c.key}
                                className={`py-2.5 px-4 first:pl-5 first:font-semibold last:pr-5 ${ci === 0 ? "text-slate-900" : "text-slate-600"} ${
                                  isNumeric ? "text-right tabular-nums" : "text-left"
                                }`}
                              >
                                {typeof row[c.key] === "number" ? row[c.key].toLocaleString("en-IN") : row[c.key]}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
