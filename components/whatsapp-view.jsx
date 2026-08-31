"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, RefreshCw, Check, CheckCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListRowsSkeleton } from "@/components/ui/skeleton";
import {
  connectWhatsApp,
  listWhatsAppChannels,
  listWhatsAppConversations,
  getWhatsAppMessages,
  sendWhatsAppMessage,
} from "@/lib/api";

function fmt(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function statusIcon(status) {
  if (status === "read") return <CheckCheck size={12} className="text-indigo-500" />;
  if (status === "delivered") return <CheckCheck size={12} className="text-slate-400" />;
  if (status === "sent") return <Check size={12} className="text-slate-400" />;
  if (status === "failed") return <span className="text-rose-500">!</span>;
  return <Clock size={12} className="text-slate-300" />;
}

// ─── Connect form ────────────────────────────────────────────────────────────
// WhatsApp Cloud API has no simple OAuth screen for provisioning a business
// phone number — the company admin pastes their own System User token +
// Phone Number ID directly from their WhatsApp Business Account in Meta
// Business Manager, same as the backend's connectWhatsAppChannel expects.
function WhatsAppConnectForm({ onConnected }) {
  const [form, setForm] = useState({ phoneNumberId: "", whatsappBusinessAccountId: "", accessToken: "" });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function connect(e) {
    e.preventDefault();
    setConnecting(true);
    setError("");
    try {
      const res = await connectWhatsApp(form);
      onConnected(res.channel);
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  const inputClass = "mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500";

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Connect WhatsApp Business</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">
            From Meta Business Manager → WhatsApp Business Account, get a Phone Number ID and a permanent
            System User access token (not a temporary one), then paste them here.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={connect} className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase text-slate-500">Phone Number ID</span>
            <input required value={form.phoneNumberId} onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value }))} className={inputClass} placeholder="e.g. 109876543210987" />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase text-slate-500">WhatsApp Business Account ID (optional)</span>
            <input value={form.whatsappBusinessAccountId} onChange={(e) => setForm((f) => ({ ...f, whatsappBusinessAccountId: e.target.value }))} className={inputClass} placeholder="e.g. 123456789012345" />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase text-slate-500">System User Access Token</span>
            <input required type="password" value={form.accessToken} onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))} className={inputClass} placeholder="Permanent token, not a 24h one" />
          </label>
          {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
          <Button type="submit" disabled={connecting}>
            <MessageCircle size={16} />
            {connecting ? "Verifying…" : "Connect WhatsApp"}
          </Button>
        </form>
        <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          Also set the webhook URL in your Meta App's WhatsApp configuration to this backend's{" "}
          <code>/api/whatsapp/webhook</code> — one webhook per Meta App covers every company connected here,
          messages are routed to the right account automatically.
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Message thread ──────────────────────────────────────────────────────────

function MessageThread({ conversation, channelName }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  async function load(silent = false) {
    if (!silent) setIsLoading(true);
    try {
      const res = await getWhatsAppMessages(conversation._id);
      setMessages(res.messages || []);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // No websocket/real-time push exists in this app yet — light polling
    // while a conversation is open is the simplest way to pick up new
    // inbound messages and status updates without building that infra.
    pollRef.current = setInterval(() => load(true), 12000);
    return () => clearInterval(pollRef.current);
  }, [conversation._id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError("");
    const draft = text;
    setText("");
    try {
      await sendWhatsAppMessage(conversation._id, draft);
      await load();
    } catch (err) {
      setError(err.message);
      setText(draft);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <MessageCircle size={16} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{conversation.customerName || conversation.waId}</p>
          <p className="text-[11px] text-slate-400">+{conversation.waId} · {channelName}</p>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-4">
        {isLoading ? (
          <p className="text-center text-xs text-[var(--muted)]">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-[var(--muted)]">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <div key={m._id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-[13px] ${
                  m.direction === "outbound" ? "bg-emerald-100 text-slate-800" : "bg-white text-slate-800 shadow-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400">
                  {fmt(m.timestamp)}
                  {m.direction === "outbound" ? statusIcon(m.status) : null}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error ? <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700">{error}</p> : null}

      <div className="flex items-center gap-2 border-t border-[var(--line)] p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Type a message…"
          className="h-10 flex-1 rounded-full border border-[var(--line)] bg-white px-4 text-sm outline-none focus:border-indigo-500"
        />
        <Button onClick={send} disabled={sending || !text.trim()} className="h-10 w-10 shrink-0 rounded-full p-0">
          <Send size={15} />
        </Button>
      </div>
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function WhatsAppView() {
  const [channel, setChannel] = useState(null);
  const [loadingChannel, setLoadingChannel] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listWhatsAppChannels()
      .then((res) => setChannel((res.channels || [])[0] || null))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingChannel(false));
  }, []);

  async function loadConversations() {
    setLoadingConversations(true);
    try {
      const res = await listWhatsAppConversations();
      setConversations(res.conversations || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingConversations(false);
    }
  }

  useEffect(() => { if (channel) loadConversations(); }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-[1920px] px-4 py-4 lg:px-8">
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="teal">WhatsApp Business</Badge>
          <h1 className="mt-3 text-2xl tracking-tight text-slate-950 md:text-[24px]">WhatsApp Inbox</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Two-way WhatsApp conversations with your customers, right inside the panel.
          </p>
        </div>
        {channel ? (
          <Button variant="secondary" onClick={loadConversations} disabled={loadingConversations} className="h-9 text-xs">
            <RefreshCw size={13} className={loadingConversations ? "animate-spin" : ""} />
            Refresh
          </Button>
        ) : null}
      </section>

      {loadingChannel ? (
        <Card><CardContent><ListRowsSkeleton rows={3} /></CardContent></Card>
      ) : !channel ? (
        <WhatsAppConnectForm onConnected={setChannel} />
      ) : (
        <Card className="overflow-hidden">
          <div className="grid h-[640px] grid-cols-1 md:grid-cols-[300px_1fr]">
            {/* Conversation list */}
            <div className="flex flex-col border-r border-[var(--line)]">
              <div className="border-b border-[var(--line)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Conversations</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loadingConversations ? (
                  <div className="p-4"><ListRowsSkeleton rows={5} /></div>
                ) : conversations.length === 0 ? (
                  <p className="p-4 text-center text-xs text-[var(--muted)]">No conversations yet — they'll appear as soon as a customer messages your WhatsApp number.</p>
                ) : (
                  conversations.map((c) => (
                    <button
                      key={c._id}
                      onClick={() => setSelected(c)}
                      className={`flex w-full items-start gap-2.5 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${selected?._id === c._id ? "bg-indigo-50" : ""}`}
                    >
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">
                        {(c.customerName || c.waId || "?")[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="truncate text-[13px] font-semibold text-slate-800">{c.customerName || `+${c.waId}`}</p>
                          <span className="shrink-0 text-[10px] text-slate-400">{fmt(c.lastMessageAt)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <p className="truncate text-[11px] text-slate-500">{c.lastMessagePreview}</p>
                          {c.unreadCount > 0 ? (
                            <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">{c.unreadCount}</span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Thread */}
            <div className="flex flex-col">
              {selected ? (
                <MessageThread conversation={selected} channelName={channel.name} />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-300">
                  <MessageCircle size={40} />
                  <p className="text-sm text-slate-400">Select a conversation to start messaging.</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
      {error ? <p className="mt-3 text-xs font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
