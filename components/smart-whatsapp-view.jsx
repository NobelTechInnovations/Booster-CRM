"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, RefreshCw, Check, Clock, Plus, X, Unlink, Paperclip, Trash2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListRowsSkeleton } from "@/components/ui/skeleton";
import {
  connectSmartWhatsApp,
  getSmartWhatsAppStatus,
  disconnectSmartWhatsApp,
  listSmartWhatsAppConversations,
  deleteSmartWhatsAppConversation,
  getSmartWhatsAppMessages,
  sendSmartWhatsAppMessage,
  startSmartWhatsAppConversation,
  smartWhatsappMediaUrl,
} from "@/lib/api";

// Same fixed-height approach the official WhatsApp inbox uses — the page
// around this card scrolls normally, and only *inside* the card do the
// conversation list and message thread get their own independent scroll.
const CHAT_HEIGHT = "min(700px, 75vh)";

function fmt(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function statusIcon(status) {
  if (status === "sent") return <Check size={12} className="text-slate-400" />;
  if (status === "failed") return <span className="text-rose-500">!</span>;
  return <Clock size={12} className="text-slate-300" />;
}

const RiskBanner = () => (
  <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
    <ShieldAlert size={15} className="mt-0.5 shrink-0" />
    <p>
      <span className="font-semibold">Unofficial.</span> This connects by pairing with WhatsApp the same way WhatsApp Web
      does — it isn't Meta's sanctioned Cloud API (that's the other WhatsApp tab), and using it carries a real risk of the
      connected number getting flagged or banned by WhatsApp. Only use a number you're comfortable with that risk on.
    </p>
  </div>
);

// ─── Attachment (URL only — there's no Meta-style media store to upload to
// here, so this mirrors what the official tab looked like before it grew
// real file upload) ───────────────────────────────────────────────────────
function AttachmentUrlField({ mediaUrl, onChange }) {
  const [open, setOpen] = useState(Boolean(mediaUrl));
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline">
        <Paperclip size={11} />
        Attach a file/image URL
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        value={mediaUrl}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Image/file/video URL"
        className="h-8 flex-1 rounded-lg border border-[var(--line)] bg-white px-3 text-xs outline-none focus:border-indigo-500"
      />
      <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="shrink-0 text-slate-400 hover:text-rose-600">
        <X size={13} />
      </button>
    </div>
  );
}

// ─── New chat ────────────────────────────────────────────────────────────────
function NewChatForm({ onStarted, onCancel }) {
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send(e) {
    e.preventDefault();
    if (!to.trim() || (!text.trim() && !mediaUrl.trim())) return;
    setSending(true);
    setError("");
    try {
      const res = await startSmartWhatsAppConversation(to.trim(), text.trim(), { mediaUrl: mediaUrl.trim() || undefined });
      onStarted(res.conversation);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="space-y-2.5 border-b border-[var(--line)] bg-slate-50/60 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">New chat</p>
        <button type="button" onClick={onCancel} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600">
          <X size={14} />
        </button>
      </div>
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="Phone number, e.g. 919876543210"
        className="h-9 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-xs outline-none focus:border-indigo-500"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="First message…"
        rows={2}
        className="w-full resize-none rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500"
      />
      <AttachmentUrlField mediaUrl={mediaUrl} onChange={setMediaUrl} />
      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
      <Button type="submit" disabled={sending || !to.trim() || (!text.trim() && !mediaUrl.trim())} className="h-8 w-full text-xs">
        {sending ? "Sending…" : "Start chat"}
      </Button>
    </form>
  );
}

// ─── Message thread ──────────────────────────────────────────────────────────

const MEDIA_TYPES = new Set(["image", "video", "audio", "document", "sticker"]);

function MessageMedia({ message }) {
  if (!MEDIA_TYPES.has(message.type)) return null;
  const src = message.direction === "outbound" ? message.mediaUrl : (message.mediaId ? smartWhatsappMediaUrl(message.mediaId) : "");
  if (!src) return <p className="text-xs italic text-slate-400">[{message.type} unavailable]</p>;
  if (message.type === "image" || message.type === "sticker") return <img src={src} alt="Attachment" className="mb-1.5 max-h-64 rounded-lg object-cover" />;
  if (message.type === "video") return <video src={src} controls className="mb-1.5 max-h-64 rounded-lg" />;
  if (message.type === "audio") return <audio src={src} controls className="mb-1.5 w-full" />;
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="mb-1.5 flex items-center gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 text-xs font-semibold text-indigo-700 hover:underline">
      <Paperclip size={12} />
      Open attachment
    </a>
  );
}

function MessageThread({ conversation, onDeleted }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef(null);
  const pollRef = useRef(null);

  async function load(silent = false) {
    if (!silent) setIsLoading(true);
    try {
      const res = await getSmartWhatsAppMessages(conversation._id);
      setMessages(res.messages || []);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), 12000);
    return () => clearInterval(pollRef.current);
  }, [conversation._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scrolls only this list's own scrollTop — not scrollIntoView(), which
  // would also scroll the fixed-height card around it (see the official
  // WhatsApp tab's own fix for this exact bug).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function handleDelete() {
    if (!window.confirm(`Delete this conversation with ${conversation.customerName || `+${conversation.waId}`}? This removes it from the panel only.`)) return;
    setDeleting(true);
    try {
      await deleteSmartWhatsAppConversation(conversation._id);
      onDeleted(conversation._id);
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  async function send() {
    if (!text.trim() && !mediaUrl.trim()) return;
    setSending(true);
    setError("");
    const draftText = text, draftMedia = mediaUrl;
    setText(""); setMediaUrl(""); setShowAttach(false);
    try {
      await sendSmartWhatsAppMessage(conversation._id, draftText, { mediaUrl: draftMedia.trim() || undefined });
      await load();
    } catch (err) {
      setError(err.message);
      setText(draftText); setMediaUrl(draftMedia);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <MessageCircle size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{conversation.customerName || conversation.waId}</p>
          <p className="text-[11px] text-slate-400">+{conversation.waId} · Smart WhatsApp</p>
        </div>
        <button onClick={handleDelete} disabled={deleting} title="Delete conversation" className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
          <Trash2 size={15} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-4">
        {isLoading ? (
          <p className="text-center text-xs text-[var(--muted)]">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-[var(--muted)]">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <div key={m._id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-[13px] ${m.direction === "outbound" ? "bg-emerald-100 text-slate-800" : "bg-white text-slate-800 shadow-sm"}`}>
                <MessageMedia message={m} />
                {m.text ? <p className="whitespace-pre-wrap">{m.text}</p> : null}
                <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400">
                  {fmt(m.timestamp)}
                  {m.direction === "outbound" ? statusIcon(m.status) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {error ? <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700">{error}</p> : null}

      {showAttach ? (
        <div className="border-t border-[var(--line)] px-3 pt-2">
          <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="Image/file/video URL to attach" className="h-9 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-xs outline-none focus:border-indigo-500" />
        </div>
      ) : null}
      <div className="flex items-center gap-2 border-t border-[var(--line)] p-3">
        <button
          type="button"
          onClick={() => setShowAttach((v) => !v)}
          title="Attach a file/image URL"
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition ${showAttach ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:bg-slate-100"}`}
        >
          <Paperclip size={16} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Type a message…"
          className="h-10 flex-1 rounded-full border border-[var(--line)] bg-white px-4 text-sm outline-none focus:border-indigo-500"
        />
        <Button onClick={send} disabled={sending || (!text.trim() && !mediaUrl.trim())} className="h-10 w-10 shrink-0 rounded-full p-0">
          <Send size={15} />
        </Button>
      </div>
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function SmartWhatsAppView() {
  const [status, setStatus] = useState(null); // null while first loading
  const [connecting, setConnecting] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  async function refreshStatus(silent = false) {
    try {
      const res = await getSmartWhatsAppStatus();
      setStatus(res);
      return res;
    } catch (err) {
      if (!silent) setError(err.message);
      return null;
    }
  }

  useEffect(() => {
    refreshStatus();
    return () => clearInterval(pollRef.current);
  }, []);

  // While pairing is in progress (qr shown, or momentarily connecting)
  // this polls for a status change — the phone scanning the QR code
  // updates the *service's* state, not this app's, so there's no other
  // way to find out it succeeded.
  useEffect(() => {
    if (status?.status === "qr" || status?.status === "connecting") {
      pollRef.current = setInterval(() => refreshStatus(true), 3000);
      return () => clearInterval(pollRef.current);
    }
  }, [status?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadConversations(silent = false) {
    if (!silent) setLoadingConversations(true);
    try {
      const res = await listSmartWhatsAppConversations();
      setConversations(res.conversations || []);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoadingConversations(false);
    }
  }

  useEffect(() => { if (status?.status === "open") loadConversations(); }, [status?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keeps the conversation list itself live — a new inbound conversation, an
  // updated preview/unread badge on an existing one — without the user
  // having to hit Refresh by hand. The open thread (MessageThread below)
  // already polls its own messages separately; this is the sidebar's turn.
  useEffect(() => {
    if (status?.status !== "open") return;
    const t = setInterval(() => loadConversations(true), 10000);
    return () => clearInterval(t);
  }, [status?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    setConnecting(true);
    setError("");
    try {
      const res = await connectSmartWhatsApp();
      setStatus(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Smart WhatsApp? You'll need to scan a fresh QR code to reconnect.")) return;
    setDisconnecting(true);
    try {
      await disconnectSmartWhatsApp();
      setStatus({ status: "disconnected", qr: null, phoneNumber: "" });
      setConversations([]);
      setSelected(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDisconnecting(false);
    }
  }

  function handleStarted(conversation) {
    setShowNewChat(false);
    setSelected(conversation);
    loadConversations();
  }

  const connected = status?.status === "open";

  return (
    <div className="mx-auto max-w-[1920px] px-4 py-4 lg:px-8">
      <section className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="amber">Unofficial</Badge>
          <h1 className="mt-3 text-2xl tracking-tight text-slate-950 md:text-[24px]">Smart WhatsApp</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Connect an existing WhatsApp Business App number directly — no separate Cloud API migration.
          </p>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowNewChat(true)} className="h-9 text-xs">
              <Plus size={13} />
              New chat
            </Button>
            <Button variant="secondary" onClick={loadConversations} disabled={loadingConversations} className="h-9 text-xs">
              <RefreshCw size={13} className={loadingConversations ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button variant="secondary" onClick={handleDisconnect} disabled={disconnecting} className="h-9 text-xs text-rose-600 hover:bg-rose-50">
              <Unlink size={13} />
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        ) : null}
      </section>

      <RiskBanner />

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>
      ) : null}

      {status === null ? (
        <Card><CardContent><ListRowsSkeleton rows={3} /></CardContent></Card>
      ) : status.status === "qr" ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Scan this QR code</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">
                On the phone with the WhatsApp number to connect: open WhatsApp → Settings → Linked devices → Link a device, then scan.
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 py-6">
            {status.qr ? (
              <img src={status.qr} alt="WhatsApp pairing QR code" className="h-64 w-64 rounded-lg border border-[var(--line)]" />
            ) : (
              <p className="text-sm text-[var(--muted)]">Generating QR code…</p>
            )}
            <p className="text-xs text-slate-400">This updates automatically once scanned — no need to refresh.</p>
          </CardContent>
        </Card>
      ) : status.status === "connecting" ? (
        <Card><CardContent><p className="p-6 text-center text-sm text-[var(--muted)]">Starting up…</p></CardContent></Card>
      ) : !connected ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Connect Smart WhatsApp</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Pairs directly with a real WhatsApp number by scanning a QR code from that phone — the same way WhatsApp Web works.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={handleConnect} disabled={connecting}>
              <MessageCircle size={16} />
              {connecting ? "Starting…" : "Connect Smart WhatsApp"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col">
          <Card className="mb-4">
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Connected number</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">+{status.phoneNumber || "—"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden" style={{ height: CHAT_HEIGHT }}>
            <div className="grid h-full grid-cols-1 md:grid-cols-[300px_1fr]">
              <div className="flex h-full min-h-0 flex-col border-r border-[var(--line)]">
                <div className="shrink-0 border-b border-[var(--line)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Conversations</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {showNewChat ? <NewChatForm onStarted={handleStarted} onCancel={() => setShowNewChat(false)} /> : null}
                  {loadingConversations ? (
                    <div className="p-4"><ListRowsSkeleton rows={5} /></div>
                  ) : conversations.length === 0 ? (
                    <p className="p-4 text-center text-xs text-[var(--muted)]">No conversations yet.</p>
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

              <div className="flex h-full min-h-0 flex-col">
                {selected ? (
                  <MessageThread
                    conversation={selected}
                    onDeleted={(id) => {
                      setSelected(null);
                      setConversations((prev) => prev.filter((c) => c._id !== id));
                    }}
                  />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-300">
                    <MessageCircle size={40} />
                    <p className="text-sm text-slate-400">Select a conversation to start messaging.</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
