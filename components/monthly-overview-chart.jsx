"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { getFinanceTrend } from "@/lib/api";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatAxisCurrency(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n}`;
}

function formatFullCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MonthlyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[var(--line)] bg-white p-3 text-sm shadow-lg">
      <p className="mb-2 font-semibold">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {formatFullCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

// One bar-chart-per-year view — sales, (non-marketing) expense, and
// marketing spend, one bar-group per month from January through the
// current month (or December, for a past year). The only control is the
// year: pick an earlier year to see that year's full months instead of
// fiddling with a from/to range every time. Reused as-is on both the
// Dashboard and the Finance Overview tab.
export function MonthlyOverviewChart({ minYear }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const yearOptions = useMemo(() => {
    const earliest = minYear && minYear < currentYear ? minYear : currentYear - 4;
    const options = [];
    for (let y = currentYear; y >= earliest; y -= 1) options.push(y);
    return options;
  }, [currentYear, minYear]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError("");
    const isCurrentYear = year === currentYear;
    const now = new Date();
    const to = isCurrentYear
      ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
      : `${year}-12-31`;

    getFinanceTrend({ from: `${year}-01-01`, to, groupBy: "month" })
      .then((res) => {
        if (cancelled) return;
        const byKey = new Map((res.trend || []).map((point) => [point.key, point]));
        const lastMonth = isCurrentYear ? now.getMonth() : 11;
        const months = [];
        for (let m = 0; m <= lastMonth; m += 1) {
          const key = `${year}-${String(m + 1).padStart(2, "0")}`;
          const point = byKey.get(key);
          months.push({
            month: MONTH_LABELS[m],
            sales: point?.revenue || 0,
            expense: point?.otherExpenses || 0,
            marketing: point?.marketingSpend || 0,
          });
        }
        setRows(months);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setIsLoading(false));

    return () => { cancelled = true; };
  }, [year, currentYear]);

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-1.5">
            Monthly Overview
            <InfoTooltip text="Sales, expense (non-marketing), and marketing spend for each month of the selected year, January through the most recent month. Switch years to compare against a previous year — nothing else to filter." />
          </CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">January through {year === currentYear ? "this month" : "December"}, {year}.</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-9 shrink-0 rounded-lg border border-[var(--line)] bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>
        ) : isLoading ? (
          <div className="h-80 space-y-3 p-2">
            <div className="flex h-full items-end gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="w-full" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
              ))}
            </div>
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows || []} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e5eaf1" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatAxisCurrency} tickLine={false} axisLine={false} width={56} />
                <Tooltip content={<MonthlyTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sales" name="Sales" fill="#3730a3" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="expense" name="Expense" fill="#e11d48" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="marketing" name="Marketing Spend" fill="#0891b2" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
