"use client";

import { useState, useEffect } from "react";
import {
  Bell,
  Building2,
  Check,
  KeyRound,
  Package,
  Percent,
  PlugZap,
  Receipt,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCompanyProfile,
  updateTaxSettings,
  updateNotificationSettings,
  changeOwnPassword,
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
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

export function SettingsView() {
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
    <div className="mx-auto max-w-[1200px] px-4 py-6 lg:px-6">
      <section className="mb-6">
        <Badge tone="indigo">Settings</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)] md:text-base">
          Tax and invoicing defaults, notification preferences, and account security.
        </p>
      </section>

      {isLoading ? (
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
