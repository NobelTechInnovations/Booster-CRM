"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  KeyRound,
  Package,
  Percent,
  PlugZap,
  Plus,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
  Users,
  Webhook,
  X,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BillingSettingsTab } from "@/components/billing-settings-tab";
import { StoreMigrationTab } from "@/components/store-migration-tab";
import {
  getCompanyProfile,
  updateTaxSettings,
  updateNotificationSettings,
  changeOwnPassword,
  listWebhookEndpoints,
  createWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  webhookInboundUrl,
} from "@/lib/api";

function SectionCard({ icon: Icon, title, desc, children }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-700">
            <Icon size={17} />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            {desc ? <p className="mt-0.5 text-sm text-[var(--muted)]">{desc}</p> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100";

function Toggle({ checked, onChange, label, desc }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {desc ? <p className="text-xs text-[var(--muted)]">{desc}</p> : null}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "" : "translate-x-0\.5"}`} />
      </button>
    </div>
  );
}

// ─── Webhooks tab ────────────────────────────────────────────────────────────

const WEBHOOK_TYPE_ICON_TONE = {
  payment: "bg-emerald-50 text-emerald-700",
  "cart-recovery": "bg-amber-50 text-amber-700",
  shipping: "bg-blue-50 text-blue-700",
  other: "bg-slate-100 text-slate-600",
};

const WEBHOOK_TYPE_META = {
  payment: { label: "Payment", icon: CreditCard, tone: "green" },
  "cart-recovery": { label: "Cart Recovery", icon: ShoppingCart, tone: "amber" },
  shipping: { label: "Shipping", icon: Truck, tone: "blue" },
  other: { label: "Other", icon: Webhook, tone: "slate" },
};

const PROVIDER_PRESETS = [
  { value: "razorpay", label: "Razorpay", type: "payment" },
  { value: "cashfree", label: "Cashfree", type: "payment" },
  { value: "payu", label: "PayU", type: "payment" },
  { value: "stripe", label: "Stripe", type: "payment" },
  { value: "shiprocket-checkout", label: "Shiprocket Checkout", type: "cart-recovery" },
  { value: "fastrr", label: "Fastrr", type: "cart-recovery" },
  { value: "shiprocket", label: "Shiprocket (Shipping)", type: "shipping" },
  { value: "custom", label: "Custom / Other", type: "other" },
];

function WebhookModal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cn("max-h-[90vh] w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-xl", wide ? "max-w-2xl" : "max-w-md")}
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

function CopyField({ value, mono = true }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex items-center gap-1.5">
      <code className={cn("flex-1 truncate rounded bg-slate-100 px-2 py-1.5 text-[11px]", mono && "font-mono")}>{value}</code>
      <button type="button" onClick={copy} className="shrink-0 rounded-md bg-slate-100 px-2 py-1.5 text-[11px] font-semibold hover:bg-slate-200">
        {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function AddEndpointModal({ onClose, onCreated }) {
  const [provider, setProvider] = useState("razorpay");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null); // holds { endpoint, inboundUrl } after successful create — one-time secret reveal

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const preset = PROVIDER_PRESETS.find((p) => p.value === provider);
    try {
      const result = await createWebhookEndpoint({
        name: name.trim() || preset?.label || provider,
        provider,
        type: preset?.type || "other",
      });
      setCreated(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <WebhookModal title="Webhook endpoint created" onClose={() => { onCreated(); onClose(); }}>
        <div className="space-y-3">
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Copy the secret now — it won&apos;t be shown again. If you lose it, delete this endpoint and create a new one.
          </p>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Webhook URL — paste into {created.endpoint.name}&apos;s dashboard</p>
            <CopyField value={created.inboundUrl} />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Signing secret — paste wherever that dashboard asks for one</p>
            <CopyField value={created.endpoint.secret} />
          </div>
          <Button className="w-full" onClick={() => { onCreated(); onClose(); }}>Done</Button>
        </div>
      </WebhookModal>
    );
  }

  return (
    <WebhookModal title="Add webhook endpoint" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm font-semibold text-slate-700">
          Source
          <select
            className="mt-1 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            {PROVIDER_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Label (optional)
          <input
            className="mt-1 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            placeholder="e.g. Razorpay — main account"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={saving}>{saving ? "Creating…" : "Create Endpoint"}</Button>
      </form>
    </WebhookModal>
  );
}

function EndpointCard({ endpoint, onRefresh }) {
  const meta = WEBHOOK_TYPE_META[endpoint.type] || WEBHOOK_TYPE_META.other;
  const [busy, setBusy] = useState(false);

  async function toggleStatus() {
    setBusy(true);
    try {
      await updateWebhookEndpoint(endpoint._id || endpoint.id, { status: endpoint.status === "active" ? "inactive" : "active" });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove "${endpoint.name}"? Events already received stay in the log, but new calls to its URL will be rejected.`)) return;
    setBusy(true);
    try {
      await deleteWebhookEndpoint(endpoint._id || endpoint.id);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", WEBHOOK_TYPE_ICON_TONE[endpoint.type] || WEBHOOK_TYPE_ICON_TONE.other)}>
            <meta.icon size={16} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{endpoint.name}</p>
            <p className="text-xs text-[var(--muted)]">{endpoint.provider}</p>
          </div>
        </div>
        <Badge tone={endpoint.status === "active" ? "green" : "slate"}>{endpoint.status}</Badge>
      </div>
      <div className="mt-3">
        <CopyField value={webhookInboundUrl(endpoint.token)} />
      </div>
      <div className="mt-2.5 flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{endpoint.eventCount || 0} event{endpoint.eventCount === 1 ? "" : "s"} received</span>
        <span>{endpoint.lastEventAt ? new Date(endpoint.lastEventAt).toLocaleString("en-IN") : "never triggered"}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="h-8 flex-1 text-xs" onClick={toggleStatus} disabled={busy}>
          {endpoint.status === "active" ? "Pause" : "Activate"}
        </Button>
        <button
          className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
          onClick={handleDelete}
          disabled={busy}
          aria-label="Delete endpoint"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

// Endpoint (URL/secret) configuration only — the leads data itself moved out
// to its own sidebar page, see components/leads-view.jsx.
function WebhooksTab() {
  const [endpoints, setEndpoints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  async function refresh() {
    setIsLoading(true);
    try {
      const res = await listWebhookEndpoints();
      setEndpoints(res.endpoints || []);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Webhook Endpoints</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Payment gateways, Shiprocket Checkout/Fastrr abandoned carts, or anything else that can push you a webhook — one URL per source, scoped to this brand only.
              Leads captured from these events live under the Leads sidebar item.
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={16} />
            Add Endpoint
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading && !endpoints.length ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : !endpoints.length ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-soft)] px-4 py-8 text-center">
              <Webhook size={22} className="text-slate-400" />
              <p className="font-semibold text-slate-700">No webhook endpoints yet</p>
              <p className="text-sm text-[var(--muted)]">Add one for Razorpay, Shiprocket Checkout, or any other source.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {endpoints.map((endpoint) => (
                <EndpointCard key={endpoint._id || endpoint.id} endpoint={endpoint} onRefresh={refresh} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showAdd ? <AddEndpointModal onClose={() => setShowAdd(false)} onCreated={refresh} /> : null}
    </div>
  );
}

const SETTINGS_TABS = [
  { key: "general", label: "General", icon: Building2 },
  { key: "billing", label: "Plan & Billing", icon: CreditCard },
  { key: "webhooks", label: "Webhooks", icon: Webhook },
  { key: "migration", label: "Store Migration", icon: Store },
];

export function SettingsView() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") === "billing" ? "billing" : "general");
  const [company, setCompany] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [tax, setTax] = useState({ gstRate: 5, invoicePrefix: "INV", invoiceStartNumber: 1, placeOfSupply: "" });
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxSaved, setTaxSaved] = useState(false);

  const [notif, setNotif] = useState({ lowStockAlerts: true, newOrderAlerts: true, dailySummaryEmail: false, lowStockThreshold: 5 });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getCompanyProfile();
        setCompany(res.company);
        if (res.company?.taxSettings) setTax({ ...tax, ...res.company.taxSettings });
        if (res.company?.notificationSettings) setNotif({ ...notif, ...res.company.notificationSettings });
      } catch (_err) {
        // non-fatal — form still renders with defaults
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveTax(e) {
    e.preventDefault();
    setTaxSaving(true);
    setTaxSaved(false);
    try {
      const res = await updateTaxSettings(tax);
      setTax(res.company.taxSettings);
      setTaxSaved(true);
      setTimeout(() => setTaxSaved(false), 2500);
    } finally {
      setTaxSaving(false);
    }
  }

  async function saveNotif(next) {
    setNotif(next);
    setNotifSaving(true);
    setNotifSaved(false);
    try {
      const res = await updateNotificationSettings(next);
      setNotif(res.company.notificationSettings);
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2000);
    } finally {
      setNotifSaving(false);
    }
  }

  async function submitPasswordChange(e) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError("New password and confirmation don't match");
      return;
    }
    setPwSaving(true);
    try {
      await changeOwnPassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwSuccess("Password updated successfully");
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-4 lg:px-8">
      <section className="mb-6">
        <Badge tone="indigo">Settings</Badge>
        <h1 className="mt-3 text-2xl  tracking-tight text-slate-950 md:text-[24px]">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Tax and invoicing defaults, notification preferences, and account security.
        </p>
      </section>

      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-all",
              activeTab === tab.key
                ? "bg-[var(--primary)] text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "webhooks" ? <WebhooksTab /> : null}
      {activeTab === "billing" ? <BillingSettingsTab /> : null}
      {activeTab === "migration" ? <StoreMigrationTab /> : null}

      {activeTab !== "general" ? null : isLoading ? (
        <div className="rounded-xl border border-[var(--line)] bg-white p-10 text-center text-sm text-[var(--muted)]">Loading settings…</div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {/* Tax & Invoicing */}
            <SectionCard icon={Receipt} title="Tax & Invoicing" desc="Applied to GST reports and generated invoices.">
              <form onSubmit={saveTax} className="grid gap-4 sm:grid-cols-2">
                <Field label="GST Rate (%)">
                  <input type="number" step="0.01" className={inputClass} value={tax.gstRate} onChange={(e) => setTax({ ...tax, gstRate: e.target.value })} />
                </Field>
                <Field label="Place of Supply">
                  <input className={inputClass} placeholder="e.g. Rajasthan" value={tax.placeOfSupply} onChange={(e) => setTax({ ...tax, placeOfSupply: e.target.value })} />
                </Field>
                <Field label="Invoice Prefix">
                  <input className={inputClass} placeholder="INV" value={tax.invoicePrefix} onChange={(e) => setTax({ ...tax, invoicePrefix: e.target.value })} />
                </Field>
                <Field label="Invoice Start Number">
                  <input type="number" className={inputClass} value={tax.invoiceStartNumber} onChange={(e) => setTax({ ...tax, invoiceStartNumber: e.target.value })} />
                </Field>
                <div className="sm:col-span-2 flex items-center gap-3 pt-1">
                  <Button type="submit" disabled={taxSaving}>{taxSaving ? "Saving…" : "Save Tax Settings"}</Button>
                  {taxSaved ? <span className="flex items-center gap-1 text-sm font-semibold text-emerald-700"><Check size={14} />Saved</span> : null}
                </div>
              </form>
            </SectionCard>

            {/* Notifications */}
            <SectionCard icon={Bell} title="Notifications" desc="Choose what triggers an alert.">
              <div className="divide-y divide-slate-100">
                <Toggle
                  label="New order alerts"
                  desc="Notify when a new order comes in"
                  checked={notif.newOrderAlerts}
                  onChange={(v) => saveNotif({ ...notif, newOrderAlerts: v })}
                />
                <Toggle
                  label="Low stock alerts"
                  desc="Notify when a SKU drops below threshold"
                  checked={notif.lowStockAlerts}
                  onChange={(v) => saveNotif({ ...notif, lowStockAlerts: v })}
                />
                <Toggle
                  label="Daily summary email"
                  desc="A daily digest of sales, orders, and stock"
                  checked={notif.dailySummaryEmail}
                  onChange={(v) => saveNotif({ ...notif, dailySummaryEmail: v })}
                />
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
                <Field label="Low stock threshold (units)">
                  <input
                    type="number"
                    className={`${inputClass} w-32`}
                    value={notif.lowStockThreshold}
                    onChange={(e) => setNotif({ ...notif, lowStockThreshold: e.target.value })}
                    onBlur={() => saveNotif(notif)}
                  />
                </Field>
                {notifSaved ? <span className="mt-5 flex items-center gap-1 text-sm font-semibold text-emerald-700"><Check size={14} />Saved</span> : null}
              </div>
            </SectionCard>

            {/* Security */}
            <SectionCard icon={KeyRound} title="Security" desc="Change your account password.">
              <form onSubmit={submitPasswordChange} className="grid gap-4 sm:grid-cols-2">
                <Field label="Current Password">
                  <input type="password" className={inputClass} value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} required />
                </Field>
                <div className="hidden sm:block" />
                <Field label="New Password">
                  <input type="password" className={inputClass} minLength={8} value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} required />
                </Field>
                <Field label="Confirm New Password">
                  <input type="password" className={inputClass} minLength={8} value={pwForm.confirmPassword} onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })} required />
                </Field>
                {pwError ? <p className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{pwError}</p> : null}
                {pwSuccess ? <p className="sm:col-span-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"><ShieldCheck size={14} />{pwSuccess}</p> : null}
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={pwSaving}>{pwSaving ? "Updating…" : "Update Password"}</Button>
                </div>
              </form>
            </SectionCard>
          </div>

          {/* Quick links sidebar */}
          <div className="space-y-5">
            <Card>
              <CardHeader><CardTitle>Quick Links</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {[
                  ["/panel/company", Building2, "Company Profile"],
                  ["/panel/users", Users, "Users & Roles"],
                  ["/panel/channels", PlugZap, "Connected Channels"],
                  ["/panel/inventory", Package, "Inventory & Costing"],
                ].map(([href, Icon, label]) => (
                  <Link key={href} href={href} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700">
                    <Icon size={15} />
                    {label}
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Workspace</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[var(--muted)]">Company</span><span className="font-semibold text-slate-800">{company?.name || "—"}</span></div>
                <div className="flex justify-between"><span className="text-[var(--muted)]">GSTIN</span><span className="font-semibold text-slate-800">{company?.gstin || "Not set"}</span></div>
                <div className="flex justify-between"><span className="text-[var(--muted)]">KYC Status</span><Badge tone={company?.kyc?.status === "verified" ? "green" : "amber"}>{company?.kyc?.status || "not started"}</Badge></div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
