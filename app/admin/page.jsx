"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CircleDollarSign, Users2, AlertTriangle, ShieldCheck } from "lucide-react";
import { listAdminCompanies, listPendingKyc, approveCompanyKyc, rejectCompanyKyc } from "@/lib/admin-api";

const STATUS_STYLE = {
  active: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  trialing: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  no_plan: "bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20",
  past_due: "bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20",
  suspended: "bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20",
  cancelled: "bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20",
  disabled: "bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20",
};

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

// A company's real state, in one label — distinguishes "never assigned a
// plan at all" (full access, no billing relationship yet) from an actual
// trial countdown, since both used to render as a plain "trialing" badge.
function statusLabel(c) {
  if (c.status === "disabled") return { key: "disabled", text: "disabled" };
  // planId specifically, not just subscription's presence — Mongoose
  // auto-instantiates the nested subscription object (with its field
  // defaults) on every newly-created company, so a plain truthiness check
  // would call a never-touched new company "trialing" instead of "no plan".
  if (!c.subscription?.planId) return { key: "no_plan", text: "no plan" };
  if (c.subscription.status === "trialing") {
    const left = daysLeft(c.subscription.trialEndsAt);
    if (left === null) return { key: "trialing", text: "trial" };
    return { key: left < 0 ? "suspended" : "trialing", text: left < 0 ? "trial expired" : `trial · ${left}d left` };
  }
  return { key: c.subscription.status, text: c.subscription.status };
}

// Companies with kyc.status === "submitted" — waiting on an admin to
// actually approve/reject (the company already submitted via PUT
// /api/company/kyc; nothing surfaced that here before this section).
function PendingKycSection() {
  const [pending, setPending] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setIsLoading(true);
    try {
      setPending((await listPendingKyc()).companies || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function approve(companyId) {
    setBusyId(companyId);
    setError("");
    try {
      await approveCompanyKyc(companyId);
      setPending((prev) => prev.filter((c) => c._id !== companyId));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function reject(companyId) {
    const reason = window.prompt("Reason for rejecting this KYC submission?");
    if (!reason || !reason.trim()) return;
    setBusyId(companyId);
    setError("");
    try {
      await rejectCompanyKyc(companyId, reason.trim());
      setPending((prev) => prev.filter((c) => c._id !== companyId));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  if (isLoading || !pending.length) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck size={15} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-white">Pending KYC Approvals ({pending.length})</h2>
      </div>
      {error ? <p className="mb-2 text-xs font-medium text-rose-300">{error}</p> : null}
      <div className="space-y-2">
        {pending.map((c) => (
          <div key={c._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{c.name}</p>
              <p className="text-xs text-slate-400">
                {c.kyc?.legalName || "No legal name"} · GSTIN {c.kyc?.gstin || "—"} · submitted {c.kyc?.submittedAt ? new Date(c.kyc.submittedAt).toLocaleDateString("en-IN") : "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/admin/companies/${c._id}`} className="text-xs font-semibold text-slate-400 hover:underline">View</Link>
              <button
                onClick={() => reject(c._id)}
                disabled={busyId === c._id}
                className="rounded-lg border border-rose-500/30 px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={() => approve(c._id)}
                disabled={busyId === c._id}
                className="rounded-lg bg-emerald-500/90 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {busyId === c._id ? "…" : "Approve"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon size={14} />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    listAdminCompanies()
      .then((res) => setCompanies(res.companies || []))
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter(
      (c) => (c.name || "").toLowerCase().includes(q) || (c.ownerEmail || "").toLowerCase().includes(q),
    );
  }, [companies, search]);

  // Group by owner email so a single customer's several brands show together
  // — this app already lets one login own multiple Company docs.
  const grouped = useMemo(() => {
    const byOwner = new Map();
    for (const c of filtered) {
      const key = c.ownerEmail || `unowned-${c._id}`;
      if (!byOwner.has(key)) byOwner.set(key, []);
      byOwner.get(key).push(c);
    }
    return [...byOwner.entries()];
  }, [filtered]);

  const stats = useMemo(() => {
    // planId, not just subscription's presence/status — see statusLabel's
    // own comment on why (Mongoose auto-defaults the nested object).
    const hasPlan = (c) => Boolean(c.subscription?.planId);
    const subStatus = (c) => c.subscription?.status;
    return {
      total: companies.length,
      active: companies.filter((c) => hasPlan(c) && subStatus(c) === "active").length,
      trialing: companies.filter((c) => hasPlan(c) && subStatus(c) === "trialing").length,
      noPlan: companies.filter((c) => !hasPlan(c)).length,
      suspended: companies.filter((c) => c.status === "disabled" || (hasPlan(c) && subStatus(c) === "suspended")).length,
    };
  }, [companies]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Companies</h1>
          <p className="mt-1 text-sm text-slate-400">Every company on Booster, grouped by owner.</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company or owner email…"
          className="h-9 w-72 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-500"
        />
      </div>

      <PendingKycSection />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard icon={Building2} label="Total companies" value={stats.total} />
        <StatCard icon={CircleDollarSign} label="Active plan" value={stats.active} />
        <StatCard icon={Users2} label="On trial" value={stats.trialing} />
        <StatCard icon={Users2} label="No plan yet" value={stats.noPlan} />
        <StatCard icon={AlertTriangle} label="Suspended" value={stats.suspended} />
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300">{error}</div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : grouped.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No companies found.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Wallet</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Created</th>
                <th className="px-4 py-3 text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([ownerEmail, group]) => (
                <Fragment key={ownerEmail}>
                  {group.length > 1 ? (
                    <tr key={`${ownerEmail}-header`} className="border-b border-slate-800/60 bg-slate-950/40">
                      <td colSpan={8} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {ownerEmail} — {group.length} brands
                      </td>
                    </tr>
                  ) : null}
                  {group.map((c) => {
                    const status = statusLabel(c);
                    return (
                    <tr key={c._id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-semibold text-white">{c.name}</td>
                      <td className="px-4 py-3 text-slate-400">{c.ownerEmail || "—"}</td>
                      <td className="px-4 py-3 text-slate-300">{c.subscription?.planSlug || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[status.key] || STATUS_STYLE.no_plan}`}>
                          {status.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">₹{c.wallet?.balance ?? 0}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{c.orderCount}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/companies/${c._id}`} className="text-xs font-semibold text-amber-400 hover:underline">
                          Manage
                        </Link>
                      </td>
                    </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
