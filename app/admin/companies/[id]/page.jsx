"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, Clock, Save, Wallet } from "lucide-react";
import {
  getAdminCompany,
  updateCompanyStatus,
  updateCompanySubscription,
  updateCompanyWallet,
  listPlans,
} from "@/lib/admin-api";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-white outline-none focus:border-amber-500";

function daysLeft(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function AdminCompanyDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  const [form, setForm] = useState({ planId: "", status: "trialing", trialEndsAt: "", notes: "" });
  const [walletForm, setWalletForm] = useState({ amount: "", note: "" });
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletError, setWalletError] = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const [companyRes, plansRes] = await Promise.all([getAdminCompany(id), listPlans()]);
      setData(companyRes);
      setPlans(plansRes.plans || []);
      const sub = companyRes.company.subscription || {};
      setForm({
        planId: sub.planId || "",
        status: sub.status || "trialing",
        trialEndsAt: sub.trialEndsAt ? String(sub.trialEndsAt).slice(0, 10) : "",
        notes: sub.notes || "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const selectedPlan = useMemo(() => plans.find((p) => p._id === form.planId), [plans, form.planId]);

  async function saveSubscription() {
    setSaving(true);
    setError("");
    try {
      const res = await updateCompanySubscription(id, {
        planId: form.planId || undefined,
        status: form.status,
        // Omitted (not sent as null) when left blank so the backend can
        // auto-compute it from the plan's own trialDays — see
        // updateCompanySubscription's own comment in platform-admin.repo.js.
        trialEndsAt: form.trialEndsAt ? form.trialEndsAt : undefined,
        notes: form.notes,
      });
      setData((d) => ({ ...d, company: res.company }));
      setForm((f) => ({ ...f, trialEndsAt: res.company.subscription?.trialEndsAt ? String(res.company.subscription.trialEndsAt).slice(0, 10) : "" }));
      setSavedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleCompanyStatus() {
    if (!data) return;
    const next = data.company.status === "active" ? "disabled" : "active";
    setSaving(true);
    setError("");
    try {
      const res = await updateCompanyStatus(id, next);
      setData((d) => ({ ...d, company: res.company }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitWallet(type) {
    const amount = Number(walletForm.amount);
    if (!amount) return;
    setWalletSaving(true);
    setWalletError("");
    try {
      const res = await updateCompanyWallet(id, { amount: type === "debit" ? -Math.abs(amount) : Math.abs(amount), note: walletForm.note, type });
      const fresh = await getAdminCompany(id);
      setData(fresh);
      setWalletForm({ amount: "", note: "" });
    } catch (err) {
      setWalletError(err.message);
    } finally {
      setWalletSaving(false);
    }
  }

  if (isLoading) return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;
  if (!data) return <div className="p-8 text-center text-sm text-rose-300">{error || "Company not found"}</div>;

  const { company, users, orderCount, walletTransactions = [] } = data;
  const sub = company.subscription;
  // planId, not just sub's presence — see feature-gate.js's own comment on
  // why (Mongoose auto-defaults the nested subscription object on new
  // companies even when no admin ever assigned a real plan).
  const hasPlan = Boolean(sub?.planId);
  const trialDaysLeft = hasPlan && sub?.status === "trialing" ? daysLeft(sub.trialEndsAt) : null;

  return (
    <div>
      <button onClick={() => router.push("/admin")} className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft size={14} /> Back to companies
      </button>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">{company.name}</h1>
          <p className="mt-1 text-sm text-slate-400">{company.email || "—"} · {orderCount} orders · {users.length} users</p>
        </div>
        <button
          onClick={toggleCompanyStatus}
          disabled={saving}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
            company.status === "active"
              ? "border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
              : "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
          }`}
        >
          {company.status === "active" ? <><Ban size={13} /> Suspend company</> : <><CheckCircle2 size={13} /> Reactivate company</>}
        </button>
      </div>

      {/* Trial / subscription status, front and center — the whole point of this page. */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900 px-5 py-4">
        {!hasPlan ? (
          <span className="text-sm font-semibold text-slate-300">No plan assigned — full access, unmetered</span>
        ) : sub.status === "trialing" ? (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-400">
            <Clock size={14} />
            {trialDaysLeft === null ? "On trial" : trialDaysLeft < 0 ? "Trial expired" : `Trial — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`}
          </span>
        ) : (
          <span className="text-sm font-semibold text-emerald-400">Subscribed — {sub.status}</span>
        )}
        {sub?.planSlug ? <span className="text-sm text-slate-400">Plan: <span className="font-semibold text-white">{sub.planSlug}</span></span> : null}
        <span className="ml-auto flex items-center gap-1.5 text-sm text-slate-400">
          <Wallet size={14} />
          Wallet: <span className="font-semibold text-white">₹{company.wallet?.balance ?? 0}</span>
        </span>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Subscription</h2>
          <div className="space-y-3">
            <Field label="Plan">
              <select value={form.planId} onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value }))} className={inputClass}>
                <option value="">No plan (full access, unmetered)</option>
                {plans.map((p) => (
                  <option key={p._id} value={p._id}>{p.name} — {p.currency} {p.priceMonthly}/mo{p.isTrial ? ` (${p.trialDays}-day trial)` : ""}</option>
                ))}
              </select>
              {selectedPlan ? (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {selectedPlan.features?.length ? `Features: ${selectedPlan.features.join(", ")}` : "No feature keys set"}
                  {selectedPlan.perOrderFulfillmentFee > 0 ? ` · +₹${selectedPlan.perOrderFulfillmentFee} per order fulfilled` : ""}
                </p>
              ) : null}
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inputClass}>
                {["trialing", "active", "past_due", "suspended", "cancelled"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Trial ends (leave blank to auto-compute from the plan's trial length)">
              <input type="date" value={form.trialEndsAt} onChange={(e) => setForm((f) => ({ ...f, trialEndsAt: e.target.value }))} className={inputClass} />
            </Field>
            <Field label="Internal notes">
              <textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={`${inputClass} h-auto resize-none py-2`} placeholder="Billing notes — never shown to the company" />
            </Field>
            <button
              onClick={saveSubscription}
              disabled={saving}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              <Save size={14} /> {saving ? "Saving…" : "Save subscription"}
            </button>
            {savedAt ? <p className="text-center text-[11px] text-emerald-400">Saved</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Company profile</h2>
          <dl className="space-y-2.5 text-sm">
            <Row label="Legal name" value={company.legalName} />
            <Row label="GSTIN" value={company.gstin} />
            <Row label="Phone" value={company.phone} />
            <Row label="Business type" value={company.businessType} />
            <Row label="KYC status" value={company.kyc?.status} />
          </dl>

          <h2 className="mb-3 mt-6 text-sm font-semibold text-white">Users ({users.length})</h2>
          <div className="space-y-1.5">
            {users.map((u) => (
              <div key={u._id} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-xs">
                <span className="font-medium text-slate-200">{u.name}</span>
                <span className="text-slate-400">{u.role}</span>
              </div>
            ))}
            {users.length === 0 ? <p className="text-xs text-slate-500">No users</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Wallet</h2>
            <span className="text-lg font-bold text-white">₹{company.wallet?.balance ?? 0}</span>
          </div>
          <p className="mb-3 text-[11px] text-slate-500">
            Manual balance — there's no payment gateway wired up yet, so this is an admin-operated ledger: top it up after
            collecting payment offline (bank transfer, UPI, etc.), or debit it for usage charges like a plan's per-order fee.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Amount (₹)</span>
              <input type="number" value={walletForm.amount} onChange={(e) => setWalletForm((f) => ({ ...f, amount: e.target.value }))} className={`${inputClass} w-32`} placeholder="0" />
            </label>
            <label className="block flex-1">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Note</span>
              <input value={walletForm.note} onChange={(e) => setWalletForm((f) => ({ ...f, note: e.target.value }))} className={inputClass} placeholder="e.g. UPI top-up 2 Sept" />
            </label>
            <button
              onClick={() => submitWallet("topup")}
              disabled={walletSaving || !walletForm.amount}
              className="h-9 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              Add funds
            </button>
            <button
              onClick={() => submitWallet("debit")}
              disabled={walletSaving || !walletForm.amount}
              className="h-9 rounded-lg border border-rose-500/30 px-4 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
            >
              Deduct
            </button>
          </div>
          {walletError ? <p className="mt-2 text-xs font-medium text-rose-400">{walletError}</p> : null}

          {walletTransactions.length > 0 ? (
            <div className="mt-4 space-y-1.5">
              {walletTransactions.map((t) => (
                <div key={t._id} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-xs">
                  <span className="text-slate-300">{t.note || t.type}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-slate-500">{new Date(t.createdAt).toLocaleDateString("en-IN")}</span>
                    <span className={t.amount > 0 ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>
                      {t.amount > 0 ? "+" : ""}₹{t.amount}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500">No wallet activity yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b border-slate-800/60 pb-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200">{value || "—"}</dd>
    </div>
  );
}
