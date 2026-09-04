"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Headset, Loader2, Mail, MessageSquareText, Phone, RefreshCw, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listSupportTickets, getSupportTicket, replySupportTicket, updateSupportTicketStatus } from "@/lib/api";

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "pending_close", label: "Pending Close" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

// Selecting "Closed" from the status dropdown below doesn't set this status
// directly — the backend puts it on hold as "pending_close" instead (see
// updateSupportTicketStatus in support-ticket.repo.js), so it's deliberately
// left out of the assignable options: staff can ask to close, not force it.
const ASSIGNABLE_STATUSES = STATUS_TABS.filter((t) => t.key && t.key !== "pending_close");

const STATUS_TONE = { open: "blue", in_progress: "amber", pending_close: "gold", resolved: "green", closed: "slate" };

function fmtDateTime(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

// Right-side drawer — one ticket's full history + reply box + status
// control. Same overall shape as leads-view.jsx's LeadDrawer from earlier
// this session (full timeline, act-on-it panel).
function TicketDrawer({ ticketId, onClose, onUpdated }) {
  const [ticket, setTicket] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const res = await getSupportTicket(ticketId);
      setTicket(res.ticket);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReply(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await replySupportTicket(ticketId, reply.trim());
      setTicket(res.ticket);
      setReply("");
      onUpdated(res.ticket);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(status) {
    setUpdatingStatus(true);
    setError("");
    try {
      const res = await updateSupportTicketStatus(ticketId, status);
      setTicket(res.ticket);
      onUpdated(res.ticket);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        {isLoading || !ticket ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 size={22} className="animate-spin text-indigo-600" /></div>
        ) : (
          <>
            <div className="flex items-start justify-between border-b border-[var(--line)] px-4 py-4">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-wide text-slate-400">{ticket.ticketNumber}</p>
                <h2 className="text-lg font-bold text-slate-900">{ticket.category}{ticket.subCategory ? ` — ${ticket.subCategory}` : ""}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {ticket.contactPhone ? <span className="flex items-center gap-1"><Phone size={11} />{ticket.contactPhone}</span> : null}
                  {ticket.contactEmail ? <span className="flex items-center gap-1"><Mail size={11} />{ticket.contactEmail}</span> : null}
                  {ticket.isGeneralInquiry ? <Badge tone="slate">General inquiry</Badge> : null}
                </div>
              </div>
              <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
              <select
                value={ticket.status === "pending_close" ? "closed" : ticket.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={updatingStatus}
                className="h-8 rounded-md border border-[var(--line)] bg-white px-2 text-xs outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                {ASSIGNABLE_STATUSES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              {ticket.status === "pending_close" ? <span className="text-xs text-slate-400">Waiting on customer to confirm — auto-closes in 48h either way</span> : null}
            </div>

            {ticket.status === "pending_close" ? (
              <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
                <p className="text-xs leading-5 text-amber-800">
                  You asked to close this ticket. It stays open until the customer confirms, comments (which cancels the close), or 48 hours pass with no response.
                </p>
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Original message</p>
              <div className="mb-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{ticket.message}</div>

              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Replies ({ticket.replies?.length || 0})</p>
              {ticket.replies?.length ? (
                <div className="space-y-2.5">
                  {ticket.replies.map((r) => {
                    const isCustomer = r.authorType === "customer";
                    return (
                      <div key={r._id} className={`rounded-lg border p-3 ${isCustomer ? "border-slate-200 bg-slate-50" : "border-indigo-100 bg-indigo-50/50"}`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-semibold ${isCustomer ? "text-slate-600" : "text-indigo-700"}`}>{isCustomer ? `${r.authorName} (customer)` : r.authorName}</span>
                          <span className="text-slate-400">{fmtDateTime(r.createdAt)}</span>
                        </div>
                        <p className="mt-1.5 text-sm text-slate-700">{r.message}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No replies yet.</p>
              )}
            </div>

            <form onSubmit={handleReply} className="border-t border-[var(--line)] p-4">
              {error ? <p className="mb-2 text-xs font-medium text-rose-600">{error}</p> : null}
              <div className="flex gap-2">
                <textarea
                  rows={2}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply — sent to the customer by email if they gave one…"
                  className="flex-1 resize-none rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                <Button type="submit" disabled={sending || !reply.trim()} className="h-auto self-stretch px-3">
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </Button>
              </div>
              {!ticket.contactEmail ? (
                <p className="mt-1.5 text-[11px] text-slate-400">No email on file for this contact — your reply is saved here but won&apos;t be emailed.</p>
              ) : null}
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export function SupportTicketsView() {
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [openTicketId, setOpenTicketId] = useState(null);

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const res = await listSupportTickets(statusFilter || undefined);
      setTickets(res.tickets || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleUpdated(updatedTicket) {
    setTickets((prev) => prev.map((t) => (t._id === updatedTicket._id ? { ...t, status: updatedTicket.status, replies: updatedTicket.replies } : t)));
  }

  return (
    <div className="mx-auto max-w-[1920px] px-4 py-4 lg:px-8">
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="indigo">Support</Badge>
          <h1 className="mt-3 text-2xl tracking-tight text-slate-950 md:text-[24px]">Support Tickets</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Every ticket customers submit from your public support page — reply here and it emails them automatically if they gave an address.
          </p>
        </div>
        <button onClick={load} disabled={isLoading} className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} /> Refresh
        </button>
      </section>

      <div className="mb-5 flex gap-1 rounded-xl border border-[var(--line)] bg-slate-50/80 p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${statusFilter === tab.key ? "bg-white text-indigo-700 shadow-xs ring-1 ring-[var(--line)]" : "text-slate-500 hover:text-slate-900"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div> : null}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-[var(--muted)]">Loading…</div>
          ) : !tickets.length ? (
            <div className="p-12 text-center">
              <Headset size={36} className="mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-700">No tickets{statusFilter ? ` with status "${STATUS_TABS.find((t) => t.key === statusFilter)?.label}"` : ""}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">They&apos;ll show up here as customers submit them from your public support page.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <button
                  key={t._id}
                  onClick={() => setOpenTicketId(t._id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50/60"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-900">{t.ticketNumber}</span>
                      <Badge tone={STATUS_TONE[t.status] || "slate"}>{STATUS_TABS.find((s) => s.key === t.status)?.label || t.status}</Badge>
                      {t.isGeneralInquiry ? <Badge tone="slate">General</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-600">{t.category}{t.subCategory ? ` — ${t.subCategory}` : ""}</p>
                    <p className="mt-1 truncate text-xs text-slate-400">{t.message}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-slate-400">
                    <p className="flex items-center justify-end gap-1"><MessageSquareText size={11} />{t.replies?.length || 0}</p>
                    <p className="mt-1">{fmtDateTime(t.createdAt)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {openTicketId ? (
        <TicketDrawer ticketId={openTicketId} onClose={() => setOpenTicketId(null)} onUpdated={handleUpdated} />
      ) : null}
    </div>
  );
}
