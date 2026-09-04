"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  Clock,
  ExternalLink,
  MessageCircle,
  PhoneCall,
  RefreshCw,
  User,
  Webhook,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatMoney } from "@/lib/utils";
import { SendWhatsAppModal } from "@/components/send-whatsapp-modal";
import {
  listWebhookEndpoints,
  listWebhookLeads,
  getWebhookLeadEvents,
  logWebhookLeadFollowUp,
  resolveLeadsGeoBulk,
  markLeadSeen,
} from "@/lib/api";

// Split out of settings-view.jsx's old WebhooksTab — that tab used to mix
// endpoint (URL/secret) configuration with the actual leads data in one
// place. Endpoint configuration stays under Settings → Webhooks; this file
// is just the leads data + follow-up workflow, now its own sidebar item
// (see app/panel/layout.jsx's NAV_GROUPS) since it's used far more often
// than the one-time endpoint setup.

function LeadModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// All possible follow-up outcomes — getFollowUpOutcomes() filters these down
// by the lead's current state so the dropdown only shows relevant choices.
const ALL_FOLLOW_UP_OUTCOMES = [
  { value: "called", label: "Called", forStatuses: ["new", "follow_up_scheduled", "no_response"] },
  { value: "no_answer", label: "No answer", forStatuses: ["new", "follow_up_scheduled", "no_response"] },
  { value: "interested", label: "Interested", forStatuses: ["new", "follow_up_scheduled", "no_response"] },
  { value: "converted", label: "Converted ✓", forStatuses: ["new", "follow_up_scheduled", "interested"] },
  { value: "follow_up_later", label: "Follow up later", forStatuses: ["new", "follow_up_scheduled", "interested", "no_response"] },
  { value: "not_interested", label: "Not interested", forStatuses: ["new", "follow_up_scheduled", "no_response"] },
  { value: "other", label: "Other", forStatuses: null /* always shown */ },
];

function getFollowUpOutcomes(currentStatus) {
  return ALL_FOLLOW_UP_OUTCOMES.filter(
    (o) => !o.forStatuses || o.forStatuses.includes(currentStatus || "new"),
  );
}

// Used in the follow-up history panel to resolve a stored value back to its label
function outcomeLabel(value) {
  return ALL_FOLLOW_UP_OUTCOMES.find((o) => o.value === value)?.label || value;
}

// ─── IST date helpers ────────────────────────────────────────────────────────
// Indian Standard Time = UTC+5:30. The browser's datetime-local input always
// emits the value in the *local* timezone. We explicitly treat the user's
// input as IST and store the correct UTC equivalent on the server.

// Convert a datetime-local string ("2026-08-28T14:00") entered in IST to an
// ISO UTC string for storage, preserving the user's actual intent.
function istInputToUtcIso(localValue) {
  if (!localValue) return undefined;
  // The input value has no timezone info — append +05:30 so JS parses it as IST.
  const date = new Date(`${localValue}:00+05:30`);
  return isNaN(date.getTime()) ? undefined : date.toISOString();
}

// Format a stored UTC ISO string for display in IST.
function formatIST(utcString) {
  if (!utcString) return "";
  return new Date(utcString).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

// Return a datetime-local–compatible string from a stored UTC ISO, in IST,
// so pre-populated inputs show the correct IST time.
function utcToIstInput(utcString) {
  if (!utcString) return "";
  const ist = new Date(new Date(utcString).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  // "YYYY-MM-DDTHH:MM"
  const pad = (n) => String(n).padStart(2, "0");
  return `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}T${pad(ist.getHours())}:${pad(ist.getMinutes())}`;
}

const LEAD_STATUS_TONE = { new: "slate", follow_up_scheduled: "amber", converted: "green", no_response: "rose", closed: "slate" };

function leadFollowUpCountdown(date) {
  const diff = new Date(date) - Date.now();
  if (diff <= 0) return "Overdue";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${Math.floor(hrs / 24)}d`;
}

// Same outcome/status log as the customer follow-up flow — kept identical so
// a webhook lead and a synced customer read the same way once you're calling them.
function LogFollowUpModal({ lead, onClose, onLogged }) {
  const currentStatus = lead.followUpStatus || "new";
  const outcomes = getFollowUpOutcomes(currentStatus);
  const [outcome, setOutcome] = useState(outcomes[0]?.value || "called");
  const [note, setNote] = useState("");
  const [followUpStatus, setFollowUpStatus] = useState(currentStatus);
  // Stored in IST-formatted string for the datetime-local input; converted to
  // UTC before sending so the server always stores real UTC.
  const [nextFollowUpAt, setNextFollowUpAt] = useState(
    lead.nextFollowUpAt ? utcToIstInput(lead.nextFollowUpAt) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // When the user picks "Converted", auto-advance the status so they don't
  // have to set it manually in a second step.
  function handleOutcomeChange(val) {
    setOutcome(val);
    if (val === "converted") setFollowUpStatus("converted");
    else if (val === "not_interested") setFollowUpStatus("closed");
    else if (val === "interested" && followUpStatus === "new") setFollowUpStatus("follow_up_scheduled");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await logWebhookLeadFollowUp(lead._id || lead.id, {
        outcome,
        note,
        followUpStatus,
        // Convert IST local input to UTC before sending to the server.
        nextFollowUpAt: istInputToUtcIso(nextFollowUpAt),
      });
      onLogged(result.lead);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <LeadModal title={`Log follow-up — ${lead.customerName || lead.customerPhone || "Lead"}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm font-semibold text-slate-700">
          Outcome
          <select className="mt-1 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" value={outcome} onChange={(e) => handleOutcomeChange(e.target.value)}>
            {outcomes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Lead status
          <select className="mt-1 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" value={followUpStatus} onChange={(e) => setFollowUpStatus(e.target.value)}>
            <option value="new">New</option>
            <option value="follow_up_scheduled">Follow-up scheduled</option>
            <option value="converted">Converted</option>
            <option value="no_response">No response</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Next follow-up (optional) — IST
          <input type="datetime-local" className="mt-1 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} />
          <span className="text-[11px] text-slate-400">Times are in India Standard Time (IST = UTC+5:30)</span>
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Note
          <textarea rows={3} className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving…" : "Log follow-up"}</Button>
      </form>
    </LeadModal>
  );
}

// ─── Beautified event payload ───────────────────────────────────────────────
// Turns a raw webhook JSON payload into readable "Label: value" rows instead
// of a wall of JSON — snake_case/camelCase keys are humanized, booleans read
// as Yes/No, nested objects/arrays indent one level. A "View raw JSON" toggle
// still reveals the exact payload underneath for anyone who needs it.

function humanizeKey(key) {
  const spaced = String(key).replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatPrimitive(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function ReadablePayload({ data, depth = 0 }) {
  if (data === null || data === undefined) return <span className="text-slate-400">—</span>;
  if (typeof data !== "object") return <span className="text-slate-700">{formatPrimitive(data)}</span>;

  const isArray = Array.isArray(data);
  const entries = isArray ? data.map((v, i) => [String(i), v]) : Object.entries(data);
  if (!entries.length) return <span className="text-slate-400">—</span>;

  return (
    <div className={cn("space-y-1.5", depth > 0 && "ml-3 border-l border-slate-200 pl-3")}>
      {entries.map(([key, value]) => {
        const isNested = value !== null && typeof value === "object" && Object.keys(value).length > 0;
        return (
          <div key={key} className="text-xs">
            <span className="font-semibold text-slate-500">{isArray ? `#${Number(key) + 1}` : humanizeKey(key)}</span>
            {isNested ? (
              <div className="mt-1"><ReadablePayload data={value} depth={depth + 1} /></div>
            ) : (
              <span className="ml-1.5 break-all text-slate-700">{formatPrimitive(value)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Right-side drawer — full event timeline for one lead, replacing the old
// under-row inline JSON expansion for readability (a cart with 5+ stage
// events made the table nearly unreadable inline).
function LeadDrawer({ lead, onClose, onLogFollowUp, onWhatsApp }) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [rawIds, setRawIds] = useState(() => new Set());

  useEffect(() => {
    setIsLoading(true);
    getWebhookLeadEvents(lead._id || lead.id)
      .then((res) => setEvents(res.events || []))
      .finally(() => setIsLoading(false));
  }, [lead]);

  function toggleRaw(eid) {
    setRawIds((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid); else next.add(eid);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--line)] px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{lead.provider}</p>
            <h2 className="text-lg font-bold text-slate-900">{lead.customerName || lead.customerPhone || lead.customerEmail || "Lead"}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              {lead.customerPhone ? <span className="flex items-center gap-1"><PhoneCall size={11} />{lead.customerPhone}</span> : null}
              {lead.cartValue ? <span className="font-semibold text-slate-700">{formatMoney(lead.cartValue)}</span> : null}
              <Badge tone={LEAD_STATUS_TONE[lead.followUpStatus] || "slate"}>{(lead.followUpStatus || "new").replace(/_/g, " ")}</Badge>
            </div>
            {lead.productInterest ? (
              <p className="mt-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-500">Interested in: </span>
                {lead.landingPageUrl ? (
                  <a href={lead.landingPageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-indigo-700 hover:underline">
                    {lead.productInterest}
                    <ExternalLink size={10} />
                  </a>
                ) : (
                  lead.productInterest
                )}
                {lead.productPrice !== undefined && lead.productPrice !== null ? (
                  <span className="ml-1.5 font-semibold text-slate-700">· {formatMoney(lead.productPrice)}</span>
                ) : null}
              </p>
            ) : null}
            {(lead.geoCity || lead.geoRegion) ? (
              <p className="mt-1 text-xs text-slate-600">
                <span className="font-semibold text-slate-500">Location:</span> {[lead.geoCity, lead.geoRegion].filter(Boolean).join(", ")}
                {lead.likelyLanguage ? <span className="ml-1.5 font-semibold text-indigo-700">· likely {lead.likelyLanguage}</span> : null}
              </p>
            ) : null}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex gap-2 border-b border-[var(--line)] px-4 py-3">
          {lead.customerPhone ? (
            <Button variant="secondary" className="h-9 flex-1" onClick={() => onWhatsApp(lead)}>
              <MessageCircle size={14} />
              Send WhatsApp
            </Button>
          ) : null}
          <Button className="h-9 flex-1" onClick={() => onLogFollowUp(lead)}>
            <PhoneCall size={14} />
            Log follow-up
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {lead.followUps?.length ? (
            <div className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Follow-up history</p>
              <div className="space-y-2">
                {lead.followUps.map((f) => (
                  <div key={f._id} className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-indigo-700">{outcomeLabel(f.outcome)}</span>
                      <span className="text-slate-400">{formatIST(f.calledAt)}</span>
                    </div>
                    {f.note ? <p className="mt-1 text-slate-600">{f.note}</p> : null}
                    <p className="mt-1 text-[10px] text-slate-400">by {f.createdByName}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Event timeline ({events.length})</p>
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="space-y-2">
              {events.map((event, idx) => {
                const eid = event._id || event.id;
                const isExpanded = expandedId === eid;
                const showRaw = rawIds.has(eid);
                return (
                  <div key={eid} className="overflow-hidden rounded-lg border border-slate-200">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : eid)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", idx === 0 ? "bg-indigo-600" : "bg-slate-300")} />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{event.type}</p>
                          <p className="flex items-center gap-1 text-[11px] text-slate-400"><Clock size={10} />{formatIST(event.receivedAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={event.verified ? "green" : "amber"}>{event.verified ? "Verified" : "Unverified"}</Badge>
                        <ChevronRight size={14} className={cn("text-slate-400 transition-transform", isExpanded && "rotate-90")} />
                      </div>
                    </button>
                    {isExpanded ? (
                      <div className="border-t border-slate-100 bg-slate-50/60 p-3">
                        <ReadablePayload data={event.payload} />
                        <button
                          type="button"
                          onClick={() => toggleRaw(eid)}
                          className="mt-2.5 text-[11px] font-semibold text-indigo-600 hover:underline"
                        >
                          {showRaw ? "Hide raw JSON" : "View raw JSON"}
                        </button>
                        {showRaw ? (
                          <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeadRow({ lead, duplicateCount, onView, onFollowUp, onWhatsApp }) {
  const hasGeo = lead.geoResolvedAt && (lead.geoCity || lead.geoRegion);
  const geoPending = !lead.geoResolvedAt && lead.ipAddress;
  const isUnseen = !lead.seenAt;
  return (
    <tr
      className={cn(
        "cursor-pointer border-b transition-colors last:border-0",
        isUnseen
          ? "border-amber-100 bg-amber-50/60 hover:bg-amber-50"
          : "border-slate-100 hover:bg-slate-50/60",
      )}
      onClick={() => onView(lead)}
    >
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500"><User size={14} /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {isUnseen ? (
                <span className="shrink-0 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px]  uppercase tracking-wide text-white">New</span>
              ) : null}
              <p className="truncate text-sm font-semibold text-slate-800">{lead.customerName || lead.customerPhone || lead.customerEmail || "Unknown"}</p>
              {duplicateCount > 1 ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px]  text-amber-700" title={`${duplicateCount} records share this phone`}>{duplicateCount}×</span>
              ) : null}
            </div>
            {lead.customerPhone && lead.customerName ? <p className="text-[11px] text-slate-400">{lead.customerPhone}</p> : null}
          </div>
        </div>
      </td>
      <td className="max-w-[220px] py-2.5 pr-3">
        {lead.productInterest ? (
          <>
            {lead.landingPageUrl ? (
              <a
                href={lead.landingPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={lead.productInterest}
                className="inline-flex max-w-full items-center gap-0.5 truncate text-xs font-medium text-indigo-700 hover:underline"
              >
                <span className="truncate">{lead.productInterest}</span>
                <ExternalLink size={10} className="shrink-0" />
              </a>
            ) : (
              <p className="truncate text-xs font-medium text-slate-700" title={lead.productInterest}>{lead.productInterest}</p>
            )}
            {lead.productPrice !== undefined && lead.productPrice !== null ? (
              <p className="text-[11px] text-slate-500">{formatMoney(lead.productPrice)}</p>
            ) : null}
          </>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </td>
      <td className="py-2.5 pr-3">
        {hasGeo ? (
          <div>
            <p className="text-xs font-medium text-slate-700">{[lead.geoCity, lead.geoRegion].filter(Boolean).join(", ") || "—"}</p>
            {lead.likelyLanguage ? <Badge tone="indigo" className="mt-1">{lead.likelyLanguage}</Badge> : null}
          </div>
        ) : geoPending ? (
          <span className="text-xs text-slate-400">Locating…</span>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-xs font-medium text-slate-700">{lead.latestStage || lead.latestType}</td>
      <td className="py-2.5 pr-3 text-sm font-semibold text-slate-800">{lead.cartValue ? formatMoney(lead.cartValue) : "—"}</td>
      <td className="py-2.5 pr-3 text-center text-xs font-medium text-slate-500">{lead.eventCount}</td>
      <td className="py-2.5 pr-3 text-xs text-slate-500">{formatIST(lead.lastEventAt)}</td>
      <td className="py-2.5 pr-3">
        <Badge tone={LEAD_STATUS_TONE[lead.followUpStatus] || "slate"}>{(lead.followUpStatus || "new").replace(/_/g, " ")}</Badge>
        {lead.linkedCustomerId ? (
          <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-indigo-600">
            <span>↗ Customer</span>
          </span>
        ) : null}
        {lead.nextFollowUpAt ? (
          <p className={cn("mt-1 text-[11px] font-semibold", new Date(lead.nextFollowUpAt) < Date.now() ? "text-rose-600" : "text-amber-700")}>
            {leadFollowUpCountdown(lead.nextFollowUpAt)}
          </p>
        ) : null}
      </td>
      <td className="py-2.5 pr-0 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {lead.customerPhone ? (
            <button onClick={() => onWhatsApp(lead)} className="rounded-md p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" title="Send WhatsApp">
              <MessageCircle size={15} />
            </button>
          ) : null}
          <button onClick={() => onFollowUp(lead)} className="rounded-md p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700" title="Log follow-up">
            <PhoneCall size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// Sort options for the leads table
const LEAD_SORT_OPTIONS = [
  { value: "lastEventAt:desc", label: "Last seen (newest)" },
  { value: "lastEventAt:asc", label: "Last seen (oldest)" },
  { value: "cartValue:desc", label: "Cart value (high→low)" },
  { value: "cartValue:asc", label: "Cart value (low→high)" },
  { value: "nextFollowUpAt:asc", label: "Follow-up (soonest)" },
  { value: "customerName:asc", label: "Name (A→Z)" },
];

function sortLeads(leads, sortKey) {
  const [field, dir] = sortKey.split(":");
  return [...leads].sort((a, b) => {
    let va = a[field], vb = b[field];
    if (field === "cartValue") { va = Number(va) || 0; vb = Number(vb) || 0; }
    else if (field === "lastEventAt" || field === "nextFollowUpAt") {
      va = va ? new Date(va).getTime() : 0;
      vb = vb ? new Date(vb).getTime() : 0;
    } else {
      va = String(va || "").toLowerCase();
      vb = String(vb || "").toLowerCase();
    }
    return dir === "asc" ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
  });
}

// Top-level "Leads" sidebar page — every lead captured from a webhook event
// (abandoned carts, payment attempts, etc), with the follow-up call workflow.
// Endpoint (URL/secret) setup itself stays under Settings → Webhooks; this
// page only reads listWebhookEndpoints() for the filter dropdown.
export function LeadsView() {
  const [endpoints, setEndpoints] = useState([]);
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterEndpoint, setFilterEndpoint] = useState("");
  const [viewingLead, setViewingLead] = useState(null);
  const [followUpLead, setFollowUpLead] = useState(null);
  const [whatsappLead, setWhatsappLead] = useState(null);
  const [sortKey, setSortKey] = useState("lastEventAt:desc");
  // No phone captured on the cart/order event (e.g. a Fastrr cart still at
  // latest_stage:"INIT" before checkout) means there's no number to actually
  // call — split those out from real, callable leads instead of mixing them
  // into one list.
  const [leadTab, setLeadTab] = useState("verified");

  async function refresh() {
    setIsLoading(true);
    try {
      const [endpointsRes, leadsRes] = await Promise.all([
        listWebhookEndpoints(),
        listWebhookLeads(filterEndpoint ? { endpointId: filterEndpoint } : {}),
      ]);
      setEndpoints(endpointsRes.endpoints || []);
      setLeads(leadsRes.leads || []);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEndpoint]);

  // Keep the open drawer's data current after a follow-up is logged from inside it.
  function handleLeadUpdated(updatedLead) {
    setLeads((prev) => prev.map((l) => ((l._id || l.id) === (updatedLead._id || updatedLead.id) ? updatedLead : l)));
    setViewingLead((prev) => (prev && (prev._id || prev.id) === (updatedLead._id || updatedLead.id) ? updatedLead : prev));
  }

  // Called when user opens a lead drawer — marks it seen in the DB (permanent).
  function handleViewLead(lead) {
    setViewingLead(lead);
    if (!lead.seenAt) {
      const leadId = lead._id || lead.id;
      markLeadSeen(leadId).then((res) => {
        if (res?.lead) handleLeadUpdated(res.lead);
      }).catch(() => { });
    }
  }

  // Deduplicate by phone — when multiple records share the same phone number
  // (e.g. same person from different endpoints) show the most recent one and
  // carry the count so the user sees how many records exist for that number.
  const phoneCount = new Map();
  for (const l of leads) {
    if (l.customerPhone) phoneCount.set(l.customerPhone, (phoneCount.get(l.customerPhone) || 0) + 1);
  }
  // Keep only the most-recently-seen record per phone; unverified leads keep all.
  const seenPhones = new Set();
  const verifiedLeadsRaw = leads.filter((l) => l.customerPhone);
  // Sort raw by lastEventAt desc so the most recent record wins the dedup pass.
  const verifiedLeadsSorted = [...verifiedLeadsRaw].sort((a, b) => new Date(b.lastEventAt) - new Date(a.lastEventAt));
  const dedupedVerified = verifiedLeadsSorted.filter((l) => {
    if (seenPhones.has(l.customerPhone)) return false;
    seenPhones.add(l.customerPhone);
    return true;
  });

  const verifiedLeads = sortLeads(dedupedVerified, sortKey);
  const unverifiedLeads = sortLeads(leads.filter((l) => !l.customerPhone), sortKey);
  // Soonest/overdue first — a logged follow-up is worthless as a reminder if
  // it's buried at whatever position it happened to sort to in the main list.
  const followUpLeads = leads
    .filter((l) => l.nextFollowUpAt)
    .sort((a, b) => new Date(a.nextFollowUpAt) - new Date(b.nextFollowUpAt));
  const overdueFollowUpCount = followUpLeads.filter((l) => new Date(l.nextFollowUpAt) < Date.now()).length;
  const shownLeads = leadTab === "verified" ? verifiedLeads : leadTab === "unverified" ? unverifiedLeads : followUpLeads;

  // Auto-locate verified leads (the callable ones) as soon as they load —
  // "outside the drawer" means this has to just show up, not wait for a
  // click. Batched in groups of 25 to stay well under the free geo API's
  // rate limit; once a lead is resolved (success or not) it's marked
  // geoResolvedAt so this naturally stops re-requesting it.
  useEffect(() => {
    const pendingIds = verifiedLeads
      .filter((l) => l.ipAddress && !l.geoResolvedAt)
      .map((l) => l._id || l.id);
    if (!pendingIds.length) return;

    let cancelled = false;
    async function locateInBatches() {
      for (let i = 0; i < pendingIds.length; i += 25) {
        if (cancelled) return;
        try {
          const res = await resolveLeadsGeoBulk(pendingIds.slice(i, i + 25));
          const resolved = res.leads || [];
          if (cancelled || !resolved.length) continue;
          setLeads((prev) => prev.map((l) => {
            const match = resolved.find((r) => String(r._id || r.id) === String(l._id || l.id));
            return match ? { ...l, ...match } : l;
          }));
        } catch (_err) {
          // best-effort — a failed batch just leaves those rows showing "—"
        }
      }
    }
    locateInBatches();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads]);

  return (
    <div className="mx-auto max-w-[1920px] space-y-5 px-4 py-5 lg:px-8">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Leads</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Repeat events from the same cart/order are grouped into one lead. Click a row for the full timeline and to log a follow-up call.
              Webhook endpoint/URL setup lives under Settings → Webhooks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-[var(--line)] bg-white px-2.5 text-xs outline-none focus:border-indigo-500"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
            >
              {LEAD_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              className="h-9 rounded-md border border-[var(--line)] bg-white px-2.5 text-xs outline-none focus:border-indigo-500"
              value={filterEndpoint}
              onChange={(e) => setFilterEndpoint(e.target.value)}
            >
              <option value="">All endpoints</option>
              {endpoints.map((endpoint) => (
                <option key={endpoint._id || endpoint.id} value={endpoint._id || endpoint.id}>{endpoint.name}</option>
              ))}
            </select>
            <button onClick={refresh} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Refresh">
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="mb-4 flex items-center gap-2 border-b border-[var(--line)]">
            <button
              onClick={() => setLeadTab("verified")}
              className={`flex items-center gap-1.5 border-b-2 px-1 pb-2.5 text-sm font-semibold ${leadTab === "verified" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              Verified <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{verifiedLeads.length}</span>
            </button>
            <button
              onClick={() => setLeadTab("unverified")}
              className={`flex items-center gap-1.5 border-b-2 px-1 pb-2.5 text-sm font-semibold ${leadTab === "unverified" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              Unverified <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{unverifiedLeads.length}</span>
            </button>
            <button
              onClick={() => setLeadTab("followups")}
              className={`flex items-center gap-1.5 border-b-2 px-1 pb-2.5 text-sm font-semibold ${leadTab === "followups" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              Follow-ups <span className={cn("rounded-full px-1.5 py-0.5 text-[11px]", overdueFollowUpCount ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>{followUpLeads.length}</span>
            </button>
          </div>
          <p className="-mt-2 mb-3 text-xs text-[var(--muted)]">
            {leadTab === "verified"
              ? "Has a phone number captured from the webhook event — callable."
              : leadTab === "unverified"
                ? "No phone number on the event yet (e.g. a cart still at an early checkout stage) — nothing to call until one comes in."
                : "Every lead with a follow-up call scheduled, soonest (or most overdue) first."}
          </p>
          {!shownLeads.length ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              {!leads.length ? <Webhook size={22} className="text-slate-300" /> : null}
              <p className="text-sm text-[var(--muted)]">
                {!leads.length ? "No leads yet — they'll appear here as webhook events come in."
                  : leadTab === "followups" ? "No follow-ups scheduled — log one from a lead's timeline."
                    : `No ${leadTab} leads.`}
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-xs uppercase text-slate-500">
                  <th className="py-2.5 pr-3 font-semibold">Customer</th>
                  <th className="py-2.5 pr-3 font-semibold">Interested in</th>
                  <th className="py-2.5 pr-3 font-semibold">Location</th>
                  <th className="py-2.5 pr-3 font-semibold">Stage</th>
                  <th className="py-2.5 pr-3 font-semibold">Cart value</th>
                  <th className="py-2.5 pr-3 text-center font-semibold">Events</th>
                  <th className="py-2.5 pr-3 font-semibold">Last seen</th>
                  <th className="py-2.5 pr-3 font-semibold">Status</th>
                  <th className="py-2.5 pr-0 text-right font-semibold" />
                </tr>
              </thead>
              <tbody>
                {shownLeads.map((lead) => (
                  <LeadRow
                    key={lead._id || lead.id}
                    lead={lead}
                    duplicateCount={lead.customerPhone ? (phoneCount.get(lead.customerPhone) || 1) : 1}
                    onView={handleViewLead}
                    onFollowUp={setFollowUpLead}
                    onWhatsApp={setWhatsappLead}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {whatsappLead ? (
        <SendWhatsAppModal
          phone={whatsappLead.customerPhone}
          name={whatsappLead.customerName}
          onClose={() => setWhatsappLead(null)}
        />
      ) : null}

      {viewingLead ? (
        <LeadDrawer lead={viewingLead} onClose={() => setViewingLead(null)} onLogFollowUp={setFollowUpLead} onWhatsApp={setWhatsappLead} />
      ) : null}
      {followUpLead ? (
        <LogFollowUpModal lead={followUpLead} onClose={() => setFollowUpLead(null)} onLogged={handleLeadUpdated} />
      ) : null}
    </div>
  );
}
