"use client";

import { useEffect, useState } from "react";
import { CircleDollarSign, Package, TrendingUp } from "lucide-react";
import { listAdminPayments, getAdminEarnings } from "@/lib/admin-api";

const STATUS_STYLE = {
  paid: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  created: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  failed: "bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20",
};

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

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([listAdminPayments(), getAdminEarnings()])
      .then(([paymentsRes, earningsRes]) => {
        setPayments(paymentsRes.payments || []);
        setEarnings(earningsRes);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const totalCollected = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-white">Payments &amp; Earnings</h1>
        <p className="mt-1 text-sm text-slate-400">Razorpay payments received, and per-order fulfillment fee revenue.</p>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300">{error}</div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={CircleDollarSign} label="Collected (Razorpay)" value={`₹${totalCollected}`} />
        <StatCard icon={Package} label="Orders charged" value={earnings?.orderCount ?? 0} />
        <StatCard icon={TrendingUp} label="Fulfillment fee revenue" value={`₹${earnings?.total ?? 0}`} />
        <StatCard icon={CircleDollarSign} label="Total payments" value={payments.length} />
      </div>

      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Fulfillment fee earnings by company</h2>
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !earnings?.byCompany?.length ? (
          <p className="text-sm text-slate-500">No fulfillment fees charged yet.</p>
        ) : (
          <div className="space-y-1.5">
            {earnings.byCompany.map((row) => (
              <div key={String(row.companyId)} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm">
                <span className="text-slate-300">{row.companyName || String(row.companyId)}</span>
                <span className="text-slate-400">{row.count} orders · <span className="font-semibold text-white">₹{row.total}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Razorpay payments</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No payments yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Purpose</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p._id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-semibold text-white">{p.companyName || String(p.companyId)}</td>
                    <td className="px-4 py-3 text-slate-400">{p.purpose === "wallet_topup" ? "Wallet recharge" : "Plan upgrade"}</td>
                    <td className="px-4 py-3 text-right text-slate-300">₹{p.amount}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[p.status] || STATUS_STYLE.created}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
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
