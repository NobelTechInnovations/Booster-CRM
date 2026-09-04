"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { listWhatsAppTemplates, startWhatsAppTemplateConversation } from "@/lib/api";

// A number that has never messaged this WhatsApp number before can only be
// reached with an approved message template — free text is rejected by
// Meta outright (see the note this form shows). Pulls the {{1}}, {{2}}...
// placeholder count straight out of the template's own BODY component so
// the form asks for exactly the values that template needs, nothing hardcoded.
function bodyPlaceholderCount(template) {
  const body = template?.components?.find((c) => c.type === "BODY")?.text || "";
  const matches = body.match(/\{\{\d+\}\}/g) || [];
  return new Set(matches).size;
}

// Shared by the WhatsApp inbox's "New chat" form and the Send WhatsApp
// modal used from Customers/Leads — both need the exact same "this is a
// cold number, pick an approved template" flow, so it lives once here.
export function TemplateSendForm({ to, onSent }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [params, setParams] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  useEffect(() => {
    listWhatsAppTemplates()
      .then((res) => {
        const list = res.templates || [];
        setTemplates(list);
        if (list.length) setSelectedName(list[0].name);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const selected = templates.find((t) => t.name === selectedName);
  const placeholderCount = bodyPlaceholderCount(selected);
  const bodyText = selected?.components?.find((c) => c.type === "BODY")?.text || "";

  useEffect(() => {
    setParams(Array(placeholderCount).fill(""));
  }, [selectedName]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    if (!to.trim() || !selected) return;
    setSending(true);
    setSendError("");
    try {
      const res = await startWhatsAppTemplateConversation(to.trim(), selected.name, selected.language, params, bodyText);
      onSent(res.conversation);
    } catch (err) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p className="text-xs text-slate-400">Loading approved templates…</p>;

  if (loadError) return <p className="text-xs font-medium text-rose-700">{loadError}</p>;

  if (!templates.length) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
        This number hasn't messaged you before, and there's no approved WhatsApp message template to start with —
        free text is blocked by WhatsApp for a genuinely first-ever contact. Create one in Meta's WhatsApp Manager
        → Message templates and get it approved, then it'll show up here automatically.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-2 text-[11px] leading-4 text-indigo-900">
        This number hasn't messaged you before — WhatsApp only allows an approved template to start a new conversation.
      </div>
      <select
        value={selectedName}
        onChange={(e) => setSelectedName(e.target.value)}
        className="h-9 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-xs outline-none focus:border-indigo-500"
      >
        {templates.map((t) => (
          <option key={t.name} value={t.name}>{t.name} · {t.category}</option>
        ))}
      </select>
      {bodyText ? <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-[11px] leading-4 text-slate-600">{bodyText}</p> : null}
      {Array.from({ length: placeholderCount }).map((_, i) => (
        <input
          key={i}
          value={params[i] || ""}
          onChange={(e) => setParams((p) => { const next = [...p]; next[i] = e.target.value; return next; })}
          placeholder={`Value for {{${i + 1}}}`}
          className="h-8 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-xs outline-none focus:border-indigo-500"
        />
      ))}
      {sendError ? <p className="text-xs font-medium text-rose-700">{sendError}</p> : null}
      <Button type="button" onClick={send} disabled={sending || !to.trim()} className="h-8 w-full text-xs">
        {sending ? "Sending…" : "Send template"}
      </Button>
    </div>
  );
}
