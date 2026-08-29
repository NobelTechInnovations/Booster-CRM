"use client";

import { useState, useEffect } from "react";
import {
  AlertCircle,
  Ban,
  Bell,
  MessageCircle,
  Package,
  PlayCircle,
  Plus,
  Repeat2,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  listAutomationRules,
  createAutomationRule,
  toggleAutomationRule,
  runAutomationRule,
  deleteAutomationRule,
} from "@/lib/api";

const TRIGGERS = [
  { key: "order_placed", label: "Order Placed", icon: ShoppingBag },
  { key: "order_fulfilled", label: "Order Fulfilled", icon: Truck },
  { key: "order_cancelled", label: "Order Cancelled", icon: Ban },
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

function labelFor(list, key) {
  return list.find((x) => x.key === key)?.label || key;
}
function iconFor(list, key) {
  return list.find((x) => x.key === key)?.icon || Zap;
}

function CreateRuleModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState(TRIGGERS[0].key);
  const [action, setAction] = useState(ACTIONS[0].key);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError("Rule name is required"); return; }
    setError("");
    setSaving(true);
    try {
      const res = await createAutomationRule({
        name: name.trim(),
        trigger,
        action,
        config: { message: message.trim() },
        isActive: true,
      });
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
          <h2 className="text-lg font-bold text-slate-900">New Automation Rule</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Rule Name</label>
            <input
              className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="e.g. WhatsApp confirmation on order"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">When (Trigger)</label>
              <select
                className="h-10 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-indigo-500"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
              >
                {TRIGGERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
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
          {(action === "send_whatsapp" || action === "send_email") && (
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
          )}
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

export function AutomationView() {
  const [rules, setRules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [runningId, setRunningId] = useState("");

  async function loadRules() {
    setIsLoading(true);
    setError("");
    try {
      const res = await listAutomationRules();
      setRules(res.rules || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadRules(); }, []);

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
      loadRules();
    }
  }

  const activeCount = rules.filter((r) => r.isActive).length;
  const totalRuns = rules.reduce((sum, r) => sum + (r.runCount || 0), 0);

  return (
    <div className="mx-auto max-w-[1920px] px-4 py-4 lg:px-8">
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="indigo">Automation</Badge>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 md:text-[28px]">Automation Rules</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Trigger actions automatically on order events — WhatsApp confirmations, tags, team alerts, and webhooks.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          New Rule
        </Button>
      </section>

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Active Rules</p>
          <p className="mt-2 text-2xl font-bold">{activeCount} / {rules.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Total Runs</p>
          <p className="mt-2 text-2xl font-bold">{totalRuns.toLocaleString("en-IN")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Available Triggers</p>
          <p className="mt-2 text-2xl font-bold">{TRIGGERS.length}</p>
        </Card>
      </section>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-[var(--muted)]">Loading rules…</div>
          ) : rules.length === 0 ? (
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

      {showCreate ? (
        <CreateRuleModal
          onClose={() => setShowCreate(false)}
          onCreated={(rule) => { setRules((prev) => [rule, ...prev]); setShowCreate(false); }}
        />
      ) : null}
    </div>
  );
}
