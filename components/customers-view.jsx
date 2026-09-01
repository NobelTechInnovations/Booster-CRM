"use client";

import { useState, useEffect, useMemo } from "react";
import {
  UserRound,
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  ChevronDown,
  ShoppingCart,
  PhoneCall,
  MessageCircle,
  UserPlus,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/skeleton";
import { cn, formatMoney } from "@/lib/utils";
import { listSyncedRecords, createCustomer, listWebhookLeads } from "@/lib/api";
import { CreateOrderModal } from "@/components/create-order-modal";
import { CustomerFollowUpModal } from "@/components/customer-followup-modal";
import { SendWhatsAppModal } from "@/components/send-whatsapp-modal";

const inputClass = "h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      {children}
    </label>
  );
}

// ─── New Customer modal — field-for-field match to Shopify's own "New
// customer" form, since the whole point is this customer is real in Shopify,
// not a local-only stub. ────────────────────────────────────────────────────
function NewCustomerModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [acceptsMarketing, setAcceptsMarketing] = useState(false);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [showAddress, setShowAddress] = useState(false);
  const [address, setAddress] = useState({ address1: "", address2: "", city: "", province: "", zip: "", country: "India" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!form.email.trim() && !form.phone.trim()) {
      setError("Enter an email or phone number");
      return;
    }
    setSaving(true);
    try {
      const result = await createCustomer({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        note: note.trim(),
        tags: tags.trim(),
        acceptsMarketing,
        address: showAddress ? address : undefined,
      });
      onCreated(result.customer);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">New customer</h2>
            <p className="text-xs text-slate-500">Created directly in Shopify — same as adding one there.</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <input className={inputClass} value={form.firstName} onChange={(e) => setField("firstName", e.target.value)} />
            </Field>
            <Field label="Last name">
              <input className={inputClass} value={form.lastName} onChange={(e) => setField("lastName", e.target.value)} />
            </Field>
          </div>

          <Field label="Email">
            <input type="email" className={inputClass} value={form.email} onChange={(e) => setField("email", e.target.value)} />
          </Field>

          <Field label="Phone number">
            <input className={inputClass} placeholder="+91XXXXXXXXXX" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
          </Field>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={acceptsMarketing} onChange={(e) => setAcceptsMarketing(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Customer agreed to receive marketing emails.
          </label>
          <p className="-mt-2 text-[11px] leading-4 text-slate-400">You should ask customers for permission before subscribing them to marketing.</p>

          <button type="button" onClick={() => setShowAddress((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline">
            <MapPin size={13} />
            {showAddress ? "Hide address" : "Add address"}
            <ChevronDown size={12} className={cn("transition-transform", showAddress && "rotate-180")} />
          </button>
          {showAddress ? (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
              <div className="col-span-2">
                <Field label="Address"><input className={inputClass} value={address.address1} onChange={(e) => setAddress((a) => ({ ...a, address1: e.target.value }))} /></Field>
              </div>
              <div className="col-span-2">
                <Field label="Apartment, suite, etc. (optional)"><input className={inputClass} value={address.address2} onChange={(e) => setAddress((a) => ({ ...a, address2: e.target.value }))} /></Field>
              </div>
              <Field label="City"><input className={inputClass} value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} /></Field>
              <Field label="State"><input className={inputClass} value={address.province} onChange={(e) => setAddress((a) => ({ ...a, province: e.target.value }))} /></Field>
              <Field label="PIN code"><input className={inputClass} value={address.zip} onChange={(e) => setAddress((a) => ({ ...a, zip: e.target.value }))} /></Field>
              <Field label="Country"><input className={inputClass} value={address.country} onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))} /></Field>
            </div>
          ) : null}

          <Field label="Notes">
            <textarea rows={2} className={cn(inputClass, "h-auto py-2")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Private — not shared with the customer" />
          </Field>
          <Field label="Tags">
            <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated, tags" />
          </Field>

          {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={saving}>{saving ? "Creating in Shopify…" : "Create customer"}</Button>
        </form>
      </div>
    </div>
  );
}

// ─── Main Customers view ─────────────────────────────────────────────────────

export function CustomersView() {
  const [customers, setCustomers] = useState([]);
  // phone -> lead, so the follow-up status/note can show inline, not just a
  // bare "Lead" badge with no indication of where that lead actually stands.
  const [leadByPhone, setLeadByPhone] = useState(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [orderTarget, setOrderTarget] = useState(null);
  const [followUpTarget, setFollowUpTarget] = useState(null);
  const [whatsappTarget, setWhatsappTarget] = useState(null);
  const [sortBy, setSortBy] = useState("latest");
  const [savingLeadPhone, setSavingLeadPhone] = useState("");
  const [leadSaveError, setLeadSaveError] = useState("");

  async function loadCustomers() {
    setIsLoading(true);
    setError("");
    try {
      const [custRes, leadsRes] = await Promise.all([
        listSyncedRecords("customers"),
        listWebhookLeads({ limit: 2000 }).catch(() => ({ leads: [] })),
      ]);
      setCustomers(custRes.records || []);
      // Keep only the most recently-updated lead per phone if duplicates
      // exist, so the badge reflects current status, not a stale earlier one.
      const byPhone = new Map();
      for (const lead of leadsRes.leads || []) {
        if (!lead.customerPhone) continue;
        const existing = byPhone.get(lead.customerPhone);
        if (!existing || new Date(lead.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
          byPhone.set(lead.customerPhone, lead);
        }
      }
      setLeadByPhone(byPhone);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadCustomers(); }, []);

  const filtered = useMemo(() => {
    let list = customers;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q),
      );
    }
    const nameOf = (c) => (c.name || [c.firstName, c.lastName].filter(Boolean).join(" ") || "").toLowerCase();
    // shopifyCreatedAt = actual customer signup date on Shopify; fall back to
    // our own createdAt for locally-created customers before the sync-back lands.
    const dateOf = (c) => new Date(c.shopifyCreatedAt || c.createdAt || 0).getTime();
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case "az": return nameOf(a).localeCompare(nameOf(b));
        case "za": return nameOf(b).localeCompare(nameOf(a));
        case "oldest": return dateOf(a) - dateOf(b);
        case "latest":
        default: return dateOf(b) - dateOf(a);
      }
    });
    return sorted;
  }, [customers, search, sortBy]);

  // Leads that never made it into Shopify as a real customer — a phone-based
  // webhook lead (abandoned cart, form fill, etc.) with no matching
  // SyncedCustomer record. Shown separately since they don't have orders/
  // spend/a Shopify id the rest of this page's actions assume.
  const pureLeads = useMemo(() => {
    const customerPhones = new Set(customers.map((c) => c.phone).filter(Boolean));
    return [...leadByPhone.values()]
      .filter((l) => l.customerPhone && !customerPhones.has(l.customerPhone))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }, [leadByPhone, customers]);

  async function saveLeadAsCustomer(lead) {
    setSavingLeadPhone(lead.customerPhone);
    setLeadSaveError("");
    try {
      const [firstName, ...rest] = (lead.customerName || "").trim().split(/\s+/);
      await createCustomer({
        firstName: firstName || "",
        lastName: rest.join(" "),
        email: lead.customerEmail || "",
        phone: lead.customerPhone,
        note: lead.productInterest ? `From ${lead.provider} lead: interested in ${lead.productInterest}` : `From ${lead.provider} lead`,
      });
      await loadCustomers();
    } catch (err) {
      setLeadSaveError(err.message);
    } finally {
      setSavingLeadPhone("");
    }
  }

  return (
    <div className="mx-auto  px-4 py-4 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Badge tone="indigo">CRM</Badge>
          <h1 className="mt-2 text-2xl  tracking-tight text-slate-950 md:text-[24px]">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">{customers.length} synced from Shopify — create new ones here too.</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} />
          New Customer
        </Button>
      </div>

      <Card className="mb-5">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, phone..."
                className="h-9 w-full rounded-lg border border-[var(--line)] bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 rounded-lg border border-[var(--line)] bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="latest">Latest first</option>
              <option value="oldest">Oldest first</option>
              <option value="az">Name A → Z</option>
              <option value="za">Name Z → A</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}

      <Card>
        <CardContent className={isLoading ? "p-4" : "overflow-x-auto p-0"}>
          {isLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : !filtered.length ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <UserRound size={22} className="text-slate-400" />
              <p className="font-semibold text-slate-700">No customers found</p>
              <p className="text-sm text-slate-500">Create one, or sync Shopify to pull in existing customers.</p>
            </div>
          ) : (
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Orders</th>
                  <th className="px-4 py-3 font-semibold">Total Spent</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c._id || c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{c.name || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed"}</p>
                        {c.phone && leadByPhone.has(c.phone) ? (
                          <span
                            className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px]  uppercase tracking-wide text-indigo-700"
                            title={`Lead follow-up: ${(leadByPhone.get(c.phone).followUpStatus || "new").replace(/_/g, " ")}${leadByPhone.get(c.phone).followUps?.[0]?.note ? ` — "${leadByPhone.get(c.phone).followUps[0].note}"` : ""}`}
                          >
                            Lead · {(leadByPhone.get(c.phone).followUpStatus || "new").replace(/_/g, " ")}
                          </span>
                        ) : null}
                      </div>
                      {c.tags?.length ? <p className="mt-0.5 flex flex-wrap gap-1">{c.tags.slice(0, 3).map((t) => <span key={t} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{t}</span>)}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {c.email ? <p className="flex items-center gap-1"><Mail size={11} />{c.email}</p> : null}
                      {c.phone ? <p className="flex items-center gap-1 mt-0.5"><Phone size={11} />{c.phone}</p> : null}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{c.ordersCount || 0}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{formatMoney(c.totalSpent)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={c.followUpStatus === "converted" ? "green" : c.followUpStatus === "follow_up_scheduled" ? "amber" : "slate"}>
                        {(c.followUpStatus || "new").replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setFollowUpTarget(c)} className="rounded-md p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700" title="Log follow-up">
                          <PhoneCall size={15} />
                        </button>
                        {c.phone ? (
                          <button onClick={() => setWhatsappTarget(c)} className="rounded-md p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" title="Send WhatsApp">
                            <MessageCircle size={15} />
                          </button>
                        ) : null}
                        <button onClick={() => setOrderTarget(c)} className="rounded-md p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" title="Create order">
                          <ShoppingCart size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {pureLeads.length ? (
        <Card className="mt-5">
          <CardHeader>
            <div>
              <CardTitle>Leads not yet customers</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Came in from a webhook (abandoned cart, form, etc.) with a phone number but no matching Shopify customer yet.
              </p>
            </div>
          </CardHeader>
          <CardContent className={leadSaveError ? "space-y-3 p-0" : "p-0"}>
            {leadSaveError ? <p className="px-4 pt-3 text-sm font-medium text-rose-700">{leadSaveError}</p> : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-xs uppercase text-slate-500">
                    <th className="px-4 py-3 font-semibold">Lead</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Source</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pureLeads.map((lead) => (
                    <tr key={lead._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{lead.customerName || "Unnamed lead"}</p>
                        {lead.productInterest ? <p className="mt-0.5 text-xs text-slate-500">{lead.productInterest}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p className="flex items-center gap-1"><Phone size={11} />{lead.customerPhone}</p>
                        {lead.customerEmail ? <p className="mt-0.5 flex items-center gap-1"><Mail size={11} />{lead.customerEmail}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-600">{lead.provider}</td>
                      <td className="px-4 py-3">
                        <Badge tone={lead.followUpStatus === "converted" ? "green" : lead.followUpStatus === "follow_up_scheduled" ? "amber" : "slate"}>
                          {(lead.followUpStatus || "new").replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setWhatsappTarget({ phone: lead.customerPhone, name: lead.customerName })} className="rounded-md p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" title="Send WhatsApp">
                            <MessageCircle size={15} />
                          </button>
                          <button
                            onClick={() => saveLeadAsCustomer(lead)}
                            disabled={savingLeadPhone === lead.customerPhone}
                            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                            title="Save as customer"
                          >
                            <UserPlus size={14} />
                            {savingLeadPhone === lead.customerPhone ? "Saving…" : "Save as customer"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showNew ? (
        <NewCustomerModal
          onClose={() => setShowNew(false)}
          onCreated={() => loadCustomers()}
        />
      ) : null}

      {orderTarget ? (
        <CreateOrderModal
          customer={orderTarget}
          onClose={() => setOrderTarget(null)}
          onOrderCreated={() => { setOrderTarget(null); loadCustomers(); }}
        />
      ) : null}

      {followUpTarget ? (
        <CustomerFollowUpModal
          customer={followUpTarget}
          onClose={() => setFollowUpTarget(null)}
          onUpdate={() => loadCustomers()}
          onCreateOrder={(customer) => { setFollowUpTarget(null); setOrderTarget(customer); }}
        />
      ) : null}

      {whatsappTarget ? (
        <SendWhatsAppModal
          phone={whatsappTarget.phone}
          name={whatsappTarget.name || [whatsappTarget.firstName, whatsappTarget.lastName].filter(Boolean).join(" ")}
          onClose={() => setWhatsappTarget(null)}
        />
      ) : null}
    </div>
  );
}
