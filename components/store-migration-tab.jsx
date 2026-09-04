"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, PlugZap, RefreshCcw, Store, UploadCloud } from "lucide-react";
import { listChannels, createShopifyConnection, copyStoreData, pushMigratedCustomersToShopify } from "@/lib/api";
import { Button } from "@/components/ui/button";

// Store-to-store migration — for replacing an old Shopify store with a new
// one while keeping continuous order/customer history in the panel. Two
// deliberately separate actions:
//  1. "Copy Order & Customer Data" — panel database only, never touches
//     either real Shopify store, safely re-runnable (see migration.repo.js
//     on the backend for the idempotency contract).
//  2. "Push Customers to Shopify" — the one action here that DOES write to
//     the real target store, customers only (never orders, so the target
//     store's own order-numbering sequence is never touched by migrated
//     data) — its own explicit confirmation, separate from step 1.
export function StoreMigrationTab() {
  const [channels, setChannels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [newShop, setNewShop] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [copying, setCopying] = useState(false);
  const [copyResult, setCopyResult] = useState(null);
  const [copyError, setCopyError] = useState("");

  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);
  const [pushError, setPushError] = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const res = await listChannels();
      setChannels((res.channels || []).filter((c) => c.provider === "shopify"));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const connectedStores = channels.filter((c) => c.status === "connected");

  async function handleConnect(e) {
    e.preventDefault();
    if (!newShop.trim()) return;
    setConnecting(true);
    setConnectError("");
    try {
      const result = await createShopifyConnection(newShop.trim());
      window.location.href = result.installUrl;
    } catch (err) {
      setConnectError(err.message);
      setConnecting(false);
    }
  }

  async function handleCopy() {
    const source = connectedStores.find((c) => (c._id || c.id) === sourceId);
    const target = connectedStores.find((c) => (c._id || c.id) === targetId);
    if (!source || !target) return;
    if (!window.confirm(
      `Copy every order and customer from ${source.shop} into the panel under ${target.shop}?\n\n` +
      `This only updates this panel's own database — nothing is sent to either real Shopify store. ` +
      `Safe to run again later: anything already copied is skipped, only new records get added.`,
    )) return;

    setCopying(true);
    setCopyError("");
    setCopyResult(null);
    try {
      const result = await copyStoreData({ sourceChannelId: sourceId, targetChannelId: targetId });
      setCopyResult(result);
    } catch (err) {
      setCopyError(err.message);
    } finally {
      setCopying(false);
    }
  }

  async function handlePush() {
    const target = connectedStores.find((c) => (c._id || c.id) === targetId);
    if (!target) return;
    if (!window.confirm(
      `Create these migrated customers for real in ${target.shop}'s own Shopify admin?\n\n` +
      `This DOES write to the real store — unlike "Copy Data" above. Only customers are pushed, ` +
      `orders are never included, so ${target.shop}'s own order numbering stays untouched. ` +
      `A customer that already exists there (matched by phone/email) is linked instead of duplicated.`,
    )) return;

    setPushing(true);
    setPushError("");
    setPushResult(null);
    try {
      const result = await pushMigratedCustomersToShopify(targetId);
      setPushResult(result);
    } catch (err) {
      setPushError(err.message);
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>
      ) : null}

      {/* Connected Shopify stores */}
      <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Connected Shopify Stores</h3>
            <p className="text-xs text-slate-500">Connect both your old and new store here to migrate between them.</p>
          </div>
          <button onClick={load} disabled={isLoading} className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCcw size={12} className={isLoading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : channels.length === 0 ? (
          <p className="text-sm text-slate-400">No Shopify stores connected yet.</p>
        ) : (
          <div className="mb-4 space-y-2">
            {channels.map((c) => (
              <div key={c._id || c.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-[var(--panel-soft)] px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Store size={14} className="text-slate-400" />
                  <span className="font-medium text-slate-800">{c.shop}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.status === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleConnect} className="flex items-end gap-2 border-t border-slate-100 pt-4">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Connect another Shopify store</span>
            <input
              value={newShop}
              onChange={(e) => setNewShop(e.target.value)}
              placeholder="your-new-store.myshopify.com"
              className="h-9 w-full rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-indigo-500"
            />
          </label>
          <Button type="submit" disabled={connecting || !newShop.trim()} className="h-9">
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
            {connecting ? "Opening Shopify…" : "Connect"}
          </Button>
        </form>
        {connectError ? <p className="mt-2 text-xs font-medium text-rose-600">{connectError}</p> : null}
      </div>

      {/* Migration panel — only once there's something to migrate between */}
      {connectedStores.length >= 2 && (
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-xs">
          <h3 className="mb-1 text-sm font-semibold text-slate-900">Migrate Order & Customer Data</h3>
          <p className="mb-4 text-xs text-slate-500">Copy history from your old store into the panel under your new store.</p>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex-1 min-w-[180px]">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">From (old store)</span>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="h-9 w-full rounded-lg border border-[var(--line)] bg-white px-2.5 text-sm outline-none focus:border-indigo-500">
                <option value="">Select store…</option>
                {connectedStores.map((c) => (
                  <option key={c._id || c.id} value={c._id || c.id} disabled={(c._id || c.id) === targetId}>{c.shop}</option>
                ))}
              </select>
            </label>
            <ArrowRight size={16} className="mt-5 shrink-0 text-slate-300" />
            <label className="flex-1 min-w-[180px]">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">To (new store)</span>
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="h-9 w-full rounded-lg border border-[var(--line)] bg-white px-2.5 text-sm outline-none focus:border-indigo-500">
                <option value="">Select store…</option>
                {connectedStores.map((c) => (
                  <option key={c._id || c.id} value={c._id || c.id} disabled={(c._id || c.id) === sourceId}>{c.shop}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mb-4 flex items-start gap-2 rounded-lg bg-indigo-50/60 px-3 py-2 text-xs text-indigo-800">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            Panel database only — nothing is written to either real Shopify store by this step. Once copied, the new store's copy is what counts toward your revenue totals going forward; the old store's original is kept as history but excluded from revenue so nothing doubles.
          </div>

          <Button onClick={handleCopy} disabled={copying || !sourceId || !targetId} className="h-10">
            {copying ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
            {copying ? "Copying…" : "Copy Order & Customer Data"}
          </Button>
          {copyError ? <p className="mt-2 text-xs font-medium text-rose-600">{copyError}</p> : null}
          {copyResult ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              <span>
                Copied {copyResult.ordersCopied} order(s) and {copyResult.customersCopied} customer(s) from {copyResult.source.shop} to {copyResult.target.shop}.
                {(copyResult.ordersSkipped > 0 || copyResult.customersSkipped > 0) && (
                  <> Skipped {copyResult.ordersSkipped} order(s) / {copyResult.customersSkipped} customer(s) already migrated earlier.</>
                )}
              </span>
            </div>
          ) : null}

          {/* Push customers — separate, own confirmation, only meaningful once a target is picked */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h4 className="mb-1 text-sm font-semibold text-slate-900">Push Migrated Customers to Shopify</h4>
            <p className="mb-3 text-xs text-slate-500">
              Creates the copied customers for real in the new store's own Shopify admin. Orders are never pushed — this keeps that store's order numbering untouched so you can monitor it manually.
            </p>
            <Button variant="secondary" onClick={handlePush} disabled={pushing || !targetId} className="h-10">
              {pushing ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
              {pushing ? "Pushing…" : "Push Customers to Shopify"}
            </Button>
            {pushError ? <p className="mt-2 text-xs font-medium text-rose-600">{pushError}</p> : null}
            {pushResult ? (
              <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Pushed {pushResult.pushed} new, linked {pushResult.alreadyExisted} already on Shopify
                {pushResult.failed.length > 0 && <>, {pushResult.failed.length} failed</>}.
                {pushResult.failed.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-rose-700">
                    {pushResult.failed.map((f) => <li key={f.customerId}>• {f.name}: {f.reason}</li>)}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
