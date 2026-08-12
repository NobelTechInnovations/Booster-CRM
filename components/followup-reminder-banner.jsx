"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, X, Phone, Clock, ChevronRight } from "lucide-react";
import { getUpcomingFollowUps } from "@/lib/api";
import { cn } from "@/lib/utils";

function timeUntil(date) {
  const diff = new Date(date) - new Date();
  if (diff <= 0) return "OVERDUE";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `in ${hrs}h ${mins % 60}m`;
}

function isOverdue(date) {
  return new Date(date) < new Date();
}

export function FollowUpReminderBanner({ onOpenCustomer }) {
  const [customers, setCustomers] = useState([]);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchReminders = useCallback(async () => {
    try {
      const result = await getUpcomingFollowUps();
      setCustomers(result.customers || []);
      // Reset dismissed if there are new reminders
      if ((result.customers || []).length > 0) setDismissed(false);
    } catch {
      // silently ignore - reminder is non-critical
    }
  }, []);

  useEffect(() => {
    fetchReminders();
    // Poll every 5 minutes
    const interval = setInterval(fetchReminders, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchReminders]);

  if (!customers.length || dismissed) return null;

  const overdue = customers.filter((c) => isOverdue(c.nextFollowUpAt));
  const upcoming = customers.filter((c) => !isOverdue(c.nextFollowUpAt));
  const primary = customers[0];

  return (
    <div
      className={cn(
        "border-b border-amber-200 bg-amber-50 transition-all",
        overdue.length > 0 && "bg-rose-50 border-rose-200",
      )}
    >
      <div className="flex items-center gap-3 px-4 py-2">
        {/* Flash Icon */}
        <div className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          overdue.length > 0 ? "bg-rose-500 text-white animate-pulse" : "bg-amber-500 text-white"
        )}>
          <Bell size={12} />
        </div>

        {/* Main message */}
        <div className="flex-1 min-w-0">
          <span className={cn("text-xs font-semibold", overdue.length > 0 ? "text-rose-700" : "text-amber-800")}>
            {overdue.length > 0
              ? `${overdue.length} overdue follow-up${overdue.length > 1 ? "s" : ""}!`
              : `${customers.length} follow-up${customers.length > 1 ? "s" : ""} due soon`}
          </span>
          <span className="ml-2 text-xs text-amber-700 truncate">
            {primary.name} —{" "}
            <span className={cn("font-medium", isOverdue(primary.nextFollowUpAt) ? "text-rose-600" : "text-amber-700")}>
              {timeUntil(primary.nextFollowUpAt)}
            </span>
            {primary.phone && ` · ${primary.phone}`}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onOpenCustomer?.(primary)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold transition",
              overdue.length > 0
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-amber-500 text-white hover:bg-amber-600"
            )}
          >
            <Phone size={10} />
            Open
            <ChevronRight size={10} />
          </button>
          {customers.length > 1 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-[10px] text-amber-700 hover:text-amber-900 font-medium underline"
            >
              +{customers.length - 1} more
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="rounded p-1 text-amber-600 hover:bg-amber-100"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Expanded list */}
      {expanded && customers.length > 1 && (
        <div className="border-t border-amber-200 bg-white px-4 py-2 space-y-1">
          {customers.map((c) => (
            <div key={c._id} className="flex items-center gap-3">
              <Clock size={11} className={cn(isOverdue(c.nextFollowUpAt) ? "text-rose-500" : "text-amber-500")} />
              <span className="text-xs text-slate-700 flex-1">{c.name}</span>
              <span className={cn("text-[10px] font-semibold", isOverdue(c.nextFollowUpAt) ? "text-rose-600" : "text-amber-700")}>
                {timeUntil(c.nextFollowUpAt)}
              </span>
              {c.phone && <span className="text-[10px] text-slate-500">{c.phone}</span>}
              <button
                onClick={() => { setExpanded(false); onOpenCustomer?.(c); }}
                className="text-[10px] font-semibold text-indigo-700 hover:underline"
              >
                Open
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
