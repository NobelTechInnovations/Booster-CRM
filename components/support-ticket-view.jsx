"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Headset, Loader2, Mail, MessageSquareText, Phone, Plus, Send } from "lucide-react";
import { getPublicCompanyBranding, listPublicTicketsByContact, getPublicTicketDetail, createSupportTicket } from "@/lib/api";

// Same fixed category set the backend validates against (support-ticket.repo.js's
// CATEGORIES) — sub-categories are display-only, folded into the message
// rather than a separate stored field's own enum, so this list can be
// extended freely without a backend change.
const CATEGORIES = [
  { key: "order_issue", label: "Order Issue", subCategories: ["Wrong item received", "Item missing", "Damaged item", "Order not as described"] },
  { key: "payment_refund", label: "Payment / Refund", subCategories: ["Refund status", "Payment failed", "COD amount issue", "Invoice request"] },
  { key: "shipping", label: "Shipping", subCategories: ["Delivery delayed", "Not delivered yet", "Wrong address", "Tracking not updating"] },
  { key: "product", label: "Product", subCategories: ["Quality issue", "Size / fit issue", "Product question", "Other"] },
  { key: "general", label: "General Inquiry", subCategories: ["Other"] },
];

const STATUS_META = {
  open: { label: "Open", tone: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress", tone: "bg-amber-100 text-amber-800" },
  resolved: { label: "Resolved", tone: "bg-emerald-100 text-emerald-700" },
  closed: { label: "Closed", tone: "bg-slate-100 text-slate-600" },
};

function StatusChip({ status }) {
  const meta = STATUS_META[status] || STATUS_META.open;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${meta.tone}`}>{meta.label}</span>;
}

function fmtDateTime(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

// ─── New ticket form ─────────────────────────────────────────────────────────

function NewTicketForm({ companySlug, phone, email, onCreated, onCancel }) {
  const [categoryKey, setCategoryKey] = useState(CATEGORIES[0].key);
  const [subCategory, setSubCategory] = useState(CATEGORIES[0].subCategories[0]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const category = CATEGORIES.find((c) => c.key === categoryKey);

  function handleCategoryChange(key) {
    setCategoryKey(key);
    setSubCategory(CATEGORIES.find((c) => c.key === key)?.subCategories[0] || "");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) { setError("Please describe your issue"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await createSupportTicket(companySlug, { phone, email, category: categoryKey, subCategory, message: message.trim() });
      onCreated(res.ticket);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">What&apos;s this about?</label>
        <select
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          value={categoryKey}
          onChange={(e) => handleCategoryChange(e.target.value)}
        >
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Specifically</label>
        <select
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          value={subCategory}
          onChange={(e) => setSubCategory(e.target.value)}
        >
          {category.subCategories.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tell us more</label>
        <textarea
          rows={4}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          placeholder="Describe your issue…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}
      <div className="flex gap-2">
        {onCancel ? (
          <button type="button" onClick={onCancel} className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-700 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          Submit Ticket
        </button>
      </div>
    </form>
  );
}

// ─── Ticket detail (read-only history) ──────────────────────────────────────

function TicketDetail({ ticket, onBack }) {
  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:text-indigo-900">
        <ArrowLeft size={15} /> Back
      </button>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-bold text-slate-900">{ticket.ticketNumber}</h2>
          <StatusChip status={ticket.status} />
        </div>
        <p className="mt-1 text-xs text-slate-400">{ticket.subCategory ? `${ticket.subCategory} · ` : ""}{fmtDateTime(ticket.createdAt)}</p>

        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{ticket.message}</div>

        {ticket.replies?.length ? (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase text-slate-500">Replies</h3>
            {ticket.replies.map((r, idx) => (
              <div key={idx} className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-700">{r.authorName}</span>
                  <span className="text-slate-400">{fmtDateTime(r.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-700">{r.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-400">No replies yet — we&apos;ll get back to you soon.</p>
        )}
      </div>
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function SupportTicketView({ companySlug }) {
  const [storeName, setStoreName] = useState("");
  const [storeLogo, setStoreLogo] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [searchedContact, setSearchedContact] = useState(null); // { phone, email }
  const [tickets, setTickets] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [justCreated, setJustCreated] = useState(null);

  useEffect(() => {
    getPublicCompanyBranding(companySlug)
      .then((res) => { setStoreName(res.company?.name || ""); setStoreLogo(res.company?.logoUrl || ""); })
      .catch(() => { });
  }, [companySlug]);

  async function handleCheck(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setTickets(null);
    setJustCreated(null);
    try {
      // No contact given at all — nothing to look up, go straight to a new
      // (general-inquiry) ticket instead of a pointless empty search.
      if (!phone.trim() && !email.trim()) {
        setSearchedContact({ phone: "", email: "" });
        setShowNewForm(true);
        return;
      }
      const res = await listPublicTicketsByContact(companySlug, phone.trim(), email.trim());
      setStoreName(res.company?.name || storeName);
      setStoreLogo(res.company?.logoUrl || storeLogo);
      setTickets(res.tickets || []);
      setSearchedContact({ phone: phone.trim(), email: email.trim() });
      setShowNewForm((res.tickets || []).length === 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function openTicket(ticketId) {
    setDetailLoading(true);
    setError("");
    try {
      const res = await getPublicTicketDetail(companySlug, ticketId, searchedContact.phone, searchedContact.email);
      setSelectedTicket(res.ticket);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleCreated(ticket) {
    setJustCreated(ticket);
    setShowNewForm(false);
    setTickets((prev) => (prev ? [ticket, ...prev] : [ticket]));
  }

  const showResults = searchedContact && !selectedTicket;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="mb-6 text-center">
          {storeLogo ? (
            <img src={storeLogo} alt={storeName} className="mx-auto h-12 w-24 rounded-xl object-contain" />
          ) : (
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-indigo-700 text-white">
              <Headset size={22} />
            </div>
          )}
          <h1 className="mt-3 text-xl font-bold text-slate-900">{storeName || "Support"}</h1>
          <p className="mt-0.5 text-xs font-medium text-slate-400">Powered by Wokbook</p>
          <p className="mt-2 text-sm text-slate-500">Have an issue? We&apos;re here to help.</p>
        </div>

        {!searchedContact && !selectedTicket ? (
          <form onSubmit={handleCheck} className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Enter your phone or email to check an existing ticket, or leave both blank to submit a general inquiry</p>
            <div className="relative">
              <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-700 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:opacity-50">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <MessageSquareText size={15} />}
              Continue
            </button>
          </form>
        ) : null}

        {error ? <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div> : null}

        {detailLoading ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-indigo-600" /></div>
        ) : selectedTicket ? (
          <TicketDetail ticket={selectedTicket} onBack={() => setSelectedTicket(null)} />
        ) : showResults ? (
          <div>
            <button
              onClick={() => { setSearchedContact(null); setTickets(null); setShowNewForm(false); setJustCreated(null); setPhone(""); setEmail(""); }}
              className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
            >
              <ArrowLeft size={15} /> Start over
            </button>

            {justCreated ? (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Ticket {justCreated.ticketNumber} submitted</p>
                  <p className="mt-0.5 text-xs text-emerald-700">We&apos;ll get back to you soon{justCreated.isGeneralInquiry ? "" : " — check back here anytime with your phone or email"}.</p>
                </div>
              </div>
            ) : null}

            {tickets && tickets.length > 0 ? (
              <div className="mb-4 space-y-3">
                {tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTicket(t.id)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900">{t.ticketNumber}</span>
                        <StatusChip status={t.status} />
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{t.subCategory || t.category}</p>
                      <p className="mt-1 text-xs text-slate-400">{fmtDateTime(t.createdAt)}</p>
                    </div>
                    {t.replies?.length ? (
                      <span className="ml-3 shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">{t.replies.length} repl{t.replies.length === 1 ? "y" : "ies"}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : !showNewForm ? (
              <div className="mb-4 rounded-xl border border-slate-200 bg-white p-8 text-center">
                <MessageSquareText size={28} className="mx-auto text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-600">No tickets found</p>
                <p className="mt-1 text-xs text-slate-400">Submit a new one below</p>
              </div>
            ) : null}

            {showNewForm ? (
              <NewTicketForm
                companySlug={companySlug}
                phone={searchedContact.phone}
                email={searchedContact.email}
                onCreated={handleCreated}
                onCancel={tickets && tickets.length > 0 ? () => setShowNewForm(false) : null}
              />
            ) : (
              <button
                onClick={() => setShowNewForm(true)}
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                <Plus size={15} /> Submit a New Ticket
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
