"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AlertCircle,
  Ban,
  Bell,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MessageCircle,
  Package,
  PlayCircle,
  Plus,
  Repeat2,
  RotateCcw,
  Send,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  Wallet,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listAutomationRules,
  createAutomationRule,
  toggleAutomationRule,
  runAutomationRule,
  deleteAutomationRule,
  listAutomationTriggers,
  listChannels,
  connectEmailChannel,
  testEmailChannel,
  listEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  testSendEmailTemplate,
  listEmailLogs,
} from "@/lib/api";

// Built-in triggers with a display label/icon — order_delivered/refund_processed/
// cod_payment_reminder are new, real event wiring (see commerce-backend's
// automation-dispatcher.js and the webhook/fulfillment/cron call sites that
// fire them); the rest existed already. A company can also type its own
// custom trigger name (see the "Custom…" option below) and fire it
// externally via a Webhook Endpoint's automation trigger key (Settings →
// Webhooks) — this list is just what's offered by default, never the only
// valid value (see the backend's own comment on why trigger isn't a hard enum).
const TRIGGERS = [
  { key: "order_placed", label: "Order Placed", icon: ShoppingBag },
  { key: "order_fulfilled", label: "Order Shipped", icon: Truck },
  { key: "order_delivered", label: "Order Delivered", icon: CheckCircle2 },
  { key: "order_cancelled", label: "Order Cancelled", icon: Ban },
  { key: "refund_processed", label: "Refund Processed", icon: RotateCcw },
  { key: "cod_payment_reminder", label: "COD Payment Reminder", icon: Wallet },
  { key: "low_stock", label: "Low Stock", icon: Package },
  { key: "repeat_customer", label: "Repeat Customer", icon: Repeat2 },
  { key: "abandoned_checkout", label: "Abandoned Checkout", icon: AlertCircle },
];

const ACTIONS = [
  { key: "send_whatsapp", label: "Send WhatsApp Message", icon: MessageCircle },
  { key: "send_email", label: "Send Email", icon: Bell },
  { key: "tag_order", label: "Tag Order", icon: Tag },
  { key: "notify_team", label: "Notify Team", icon: Bell },
  { key: "webhook", label: "Call Webhook", icon: Webhook },
];

// Every order-based trigger's template context is built from this exact
// shape (see buildOrderEmailContext in the backend) — shown as a cheat
// sheet next to every subject/body field so a company knows what {{}} to type.
const TEMPLATE_VARIABLES = [
  "customerName", "customerEmail", "orderNumber", "orderTotal", "currency",
  "trackingNumber", "trackingUrl", "courierName", "refundAmount", "companyName",
];

function labelFor(list, key) {
  return list.find((x) => x.key === key)?.label || key;
}
function iconFor(list, key) {
  return list.find((x) => x.key === key)?.icon || Zap;
}

// ─── Email Setup ────────────────────────────────────────────────────────────
// A generic SMTP connect — one form for Gmail (app password), Outlook,
// Zoho, or any other provider a company already has.

const EMPTY_EMAIL_FORM = { host: "", port: "587", secure: false, username: "", password: "", fromEmail: "", fromName: "" };

function EmailSetupSection({ channel, isLoading, onConnected }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_EMAIL_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");

  // "Update" prefills from what's already known and public about this
  // channel (host/port/secure/fromEmail/fromName live in `external`, which
  // a plain channel list always returns; username is mirrored onto
  // `channel.shop` at connect time) — only the password is genuinely
  // secret and can never be prefilled, since the backend never sends it
  // back once set.
  function openForm() {
    if (channel) {
      setForm({
        host: channel.external?.host || "",
        port: String(channel.external?.port || "587"),
        secure: Boolean(channel.external?.secure),
        username: channel.shop || "",
        password: "",
        fromEmail: channel.external?.fromEmail || "",
        fromName: channel.external?.fromName || "",
      });
    } else {
      setForm(EMPTY_EMAIL_FORM);
    }
    setShowPassword(false);
    setConnectError("");
    setShowForm((v) => !v);
  }

  async function handleConnect(e) {
    e.preventDefault();
    setConnecting(true);
    setConnectError("");
    try {
      await connectEmailChannel({ ...form, port: Number(form.port) });
      setShowForm(false);
      onConnected();
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult("");
    try {
      const res = await testEmailChannel();
      setTestResult(res.message);
    } catch (err) {
      setTestResult(err.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <Mail size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Email (SMTP)</h3>
            <p className="text-xs text-[var(--muted)]">
              {isLoading
                ? "Checking connection…"
                : channel
                ? <>Connected as <span className="font-semibold text-slate-700">{channel.shop}</span></>
                : "Connect your own SMTP (Gmail app-password, Outlook, Zoho, or any other provider) to send automated order emails."}
            </p>
          </div>
        </div>
        {/* Nothing rendered while isLoading — showing "Connect" for an
            already-connected channel just because the first fetch hasn't
            resolved yet is worse than a brief blank space. */}
        {!isLoading ? (
          <div className="flex items-center gap-2">
            {channel ? (
              <Button variant="secondary" className="h-9" onClick={handleTest} disabled={testing}>
                {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {testing ? "Sending…" : "Send Test Email"}
              </Button>
            ) : null}
            <Button className="h-9" onClick={openForm}>
              {channel ? "Update" : "Connect"}
            </Button>
          </div>
        ) : null}
      </div>

      {testResult ? (
        <p className={`mb-3 text-xs font-medium ${/failed/i.test(testResult) ? "text-rose-600" : "text-emerald-600"}`}>{testResult}</p>
      ) : null}

      {showForm ? (
        <form onSubmit={handleConnect} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">SMTP Host</span>
            <input required value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} placeholder="smtp.gmail.com" className="h-9 w-full rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-indigo-500" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Port</span>
            <input required type="number" value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} placeholder="587" className="h-9 w-full rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-indigo-500" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Username</span>
            <input required value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="you@yourstore.com" className="h-9 w-full rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-indigo-500" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password / App Password{channel ? " (leave blank to keep the current one)" : ""}</span>
            <div className="relative">
              <input
                required={!channel}
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="h-9 w-full rounded-lg border border-[var(--line)] px-3 pr-9 text-sm outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">From Name (optional)</span>
            <input value={form.fromName} onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))} placeholder="Your Store" className="h-9 w-full rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-indigo-500" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">From Email (optional — defaults to username)</span>
            <input value={form.fromEmail} onChange={(e) => setForm((f) => ({ ...f, fromEmail: e.target.value }))} placeholder="orders@yourstore.com" className="h-9 w-full rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-indigo-500" />
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" checked={form.secure} onChange={(e) => setForm((f) => ({ ...f, secure: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
            <span className="text-sm text-slate-700">Use TLS on connect (port 465) — leave unchecked for STARTTLS (port 587), the usual choice for Gmail</span>
          </label>
          {connectError ? <p className="sm:col-span-2 text-xs font-medium text-rose-600">{connectError}</p> : null}
          <div className="sm:col-span-2 flex items-center gap-2">
            <Button type="submit" disabled={connecting}>{connecting ? "Verifying & connecting…" : "Verify & Connect"}</Button>
            <button type="button" onClick={() => setShowForm(false)} className="h-9 rounded-lg border border-[var(--line)] px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
          <p className="sm:col-span-2 text-[11px] text-slate-400">
            For Gmail: enable 2-Step Verification on the account, then create an App Password at myaccount.google.com/apppasswords — use that here, not the regular account password.
          </p>
        </form>
      ) : null}
    </div>
  );
}

// ─── Email Templates ────────────────────────────────────────────────────────

// ─── Modern preset templates ─────────────────────────────────────────────────
// Real email clients (Gmail, Outlook) strip <style> blocks unreliably, so
// every rule here is inline — a centered card, a solid-color header band,
// a light "details" box for order/tracking data, and a button-style CTA
// where one makes sense. A starting point to customize, not meant to be
// the final word — every field stays fully editable after picking one.

function emailShell({ accent, eyebrow, heading, bodyParagraphs, details, cta }) {
  const detailsRows = details
    ? `<table style="width:100%;border-collapse:collapse;">${details
        .map(([label, value]) => `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">${label}</td><td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;">${value}</td></tr>`)
        .join("")}</table>`
    : "";
  const detailsBox = details ? `<div style="background:#f8fafc;border-radius:12px;padding:18px 20px;margin:22px 0;">${detailsRows}</div>` : "";
  const ctaButton = cta
    ? `<div style="text-align:center;margin:26px 0 8px;"><a href="${cta.href}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:12px 30px;border-radius:8px;font-size:14px;font-weight:600;">${cta.label}</a></div>`
    : "";
  const paragraphs = bodyParagraphs.map((p) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.65;">${p}</p>`).join("");

  return `<div style="background:#f1f5f9;padding:36px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
    <div style="background:${accent};padding:30px 32px;text-align:center;">
      <p style="margin:0;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">{{companyName}}</p>
      <h1 style="margin:10px 0 0;color:#ffffff;font-size:22px;font-weight:700;">${heading}</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;color:#0f172a;font-size:15px;line-height:1.6;">Hi {{customerName}},</p>
      ${paragraphs}
      ${detailsBox}
      ${ctaButton}
    </div>
    <div style="padding:18px 32px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:12px;">{{companyName}} · Powered by Wokbook</p>
    </div>
  </div>
</div>`;
}

const TEMPLATE_PRESETS = [
  {
    key: "order_confirmed", label: "Order Confirmed", trigger: "order_placed", name: "Order Confirmation",
    subject: "Your order {{orderNumber}} is confirmed 🎉",
    bodyHtml: emailShell({
      accent: "#4361ee", heading: "✅ Order Confirmed",
      bodyParagraphs: ["Thanks for your order — we've got it and we're getting it ready.", "We'll email you again the moment it ships."],
      details: [["Order", "{{orderNumber}}"], ["Total", "{{orderTotal}} {{currency}}"]],
    }),
  },
  {
    key: "order_shipped", label: "Order Shipped", trigger: "order_fulfilled", name: "Order Shipped",
    subject: "Your order {{orderNumber}} is on its way 🚚",
    bodyHtml: emailShell({
      accent: "#0ea5e9", heading: "🚚 It's On Its Way",
      bodyParagraphs: ["Good news — your order has shipped and is headed your way."],
      details: [["Order", "{{orderNumber}}"], ["Courier", "{{courierName}}"], ["Tracking No.", "{{trackingNumber}}"]],
      cta: { href: "{{trackingUrl}}", label: "Track Your Order" },
    }),
  },
  {
    key: "order_delivered", label: "Order Delivered", trigger: "order_delivered", name: "Order Delivered",
    subject: "Delivered! Your order {{orderNumber}} has arrived 📦",
    bodyHtml: emailShell({
      accent: "#16a34a", heading: "📦 Delivered!",
      bodyParagraphs: ["Your order has been delivered — we hope you love it!", "If anything's not right, just reply to this email and we'll sort it out."],
      details: [["Order", "{{orderNumber}}"]],
    }),
  },
  {
    key: "refund_processed", label: "Refund Processed", trigger: "refund_processed", name: "Refund Processed",
    subject: "Your refund for order {{orderNumber}} is on its way 💳",
    bodyHtml: emailShell({
      accent: "#f59e0b", heading: "💳 Refund Processed",
      bodyParagraphs: ["We've processed your refund — it should reflect in your original payment method within a few business days."],
      details: [["Order", "{{orderNumber}}"], ["Refund Amount", "{{refundAmount}} {{currency}}"]],
    }),
  },
  {
    key: "cod_reminder", label: "COD Payment Reminder", trigger: "cod_payment_reminder", name: "COD Payment Reminder",
    subject: "Reminder: payment due on delivery for order {{orderNumber}}",
    bodyHtml: emailShell({
      accent: "#e11d48", heading: "⏰ Payment Reminder",
      bodyParagraphs: ["Just a friendly reminder — your order was placed as Cash on Delivery. Please keep the amount ready for the courier."],
      details: [["Order", "{{orderNumber}}"], ["Amount Due", "{{orderTotal}} {{currency}}"]],
    }),
  },
];

function TemplateEditorModal({ template, triggers, onClose, onSaved }) {
  const [name, setName] = useState(template?.name || "");
  const [trigger, setTrigger] = useState(template?.trigger || triggers[0] || "order_placed");
  const [customTrigger, setCustomTrigger] = useState(triggers.includes(template?.trigger) ? "" : (template?.trigger || ""));
  const [useCustomTrigger, setUseCustomTrigger] = useState(Boolean(template) && !triggers.includes(template.trigger));
  const [subject, setSubject] = useState(template?.subject || "");
  const [bodyHtml, setBodyHtml] = useState(template?.bodyHtml || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function applyPreset(presetKey) {
    const preset = TEMPLATE_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    setName(preset.name);
    if (triggers.includes(preset.trigger)) {
      setUseCustomTrigger(false);
      setTrigger(preset.trigger);
    } else {
      setUseCustomTrigger(true);
      setCustomTrigger(preset.trigger);
    }
    setSubject(preset.subject);
    setBodyHtml(preset.bodyHtml);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const finalTrigger = useCustomTrigger ? customTrigger.trim() : trigger;
    if (!name.trim() || !finalTrigger || !subject.trim() || !bodyHtml.trim()) {
      setError("Name, trigger, subject, and body are all required");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const payload = { name: name.trim(), trigger: finalTrigger, subject: subject.trim(), bodyHtml, isActive: true };
      const res = template ? await updateEmailTemplate(template._id, payload) : await createEmailTemplate(payload);
      onSaved(res.template);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{template ? "Edit Email Template" : "New Email Template"}</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {!template ? (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-indigo-700">Start from a modern preset (optional)</span>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.key)}
                    className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Template Name</span>
              <input className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-sm outline-none focus:border-indigo-500" placeholder="e.g. Order Confirmation" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">For Event (Trigger)</span>
              {!useCustomTrigger ? (
                <select className="h-10 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-indigo-500" value={trigger} onChange={(e) => (e.target.value === "__custom__" ? setUseCustomTrigger(true) : setTrigger(e.target.value))}>
                  {triggers.map((t) => <option key={t} value={t}>{labelFor(TRIGGERS, t)}</option>)}
                  <option value="__custom__">Custom…</option>
                </select>
              ) : (
                <div className="flex gap-1.5">
                  <input autoFocus className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-sm outline-none focus:border-indigo-500" placeholder="my_custom_event" value={customTrigger} onChange={(e) => setCustomTrigger(e.target.value)} />
                  <button type="button" onClick={() => setUseCustomTrigger(false)} className="shrink-0 rounded-lg border border-[var(--line)] px-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">Built-in</button>
                </div>
              )}
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Subject</span>
            <input className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-sm outline-none focus:border-indigo-500" placeholder="Your order {{orderNumber}} is confirmed!" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Email Body (HTML)</span>
            <textarea rows={8} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 text-sm font-mono outline-none focus:border-indigo-500" placeholder={`<p>Hi {{customerName}},</p><p>Your order {{orderNumber}} is confirmed — total {{orderTotal}} {{currency}}.</p>`} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} />
          </label>
          <div className="rounded-lg bg-indigo-50/60 px-3 py-2 text-[11px] text-indigo-800">
            <span className="font-semibold">Available variables</span> — not every one applies to every event; a missing one just renders blank:{" "}
            {TEMPLATE_VARIABLES.map((v) => <code key={v} className="ml-1 rounded bg-white/70 px-1 py-0.5">{`{{${v}}}`}</code>)}
          </div>
          {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-[var(--line)] px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Template"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmailTemplatesSection({ templates, triggers, onRefresh, hasEmailChannel }) {
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState(null);
  const [testingId, setTestingId] = useState("");
  const [testResult, setTestResult] = useState({});

  async function handleDelete(template) {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    try {
      await deleteEmailTemplate(template._id);
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleTestSend(template) {
    setTestingId(template._id);
    setTestResult((r) => ({ ...r, [template._id]: "" }));
    try {
      const res = await testSendEmailTemplate(template._id);
      setTestResult((r) => ({ ...r, [template._id]: res.message }));
    } catch (err) {
      setTestResult((r) => ({ ...r, [template._id]: err.message }));
    } finally {
      setTestingId("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Email Templates</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">Write once per event — a rule below just picks which template to send.</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowEditor(true); }}>
          <Plus size={16} />
          New Template
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {!templates.length ? (
          <div className="p-12 text-center">
            <Mail size={36} className="mx-auto mb-3 text-slate-300" />
            <p className="font-semibold text-slate-700">No email templates yet</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Create one for order confirmation, shipping, delivery, refunds, or anything else.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {templates.map((t) => (
              <div key={t._id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">{labelFor(TRIGGERS, t.trigger)}</span>
                      <span className="truncate">{t.subject}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => handleTestSend(t)}
                      disabled={testingId === t._id || !hasEmailChannel}
                      title={hasEmailChannel ? "Send a test with sample data to your own address" : "Connect email first"}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
                    >
                      <Send size={13} />
                      {testingId === t._id ? "Sending…" : "Send Test"}
                    </button>
                    <button onClick={() => { setEditing(t); setShowEditor(true); }} className="h-8 rounded-lg border border-[var(--line)] px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Edit</button>
                    <button onClick={() => handleDelete(t)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                </div>
                {testResult[t._id] ? (
                  <p className={`mt-2 text-xs font-medium ${/failed/i.test(testResult[t._id]) ? "text-rose-600" : "text-emerald-600"}`}>{testResult[t._id]}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {showEditor ? (
        <TemplateEditorModal
          template={editing}
          triggers={triggers}
          onClose={() => setShowEditor(false)}
          onSaved={() => { setShowEditor(false); onRefresh(); }}
        />
      ) : null}
    </Card>
  );
}

// ─── Send Log ───────────────────────────────────────────────────────────────

function SendLogSection({ logs }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Send Log</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!logs.length ? (
          <p className="p-8 text-center text-sm text-[var(--muted)]">Nothing sent yet — it'll show up here once a rule actually fires.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((l) => (
              <div key={l._id} className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{l.subject || "(no subject)"}</p>
                  <p className="text-xs text-slate-400">to {l.to} · {labelFor(TRIGGERS, l.trigger)} · {new Date(l.createdAt).toLocaleString("en-IN")}</p>
                  {l.status === "failed" && l.error ? <p className="mt-0.5 text-xs font-medium text-rose-600">{l.error}</p> : null}
                </div>
                <Badge tone={l.status === "sent" ? "green" : "rose"}>{l.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Create Rule ────────────────────────────────────────────────────────────

function CreateRuleModal({ onClose, onCreated, emailTemplates }) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState(TRIGGERS[0].key);
  const [useCustomTrigger, setUseCustomTrigger] = useState(false);
  const [customTrigger, setCustomTrigger] = useState("");
  const [action, setAction] = useState(ACTIONS[0].key);
  const [message, setMessage] = useState("");
  const [emailTemplateId, setEmailTemplateId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const finalTrigger = useCustomTrigger ? customTrigger.trim() : trigger;
  const matchingTemplates = useMemo(
    () => emailTemplates.filter((t) => t.trigger === finalTrigger && t.isActive),
    [emailTemplates, finalTrigger],
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError("Rule name is required"); return; }
    if (!finalTrigger) { setError("A trigger is required"); return; }
    if (action === "send_email" && !emailTemplateId) { setError("Pick which email template this rule sends"); return; }
    setError("");
    setSaving(true);
    try {
      const config = action === "send_email" ? { emailTemplateId } : { message: message.trim() };
      const res = await createAutomationRule({ name: name.trim(), trigger: finalTrigger, action, config, isActive: true });
      onCreated(res.rule);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-4">
          <h2 className="text-lg  text-slate-900">New Automation Rule</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Rule Name</label>
            <input
              className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="e.g. Email confirmation on order"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">When (Trigger)</label>
              {!useCustomTrigger ? (
                <select
                  className="h-10 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-indigo-500"
                  value={trigger}
                  onChange={(e) => (e.target.value === "__custom__" ? setUseCustomTrigger(true) : setTrigger(e.target.value))}
                >
                  {TRIGGERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  <option value="__custom__">Custom…</option>
                </select>
              ) : (
                <div className="flex gap-1.5">
                  <input autoFocus className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-sm outline-none focus:border-indigo-500" placeholder="my_custom_event" value={customTrigger} onChange={(e) => setCustomTrigger(e.target.value)} />
                  <button type="button" onClick={() => setUseCustomTrigger(false)} className="shrink-0 rounded-lg border border-[var(--line)] px-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">Built-in</button>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Then (Action)</label>
              <select
                className="h-10 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-indigo-500"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                {ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </div>
          </div>
          {action === "send_email" ? (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Email Template</label>
              {matchingTemplates.length ? (
                <select className="h-10 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-indigo-500" value={emailTemplateId} onChange={(e) => setEmailTemplateId(e.target.value)}>
                  <option value="">Select a template…</option>
                  {matchingTemplates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              ) : (
                <p className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 text-xs text-slate-500">
                  No active template for this trigger yet — create one in Email Templates above first.
                </p>
              )}
            </div>
          ) : action === "send_whatsapp" ? (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Message Template</label>
              <textarea
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                rows={3}
                placeholder="Hi {{customer_name}}, your order {{order_number}} has been confirmed!"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          ) : null}
          {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-[var(--line)] px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create Rule"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const TABS = [
  { key: "rules", label: "Rules" },
  { key: "templates", label: "Email Templates" },
  { key: "logs", label: "Send Log" },
];

export function AutomationView() {
  const [rules, setRules] = useState([]);
  const [emailChannel, setEmailChannel] = useState(null);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [triggers, setTriggers] = useState(TRIGGERS.map((t) => t.key));
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [runningId, setRunningId] = useState("");
  const [activeTab, setActiveTab] = useState("rules");

  async function loadAll() {
    setIsLoading(true);
    setError("");
    try {
      const [rulesRes, channelsRes, templatesRes, triggersRes, logsRes] = await Promise.all([
        listAutomationRules(),
        listChannels(),
        listEmailTemplates(),
        listAutomationTriggers(),
        listEmailLogs(),
      ]);
      setRules(rulesRes.rules || []);
      setEmailChannel((channelsRes.channels || []).find((c) => c.channelType === "email" && c.status === "connected") || null);
      setEmailTemplates(templatesRes.templates || []);
      setTriggers(triggersRes.triggers || TRIGGERS.map((t) => t.key));
      setLogs(logsRes.logs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleToggle(rule) {
    const next = !rule.isActive;
    setRules((prev) => prev.map((r) => (r._id === rule._id ? { ...r, isActive: next } : r)));
    try {
      await toggleAutomationRule(rule._id, next);
    } catch (err) {
      setRules((prev) => prev.map((r) => (r._id === rule._id ? { ...r, isActive: rule.isActive } : r)));
      setError(err.message);
    }
  }

  async function handleRun(rule) {
    setRunningId(rule._id);
    try {
      const res = await runAutomationRule(rule._id);
      setRules((prev) => prev.map((r) => (r._id === rule._id ? res.rule : r)));
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningId("");
    }
  }

  async function handleDelete(rule) {
    if (!confirm(`Delete automation rule "${rule.name}"?`)) return;
    setRules((prev) => prev.filter((r) => r._id !== rule._id));
    try {
      await deleteAutomationRule(rule._id);
    } catch (err) {
      setError(err.message);
      loadAll();
    }
  }

  const activeCount = rules.filter((r) => r.isActive).length;
  const totalRuns = rules.reduce((sum, r) => sum + (r.runCount || 0), 0);

  return (
    <div className="mx-auto max-w-[1920px] px-4 py-4 lg:px-8">
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="indigo">Automation</Badge>
          <h1 className="mt-3 text-2xl  tracking-tight text-slate-950 md:text-[24px]">Automation & Email</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Connect your own email, write templates, and trigger them automatically on real order events — confirmed, shipped, delivered, refunded, a COD reminder, or your own custom event.
          </p>
        </div>
        {activeTab === "rules" ? (
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            New Rule
          </Button>
        ) : null}
      </section>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>
      ) : null}

      <EmailSetupSection channel={emailChannel} isLoading={isLoading} onConnected={loadAll} />

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Active Rules</p>
          <p className="mt-2 text-2xl ">{activeCount} / {rules.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Total Runs</p>
          <p className="mt-2 text-2xl ">{totalRuns.toLocaleString("en-IN")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Email Templates</p>
          <p className="mt-2 text-2xl ">{emailTemplates.length}</p>
        </Card>
      </section>

      <div className="mb-5 flex gap-1 rounded-xl border border-[var(--line)] bg-slate-50/80 p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === tab.key ? "bg-white text-indigo-700 shadow-xs ring-1 ring-[var(--line)]" : "text-slate-500 hover:text-slate-900"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-sm text-[var(--muted)]">Loading…</div>
      ) : activeTab === "templates" ? (
        <EmailTemplatesSection templates={emailTemplates} triggers={triggers} onRefresh={loadAll} hasEmailChannel={Boolean(emailChannel)} />
      ) : activeTab === "logs" ? (
        <SendLogSection logs={logs} />
      ) : (
        <Card>
          <CardContent className="p-0">
            {rules.length === 0 ? (
              <div className="p-12 text-center">
                <Zap size={36} className="mx-auto mb-3 text-slate-300" />
                <p className="font-semibold text-slate-700">No automation rules yet</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Create your first rule to automate order journeys.</p>
                <Button className="mt-4" onClick={() => setShowCreate(true)}><Plus size={15} />New Rule</Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {rules.map((rule) => {
                  const TriggerIcon = iconFor(TRIGGERS, rule.trigger);
                  const ActionIcon = iconFor(ACTIONS, rule.action);
                  return (
                    <div key={rule._id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={() => handleToggle(rule)}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition ${rule.isActive ? "bg-emerald-500" : "bg-slate-300"}`}
                          aria-label="Toggle rule"
                        >
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${rule.isActive ? "translate-x-5" : "translate-x-0.5"}`} />
                        </button>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{rule.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                              <TriggerIcon size={11} />{labelFor(TRIGGERS, rule.trigger)}
                            </span>
                            <span>→</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                              <ActionIcon size={11} />{labelFor(ACTIONS, rule.action)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right text-xs text-slate-400">
                          <p>{rule.runCount || 0} runs</p>
                          <p>{rule.lastRunAt ? new Date(rule.lastRunAt).toLocaleDateString("en-IN") : "Never run"}</p>
                        </div>
                        <button
                          onClick={() => handleRun(rule)}
                          disabled={runningId === rule._id}
                          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
                        >
                          <PlayCircle size={13} />
                          {runningId === rule._id ? "Running…" : "Test Run"}
                        </button>
                        <button onClick={() => handleDelete(rule)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showCreate ? (
        <CreateRuleModal
          onClose={() => setShowCreate(false)}
          onCreated={(rule) => { setRules((prev) => [rule, ...prev]); setShowCreate(false); }}
          emailTemplates={emailTemplates}
        />
      ) : null}
    </div>
  );
}
