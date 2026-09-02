"use client";

import { useEffect, useState } from "react";
import { Plus, Save, X } from "lucide-react";
import { listPlans, createPlan, updatePlan } from "@/lib/admin-api";

const inputClass = "h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-white outline-none focus:border-amber-500";
const EMPTY_FORM = { name: "", priceMonthly: "", priceYearly: "", features: [], isActive: true, isTrial: false, trialDays: "", perOrderFulfillmentFee: "" };

// The feature keys real routes actually check (requireFeature() in
// commerce-backend) — whatsapp (Cloud API) isn't gated by any route yet
// (real pre-existing usage — see feature-gate.js's own note), but is
// offered here too so a plan can still declare it for the company-facing
// plan comparison / future gating.
const FEATURE_KEYS = [
  { key: "whatsapp", label: "WhatsApp (Cloud API)" },
  { key: "smart_whatsapp", label: "Smart WhatsApp" },
  { key: "social", label: "Social (Instagram/Facebook)" },
  { key: "automation", label: "Automation" },
  { key: "advanced_reports", label: "Advanced Reports" },
];

export default function AdminPlansPage() {
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const res = await listPlans();
      setPlans(res.plans || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function startEdit(plan) {
    setEditingId(plan._id);
    setShowNew(false);
    setForm({
      name: plan.name,
      priceMonthly: String(plan.priceMonthly ?? ""),
      priceYearly: String(plan.priceYearly ?? ""),
      features: plan.features || [],
      isActive: plan.isActive,
      isTrial: Boolean(plan.isTrial),
      trialDays: String(plan.trialDays ?? ""),
      perOrderFulfillmentFee: String(plan.perOrderFulfillmentFee ?? ""),
    });
  }

  function startNew() {
    setEditingId(null);
    setShowNew(true);
    setForm(EMPTY_FORM);
  }

  function cancel() {
    setEditingId(null);
    setShowNew(false);
    setForm(EMPTY_FORM);
  }

  async function save() {
    setSaving(true);
    setError("");
    const payload = {
      name: form.name,
      priceMonthly: Number(form.priceMonthly) || 0,
      priceYearly: Number(form.priceYearly) || 0,
      features: form.features,
      isActive: form.isActive,
      isTrial: form.isTrial,
      trialDays: Number(form.trialDays) || 0,
      perOrderFulfillmentFee: Number(form.perOrderFulfillmentFee) || 0,
    };
    try {
      if (editingId) {
        await updatePlan(editingId, payload);
      } else {
        await createPlan(payload);
      }
      await load();
      cancel();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const isEditingForm = editingId || showNew;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Plans</h1>
          <p className="mt-1 text-sm text-slate-400">Define the subscription tiers companies can be assigned to.</p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
        >
          <Plus size={13} /> New plan
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300">{error}</div>
      ) : null}

      {isEditingForm ? (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-slate-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{editingId ? "Edit plan" : "New plan"}</h2>
            <button onClick={cancel} className="text-slate-500 hover:text-white"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Name</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="e.g. Growth" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Price / month (₹)</span>
              <input type="number" value={form.priceMonthly} onChange={(e) => setForm((f) => ({ ...f, priceMonthly: e.target.value }))} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Price / year (₹)</span>
              <input type="number" value={form.priceYearly} onChange={(e) => setForm((f) => ({ ...f, priceYearly: e.target.value }))} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Per-order fulfillment fee (₹)</span>
              <input type="number" value={form.perOrderFulfillmentFee} onChange={(e) => setForm((f) => ({ ...f, perOrderFulfillmentFee: e.target.value }))} className={inputClass} placeholder="e.g. 2 — debited from wallet per order fulfilled" />
            </label>
            <label className="flex items-center gap-2 pt-6">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4 rounded border-slate-600 bg-slate-800" />
              <span className="text-sm text-slate-300">Offerable to companies</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isTrial} onChange={(e) => setForm((f) => ({ ...f, isTrial: e.target.checked }))} className="h-4 w-4 rounded border-slate-600 bg-slate-800" />
              <span className="text-sm text-slate-300">This is a time-boxed trial tier</span>
            </label>
            {form.isTrial ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Trial length (days)</span>
                <input type="number" value={form.trialDays} onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))} className={inputClass} placeholder="7" />
              </label>
            ) : null}
            <div className="col-span-full">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Features included</span>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-700 bg-slate-800 p-3 sm:grid-cols-3">
                {FEATURE_KEYS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.features.includes(key)}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        features: e.target.checked ? [...f.features, key] : f.features.filter((x) => x !== key),
                      }))}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                    />
                    <span className="text-xs text-slate-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="mt-4 flex h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            <Save size={14} /> {saving ? "Saving…" : "Save plan"}
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : plans.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No plans yet — create one above.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Features</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p._id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-semibold text-white">
                    {p.name}
                    {p.isTrial ? <span className="ml-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-400 ring-1 ring-amber-500/20">{p.trialDays}d trial</span> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    ₹{p.priceMonthly}/mo
                    {p.perOrderFulfillmentFee > 0 ? <span className="block text-[11px] text-slate-500">+₹{p.perOrderFulfillmentFee}/order</span> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{(p.features || []).join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${p.isActive ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20" : "bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20"}`}>
                      {p.isActive ? "offerable" : "retired"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => startEdit(p)} className="text-xs font-semibold text-amber-400 hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
