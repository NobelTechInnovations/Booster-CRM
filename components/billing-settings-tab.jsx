"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock, Sparkles, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getMyBilling, listBillingPlans, rechargeWallet, upgradePlan, verifyPayment, getSession } from "@/lib/api";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { formatMoney } from "@/lib/utils";

function daysLeft(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export function BillingSettingsTab() {
  const [billing, setBilling] = useState(null);
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [busy, setBusy] = useState(""); // "recharge" | planId being upgraded

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const [billingRes, plansRes] = await Promise.all([getMyBilling(), listBillingPlans()]);
      setBilling(billingRes);
      setPlans(plansRes.plans || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const sub = billing?.subscription;
  const hasPlan = Boolean(sub?.planId);
  const trialDaysLeft = hasPlan && sub?.status === "trialing" ? daysLeft(sub.trialEndsAt) : null;
  const companyName = useMemo(() => getSession()?.company?.name || "your workspace", []);

  async function runCheckout(startFn, description) {
    setError("");
    try {
      const order = await startFn();
      const session = getSession();
      const result = await openRazorpayCheckout({
        keyId: order.keyId,
        razorpayOrderId: order.razorpayOrderId,
        amountPaise: order.amountPaise,
        currency: order.currency,
        name: "Booster",
        description,
        prefill: { email: session?.user?.email, name: companyName },
      });
      await verifyPayment(result);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRecharge() {
    const amount = Number(rechargeAmount);
    if (!amount || amount <= 0) { setError("Enter a valid amount"); return; }
    setBusy("recharge");
    await runCheckout(() => rechargeWallet(amount), `Wallet recharge — ₹${amount}`);
    setRechargeAmount("");
    setBusy("");
  }

  async function handleUpgrade(plan) {
    setBusy(plan._id);
    await runCheckout(() => upgradePlan(plan._id), `${plan.name} plan`);
    setBusy("");
  }

  if (isLoading) return <div className="rounded-xl border border-[var(--line)] bg-white p-10 text-center text-sm text-[var(--muted)]">Loading billing…</div>;

  return (
    <div className="space-y-5">
      {error ? <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Current plan</CardTitle></CardHeader>
          <CardContent>
            {!hasPlan ? (
              <p className="text-sm text-[var(--muted)]">No plan assigned — full access, unmetered.</p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold capitalize text-slate-900">{sub.planSlug} plan</p>
                {sub.status === "trialing" ? (
                  <p className="flex items-center gap-1.5 text-sm text-amber-700">
                    <Clock size={14} />
                    {trialDaysLeft === null ? "On trial" : trialDaysLeft < 0 ? "Trial expired" : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`}
                  </p>
                ) : (
                  <p className="text-sm capitalize text-emerald-700">{sub.status}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Wallet</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 flex items-center gap-1.5 text-2xl font-bold text-slate-900">
              <Wallet size={20} className="text-indigo-600" />
              {formatMoney(billing?.wallet?.balance ?? 0)}
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                placeholder="Amount (₹)"
                className="h-10 w-32 rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-indigo-500"
              />
              <Button onClick={handleRecharge} disabled={busy === "recharge"} className="h-10 text-sm">
                {busy === "recharge" ? "Processing…" : "Recharge"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Plans</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {plans.map((p) => {
              const isCurrent = hasPlan && sub.planId === p._id;
              return (
                <div key={p._id} className={`rounded-xl border p-4 ${isCurrent ? "border-indigo-300 bg-indigo-50/40" : "border-[var(--line)]"}`}>
                  <p className="text-sm font-bold text-slate-900">{p.name}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">₹{p.priceMonthly}<span className="text-xs font-normal text-slate-400">/mo</span></p>
                  {p.perOrderFulfillmentFee > 0 ? <p className="text-[11px] text-slate-500">+₹{p.perOrderFulfillmentFee} per order fulfilled</p> : null}
                  <ul className="mt-3 space-y-1">
                    {(p.features || []).map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-[11px] text-slate-600"><Check size={11} className="text-emerald-600" />{f.replace(/_/g, " ")}</li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <p className="mt-3 text-center text-xs font-semibold text-indigo-700">Current plan</p>
                  ) : (
                    <Button onClick={() => handleUpgrade(p)} disabled={busy === p._id} className="mt-3 h-9 w-full text-xs">
                      <Sparkles size={13} />
                      {busy === p._id ? "Processing…" : "Upgrade"}
                    </Button>
                  )}
                </div>
              );
            })}
            {plans.length === 0 ? <p className="text-sm text-[var(--muted)]">No plans are currently offered.</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent wallet activity</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(billing?.walletTransactions || []).length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted)]">No wallet activity yet.</p>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {billing.walletTransactions.map((t) => (
                <div key={t._id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-slate-600">{t.note || t.type}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{new Date(t.createdAt).toLocaleDateString("en-IN")}</span>
                    <span className={t.amount > 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                      {t.amount > 0 ? "+" : ""}{formatMoney(t.amount)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
