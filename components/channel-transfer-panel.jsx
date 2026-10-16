"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { transferChannelData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Copy products / customers from one connected channel into another
// (Shopify → Oyklane today). Re-runnable: already-copied items are skipped.
export function ChannelTransferPanel({ channels }) {
  const sales = channels.filter((ch) => ch.channelType === "sales" && ch.status === "connected");
  const targets = sales.filter((ch) => ch.provider === "oyklane");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [resources, setResources] = useState({ products: true, categories: false, collections: false, customers: false, discounts: false, orders: false });
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  if (!targets.length || sales.length < 2) return null;
  const label = (ch) => `${ch.name || ch.provider} (${ch.shop})`;
  const selectClass = "h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-xs outline-none";

  async function run() {
    setIsRunning(true); setError(""); setResult(null);
    try {
      const response = await transferChannelData({
        sourceChannelId: sourceId,
        targetChannelId: targetId,
        resources: Object.keys(resources).filter((key) => resources[key]),
      });
      setResult(response.result);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <h3 className="text-sm font-bold">Transfer data between channels</h3>
      <p className="mt-0.5 text-xs text-slate-500">Copy products, categories, collections, customers, discounts and orders into another channel. Items already there are skipped.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <select className={selectClass} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="">From…</option>
          {sales.filter((ch) => String(ch.id || ch._id) !== targetId).map((ch) => <option key={ch.id || ch._id} value={ch.id || ch._id}>{label(ch)}</option>)}
        </select>
        <select className={selectClass} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">To…</option>
          {targets.filter((ch) => String(ch.id || ch._id) !== sourceId).map((ch) => <option key={ch.id || ch._id} value={ch.id || ch._id}>{label(ch)}</option>)}
        </select>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-700 md:col-span-3 md:order-last">
          {Object.keys(resources).map((key) => (
            <label key={key} className="flex items-center gap-1.5 capitalize">
              <input type="checkbox" checked={resources[key]} onChange={(e) => setResources((r) => ({ ...r, [key]: e.target.checked }))} />
              {key}
            </label>
          ))}
        </div>
        <Button onClick={run} disabled={isRunning || !sourceId || !targetId || !Object.values(resources).some(Boolean)}>
          <RefreshCw size={14} className={cn(isRunning && "animate-spin")} />
          {isRunning ? "Transferring…" : "Transfer"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-rose-700">⚠ {error}</p> : null}
      {result ? (
        <div className="mt-3 space-y-1 text-xs">
          {Object.entries(result).map(([key, r]) => (
            <div key={key}>
              <p className="font-semibold capitalize">
                {key}: {r.created} copied, {r.skipped} already there{r.failed.length ? `, ${r.failed.length} failed` : ""}{r.remaining ? ` — ${r.remaining} left, press Transfer again` : ""}
              </p>
              {r.failed.slice(0, 5).map((f, i) => <p key={i} className="text-rose-700">{f.title}: {f.error}</p>)}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
