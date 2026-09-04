"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, KeyRound, Loader2, Megaphone, PlugZap, RefreshCcw, Store, UploadCloud } from "lucide-react";
import { listChannels, createShopifyConnection, saveShopifySetup, updateChannelAppCredentials, copyStoreData, pushMigratedCustomersToShopify, enableMarketingForPushedCustomers } from "@/lib/api";
import { Button } from "@/components/ui/button";

// Self-contained indeterminate progress bar — shown under whichever button
// below is mid-flight. These migration/push/marketing actions are plain
// synchronous loops on the backend with no real progress-streaming
// mechanism, so this is deliberately indeterminate (a sweeping bar, not a
// percentage) rather than implying a false sense of precision. The
// @keyframes rule is scoped to this component via an inline <style> tag
// instead of a global CSS/Tailwind config change, so it works regardless of
// what's already in app/globals.css.
function ProgressBar({ label }) {
  return (
    <div className="mt-3">
      <style>{`
        @keyframes booster-progress-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(340%); }
        }
      `}</style>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full w-1/3 rounded-full bg-indigo-500"
          style={{ animation: "booster-progress-sweep 1.1s ease-in-out infinite" }}
        />
      </div>
      {label ? <p className="mt-1.5 text-[11px] text-slate-500">{label}</p> : null}
    </div>
  );
}

// Store-to-store migration — for replacing an old Shopify store with a new
// one while keeping continuous order/customer history in the panel. Three
// deliberately separate actions:
//  1. "Copy Order & Customer Data" — panel database only, never touches
//     either real Shopify store, safely re-runnable (see migration.repo.js
//     on the backend for the idempotency contract).
//  2. "Push Customers to Shopify" — the one action here that DOES write to
//     the real target store, customers only (never orders, so the target
//     store's own order-numbering sequence is never touched by migrated
//     data) — its own explicit confirmation, separate from step 1.
//  3. "Turn On Marketing Subscription" — Shopify's Customer API has no
//     "carry over consent from the old store" concept, so every customer
//     landing on the target store via step 2 (or already there) starts
//     with marketing consent off; this flips it on in bulk, its own
//     explicit confirmation since it also writes to the real store.
export function StoreMigrationTab() {
  const [channels, setChannels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [newShop, setNewShop] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [useCustomApp, setUseCustomApp] = useState(false);
  const [customApiKey, setCustomApiKey] = useState("");
  const [customApiSecret, setCustomApiSecret] = useState("");

  const [editingCredsFor, setEditingCredsFor] = useState("");
  const [credsApiKey, setCredsApiKey] = useState("");
  const [credsApiSecret, setCredsApiSecret] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsError, setCredsError] = useState("");
  const [credsSavedFor, setCredsSavedFor] = useState("");

  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [includeCustomers, setIncludeCustomers] = useState(true);
  const [includeOrders, setIncludeOrders] = useState(true);
  const [copying, setCopying] = useState(false);
  const [copyResult, setCopyResult] = useState(null);
  const [copyError, setCopyError] = useState("");

  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);
  const [pushError, setPushError] = useState("");

  const [enablingMarketing, setEnablingMarketing] = useState(false);
  const [marketingResult, setMarketingResult] = useState(null);
  const [marketingError, setMarketingError] = useState("");

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
      // If this store has its own Shopify app, save it scoped to this shop
      // BEFORE connecting — buildShopifyInstallUrl picks it up by shop, so
      // order matters here (mirrors the existing single-store connect flow
      // on the Channels page: save-then-connect).
      if (useCustomApp) {
        if (!customApiKey.trim() || !customApiSecret.trim()) {
          throw new Error("Client ID and Client Secret are required for a custom app");
        }
        await saveShopifySetup({ shop: newShop.trim(), apiKey: customApiKey.trim(), apiSecret: customApiSecret.trim() });
      }
      const result = await createShopifyConnection(newShop.trim());
      window.location.href = result.installUrl;
    } catch (err) {
      setConnectError(err.message);
      setConnecting(false);
    }
  }

  function startEditCreds(channelId) {
    setEditingCredsFor(channelId);
    setCredsApiKey("");
    setCredsApiSecret("");
    setCredsError("");
    setCredsSavedFor("");
  }

  async function saveCreds(channelId) {
    if (!credsApiKey.trim() || !credsApiSecret.trim()) {
      setCredsError("Client ID and Client Secret are required");
      return;
    }
    setSavingCreds(true);
    setCredsError("");
    try {
      await updateChannelAppCredentials(channelId, { apiKey: credsApiKey.trim(), apiSecret: credsApiSecret.trim() });
      setEditingCredsFor("");
      setCredsSavedFor(channelId);
    } catch (err) {
      setCredsError(err.message);
    } finally {
      setSavingCreds(false);
    }
  }

  async function handleCopy() {
    const source = connectedStores.find((c) => (c._id || c.id) === sourceId);
    const target = connectedStores.find((c) => (c._id || c.id) === targetId);
    if (!source || !target) return;
    if (!includeCustomers && !includeOrders) return;

    const what = includeCustomers && includeOrders ? "every order and customer" : includeCustomers ? "every customer" : "every order";
    if (!window.confirm(
      `Copy ${what} from ${source.shop} into the panel under ${target.shop}?\n\n` +
      `This only updates this panel's own database — nothing is sent to either real Shopify store. ` +
      `Safe to run again later: anything already copied is skipped, only new records get added.`,
    )) return;

    setCopying(true);
    setCopyError("");
    setCopyResult(null);
    try {
      const result = await copyStoreData({ sourceChannelId: sourceId, targetChannelId: targetId, includeCustomers, includeOrders });
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

  async function handleEnableMarketing() {
    const target = connectedStores.find((c) => (c._id || c.id) === targetId);
    if (!target) return;
    if (!window.confirm(
      `Turn ON marketing subscription for every real customer already on ${target.shop}'s own Shopify admin?\n\n` +
      `This DOES write to the real store, same as "Push Customers" above. It covers email marketing consent ` +
      `reliably; the WhatsApp/SMS subscription column is a best-effort mapping on Shopify's side, so double-check ` +
      `a few customers there afterward to confirm it landed the way you expect.`,
    )) return;

    setEnablingMarketing(true);
    setMarketingError("");
    setMarketingResult(null);
    try {
      const result = await enableMarketingForPushedCustomers(targetId);
      setMarketingResult(result);
    } catch (err) {
      setMarketingError(err.message);
    } finally {
      setEnablingMarketing(false);
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
            {channels.map((c) => {
              const channelId = c._id || c.id;
              return (
                <div key={channelId} className="rounded-lg border border-slate-100 bg-[var(--panel-soft)] px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Store size={14} className="text-slate-400" />
                      <span className="font-medium text-slate-800">{c.shop}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.status === "connected" ? "bg-emerald-50 text-emerald-700" : c.status === "inactive" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                        {c.status}
                      </span>
                      <button
                        onClick={() => (editingCredsFor === channelId ? setEditingCredsFor("") : startEditCreds(channelId))}
                        className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        <KeyRound size={11} /> App credentials
                        <ChevronDown size={11} className={editingCredsFor === channelId ? "rotate-180" : ""} />
                      </button>
                    </div>
                  </div>

                  {editingCredsFor === channelId && (
                    <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
                      <p className="text-[11px] text-slate-500">
                        Set (or fix) this specific store&apos;s own Shopify app Client ID/Secret — used to verify its OAuth connect and incoming webhooks. Doesn&apos;t require reconnecting.
                      </p>
                      <input
                        value={credsApiKey}
                        onChange={(e) => setCredsApiKey(e.target.value)}
                        placeholder="Client ID"
                        className="h-8 w-full rounded-md border border-[var(--line)] px-2 text-xs outline-none focus:border-indigo-500"
                      />
                      <input
                        value={credsApiSecret}
                        onChange={(e) => setCredsApiSecret(e.target.value)}
                        placeholder="Client Secret"
                        type="password"
                        className="h-8 w-full rounded-md border border-[var(--line)] px-2 text-xs outline-none focus:border-indigo-500"
                      />
                      <Button onClick={() => saveCreds(channelId)} disabled={savingCreds} className="h-7 px-2.5 text-xs">
                        {savingCreds ? "Saving…" : "Save"}
                      </Button>
                      {credsError ? <p className="text-[11px] font-medium text-rose-600">{credsError}</p> : null}
                    </div>
                  )}
                  {credsSavedFor === channelId && editingCredsFor !== channelId && (
                    <p className="mt-1 text-[11px] font-medium text-emerald-600">App credentials updated.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={handleConnect} className="border-t border-slate-100 pt-4">
          <div className="flex items-end gap-2">
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
          </div>

          <button
            type="button"
            onClick={() => setUseCustomApp((v) => !v)}
            className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
          >
            <ChevronDown size={11} className={useCustomApp ? "rotate-180" : ""} />
            This store uses its own Shopify app
          </button>
          {useCustomApp && (
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              <input
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                placeholder="Client ID"
                className="h-8 w-full rounded-md border border-[var(--line)] px-2 text-xs outline-none focus:border-indigo-500"
              />
              <input
                value={customApiSecret}
                onChange={(e) => setCustomApiSecret(e.target.value)}
                placeholder="Client Secret"
                type="password"
                className="h-8 w-full rounded-md border border-[var(--line)] px-2 text-xs outline-none focus:border-indigo-500"
              />
              <p className="col-span-full text-[11px] text-slate-500">
                Whichever backend URL you connect from, make sure it's whitelisted as an "Allowed redirection URL" in this app's own Shopify Partner setup.
              </p>
            </div>
          )}
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

          <div className="mb-4 flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={includeCustomers} onChange={(e) => setIncludeCustomers(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Customers
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={includeOrders} onChange={(e) => setIncludeOrders(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Orders
            </label>
          </div>

          <Button onClick={handleCopy} disabled={copying || !sourceId || !targetId || (!includeCustomers && !includeOrders)} className="h-10">
            {copying ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
            {copying
              ? "Copying…"
              : includeCustomers && includeOrders
              ? "Copy Order & Customer Data"
              : includeCustomers
              ? "Copy Customer Data"
              : includeOrders
              ? "Copy Order Data"
              : "Select customers or orders"}
          </Button>
          {copying ? <ProgressBar label="Copying — a store with a lot of history can take a little while, this keeps running in the background." /> : null}
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

          {/* Push customers — separate, own confirmation, only meaningful once a target is picked. This is
              the one action here that writes to the real target store, which is why it stays a distinct step
              from the checkboxes above rather than folding "orders" into it too — orders are never pushed to
              Shopify, only copied into the panel's own database (the step above). */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h4 className="mb-1 text-sm font-semibold text-slate-900">Push Migrated Customers to Shopify</h4>
            <p className="mb-3 text-xs text-slate-500">
              Creates the copied customers for real in the new store's own Shopify admin. Orders are never pushed — this keeps that store's order numbering untouched so you can monitor it manually.
              Run &quot;Copy Customer Data&quot; above first — this step only pushes customers that have already been copied into the panel.
            </p>
            <Button variant="secondary" onClick={handlePush} disabled={pushing || !targetId} className="h-10">
              {pushing ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
              {pushing ? "Pushing…" : "Push Customers to Shopify"}
            </Button>
            {pushing ? <ProgressBar label="Pushing customers to Shopify, one at a time — hang tight for a large list." /> : null}
            {pushError ? <p className="mt-2 text-xs font-medium text-rose-600">{pushError}</p> : null}
            {pushResult && pushResult.total === 0 ? (
              <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Nothing to push yet — copy customer data from the old store first (above), then try this again.
              </p>
            ) : pushResult ? (
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

          {/* Turn on marketing subscription — a separate, own confirmation, real-store-writing
              step, same shape as Push above. Every customer physically on the target channel is
              covered (freshly pushed, matched-as-already-existing, or genuinely-synced normally),
              see enableMarketingForPushedCustomers's own comment on the backend for exactly why. */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h4 className="mb-1 text-sm font-semibold text-slate-900">Turn On Marketing Subscription</h4>
            <p className="mb-3 text-xs text-slate-500">
              Customers copied or pushed from the old store land with marketing consent switched off — Shopify has no way to carry
              consent over from another store. This turns email marketing on for every real customer already on the new store.
              The WhatsApp/SMS subscription column is a best-effort mapping on Shopify&apos;s side — worth a quick check in their admin afterward.
            </p>
            <Button variant="secondary" onClick={handleEnableMarketing} disabled={enablingMarketing || !targetId} className="h-10">
              {enablingMarketing ? <Loader2 size={15} className="animate-spin" /> : <Megaphone size={15} />}
              {enablingMarketing ? "Turning on…" : "Turn On Marketing Subscription"}
            </Button>
            {enablingMarketing ? <ProgressBar label="Updating marketing consent on Shopify, one customer at a time." /> : null}
            {marketingError ? <p className="mt-2 text-xs font-medium text-rose-600">{marketingError}</p> : null}
            {marketingResult && marketingResult.total === 0 ? (
              <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No customers found yet on the new store — push or sync some customers first, then try this again.
              </p>
            ) : marketingResult ? (
              <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Turned on marketing for {marketingResult.updated} of {marketingResult.total} customer(s)
                {marketingResult.failed.length > 0 && <>, {marketingResult.failed.length} failed</>}.
                {marketingResult.failed.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-rose-700">
                    {marketingResult.failed.map((f) => <li key={f.customerId}>• {f.name}: {f.reason}</li>)}
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
