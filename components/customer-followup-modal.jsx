"use client";

import { useState } from "react";
import {
  X,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  MessageSquare,
  User,
  MapPin,
  Mail,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
} from "lucide-react";
import { addCustomerFollowUp } from "@/lib/api";
import { cn } from "@/lib/utils";

const OUTCOMES = [
  { key: "called",           label: "Called",            icon: Phone,        color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
  { key: "no_answer",        label: "No Answer",         icon: XCircle,      color: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" },
  { key: "interested",       label: "Interested",        icon: AlertCircle,  color: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
  { key: "converted",        label: "Order Placed ✓",   icon: CheckCircle2, color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" },
  { key: "follow_up_later",  label: "Follow Up Later",   icon: Clock,        color: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100" },
  { key: "not_interested",   label: "Not Interested",    icon: XCircle,      color: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" },
];

const FOLLOW_UP_STATUSES = [
  { key: "new",                 label: "New" },
  { key: "follow_up_scheduled", label: "Follow Up Scheduled" },
  { key: "converted",          label: "Converted" },
  { key: "no_response",        label: "No Response" },
  { key: "closed",             label: "Closed" },
];

function fmt(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(date));
}

function outcomeLabel(key) {
  return OUTCOMES.find((o) => o.key === key)?.label || key;
}

function outcomeColor(key) {
  const map = {
    called:          "text-blue-600",
    no_answer:       "text-slate-500",
    interested:      "text-amber-600",
    converted:       "text-green-600",
    follow_up_later: "text-violet-600",
    not_interested:  "text-rose-600",
  };
  return map[key] || "text-slate-500";
}

function statusBadge(status) {
  const map = {
    new:                 "bg-slate-100 text-slate-600",
    follow_up_scheduled: "bg-violet-100 text-violet-700",
    converted:           "bg-green-100 text-green-700",
    no_response:         "bg-amber-100 text-amber-700",
    closed:              "bg-rose-100 text-rose-700",
  };
  return map[status] || "bg-slate-100 text-slate-500";
}

export function CustomerFollowUpModal({ customer, onClose, onUpdate, onCreateOrder }) {
  const [tab, setTab] = useState("log"); // "log" | "edit" | "history"
  const [calledAt, setCalledAt] = useState(new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("called");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [followUpStatus, setFollowUpStatus] = useState(customer?.followUpStatus || "new");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Edit fields
  const [editFirst, setEditFirst] = useState(customer?.firstName || "");
  const [editLast, setEditLast] = useState(customer?.lastName || "");
  const [editEmail, setEditEmail] = useState(customer?.email || "");
  const [editPhone, setEditPhone] = useState(customer?.phone || "");
  const [editAddr1, setEditAddr1] = useState(customer?.defaultAddress?.address1 || "");
  const [editAddr2, setEditAddr2] = useState(customer?.defaultAddress?.address2 || "");
  const [editCity, setEditCity] = useState(customer?.defaultAddress?.city || "");
  const [editProvince, setEditProvince] = useState(customer?.defaultAddress?.province || "");
  const [editZip, setEditZip] = useState(customer?.defaultAddress?.zip || "");
  const [editCountry, setEditCountry] = useState(customer?.defaultAddress?.country || "India");

  const [showHistory, setShowHistory] = useState(false);

  function setNow() {
    setCalledAt(new Date().toISOString().slice(0, 16));
  }

  function addHours(h) {
    const d = new Date();
    d.setHours(d.getHours() + h);
    setNextFollowUpAt(d.toISOString().slice(0, 16));
  }

  function addDays(d) {
    const dt = new Date();
    dt.setDate(dt.getDate() + d);
    dt.setHours(10, 0, 0, 0);
    setNextFollowUpAt(dt.toISOString().slice(0, 16));
  }

  async function saveFollowUp() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        calledAt,
        note,
        outcome,
        nextFollowUpAt: nextFollowUpAt || undefined,
        followUpStatus,
        ...(tab === "edit" ? {
          firstName: editFirst,
          lastName: editLast,
          email: editEmail,
          phone: editPhone,
          address: {
            address1: editAddr1,
            address2: editAddr2,
            city: editCity,
            province: editProvince,
            zip: editZip,
            country: editCountry,
          },
        } : {}),
      };
      const result = await addCustomerFollowUp(customer.id || customer._id, payload);
      setSuccess("Follow-up saved successfully!");
      setNote("");
      onUpdate?.(result.customer);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const followUps = customer?.followUps || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl border border-[var(--line)] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)] bg-gradient-to-r from-teal-50 to-white">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-700 text-white text-sm font-bold shrink-0">
              {(customer?.name || "?")[0]?.toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-900 leading-tight">{customer?.name || "Customer"}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", statusBadge(customer?.followUpStatus || "new"))}>
                  {FOLLOW_UP_STATUSES.find((s) => s.key === (customer?.followUpStatus || "new"))?.label || "New"}
                </span>
                {customer?.phone && <span className="text-xs text-[var(--muted)]">{customer.phone}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onCreateOrder && (
              <button
                onClick={onCreateOrder}
                className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 transition"
              >
                <ShoppingCart size={13} />
                Create Order
              </button>
            )}
            <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--line)] px-5 gap-1">
          {[["log", "Log Call"], ["edit", "Edit Details"], ["history", `History (${followUps.length})`]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "py-2.5 px-3 text-xs font-semibold border-b-2 transition",
                tab === key ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto thin-scrollbar">
          {/* LOG TAB */}
          {tab === "log" && (
            <div className="p-5 space-y-4">
              {/* Call Time */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Call Date & Time</label>
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={calledAt}
                    onChange={(e) => setCalledAt(e.target.value)}
                    className="flex-1 h-9 rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 bg-white"
                  />
                  <button
                    onClick={setNow}
                    className="h-9 px-3 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition"
                  >
                    Now
                  </button>
                </div>
              </div>

              {/* Outcome */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Call Outcome</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {OUTCOMES.map(({ key, label, icon: Icon, color }) => (
                    <button
                      key={key}
                      onClick={() => {
                        setOutcome(key);
                        if (key === "converted") setFollowUpStatus("converted");
                        else if (key === "follow_up_later") setFollowUpStatus("follow_up_scheduled");
                        else if (key === "not_interested") setFollowUpStatus("closed");
                        else if (key === "no_answer") setFollowUpStatus("no_response");
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition",
                        outcome === key ? color + " ring-2 ring-offset-1 ring-teal-400" : color
                      )}
                    >
                      <Icon size={13} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Conversation details, customer concerns, follow-up instructions..."
                  className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 resize-none bg-white"
                />
              </div>

              {/* Next Follow-up */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Schedule Next Follow-Up</label>
                <div className="flex items-center gap-1.5 mb-2">
                  {[["1h", "+1 Hour", () => addHours(1)], ["3h", "+3 Hours", () => addHours(3)], ["tomorrow", "Tomorrow 10am", () => addDays(1)], ["3d", "+3 Days", () => addDays(3)]].map(([k, l, fn]) => (
                    <button key={k} onClick={fn} className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-600 hover:bg-slate-100 transition">
                      {l}
                    </button>
                  ))}
                </div>
                <input
                  type="datetime-local"
                  value={nextFollowUpAt}
                  onChange={(e) => setNextFollowUpAt(e.target.value)}
                  className="w-full h-9 rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 bg-white"
                />
              </div>

              {/* CRM Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Customer Status</label>
                <select
                  value={followUpStatus}
                  onChange={(e) => setFollowUpStatus(e.target.value)}
                  className="w-full h-9 rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-teal-600 bg-white"
                >
                  {FOLLOW_UP_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* EDIT DETAILS TAB */}
          {tab === "edit" && (
            <div className="p-5 space-y-4">
              <p className="text-xs text-[var(--muted)] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ Edits are saved locally in your CRM. Use "Log Call + Save" to push changes to Shopify at the same time.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[["First Name", editFirst, setEditFirst], ["Last Name", editLast, setEditLast]].map(([l, v, s]) => (
                  <div key={l}>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{l}</label>
                    <input value={v} onChange={(e) => s(e.target.value)} className="w-full h-9 rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 bg-white" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[["Email", editEmail, setEditEmail, "email"], ["Phone", editPhone, setEditPhone, "tel"]].map(([l, v, s, t]) => (
                  <div key={l}>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{l}</label>
                    <input type={t} value={v} onChange={(e) => s(e.target.value)} className="w-full h-9 rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 bg-white" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Address Line 1</label>
                <input value={editAddr1} onChange={(e) => setEditAddr1(e.target.value)} className="w-full h-9 rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Address Line 2</label>
                <input value={editAddr2} onChange={(e) => setEditAddr2(e.target.value)} className="w-full h-9 rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 bg-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[["City", editCity, setEditCity], ["Province / State", editProvince, setEditProvince], ["ZIP / PIN", editZip, setEditZip], ["Country", editCountry, setEditCountry]].map(([l, v, s]) => (
                  <div key={l}>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{l}</label>
                    <input value={v} onChange={(e) => s(e.target.value)} className="w-full h-9 rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 bg-white" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HISTORY TAB */}
          {tab === "history" && (
            <div className="p-5">
              {followUps.length === 0 ? (
                <div className="text-center py-12 text-[var(--muted)]">
                  <MessageSquare size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No follow-up history yet.</p>
                  <p className="text-xs mt-1">Log your first call to get started.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {followUps.map((fu, idx) => (
                    <div key={idx} className="flex gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                      <div className="mt-0.5 shrink-0">
                        <div className={cn("grid h-7 w-7 place-items-center rounded-full text-xs font-bold", outcomeColor(fu.outcome), "bg-white border border-current/20")}>
                          {idx + 1}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("text-xs font-semibold", outcomeColor(fu.outcome))}>{outcomeLabel(fu.outcome)}</span>
                          <span className="text-[10px] text-[var(--muted)]">{fmt(fu.calledAt)}</span>
                          {fu.createdByName && <span className="text-[10px] text-[var(--muted)]">by {fu.createdByName}</span>}
                        </div>
                        {fu.note && <p className="mt-1 text-xs text-slate-700 leading-relaxed">{fu.note}</p>}
                        {fu.nextFollowUpAt && (
                          <p className="mt-1 text-[10px] text-violet-600">
                            <Clock size={10} className="inline mr-1" />
                            Next: {fmt(fu.nextFollowUpAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {tab !== "history" && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3 bg-[var(--panel-soft)]">
            <div className="flex-1">
              {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
              {success && <p className="text-xs text-green-600 font-medium">{success}</p>}
            </div>
            <button onClick={onClose} className="h-8 px-3 rounded-lg border border-[var(--line)] text-xs text-slate-600 hover:bg-slate-100 transition">
              Cancel
            </button>
            <button
              onClick={saveFollowUp}
              disabled={saving}
              className="h-8 px-4 rounded-lg bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <RefreshCw size={12} className="animate-spin" /> : null}
              {tab === "edit" ? "Save + Log Call" : "Log Follow-Up"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
