"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, RefreshCw, Check, CheckCheck, Clock, Plus, X, Unlink, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListRowsSkeleton } from "@/components/ui/skeleton";
import {
  connectWhatsApp,
  connectWhatsAppEmbedded,
  finalizeWhatsAppSignup,
  listWhatsAppChannels,
  listWhatsAppConversations,
  getWhatsAppMessages,
  sendWhatsAppMessage,
  startWhatsAppConversation,
  disconnectWhatsAppChannel,
  fixWhatsAppPermissions,
  whatsappMediaUrl,
} from "@/lib/api";
import { TemplateSendForm } from "@/components/whatsapp-template-picker";
import { AttachmentPicker } from "@/components/whatsapp-attachment-picker";

// Meta's own error text for the missing "subscribe app to WABA" step (see
// fixWhatsAppPermissions in whatsapp.service.js) — matched so the UI can
// offer the one-click fix right where the error actually shows up, instead
// of making the company go hunting for what "(#200) ... necessary
// permissions ..." means.
function isPermissionError(message) {
  return /necessary permissions|\(#200\)/i.test(message || "");
}

function FixPermissionsHint() {
  const [fixing, setFixing] = useState(false);
  const [result, setResult] = useState("");

  async function fix() {
    setFixing(true);
    setResult("");
    try {
      await fixWhatsAppPermissions();
      setResult("Fixed — try sending again.");
    } catch (err) {
      setResult(err.message);
    } finally {
      setFixing(false);
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={fix}
        disabled={fixing}
        className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {fixing ? "Fixing…" : "Fix sending permissions"}
      </button>
      {result ? <span className="text-[11px] text-slate-500">{result}</span> : null}
    </div>
  );
}

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
// Leads with WhatsApp Embedded Signup — "Continue with Facebook" opens
// Meta's own popup where the company logs in and picks/creates a WhatsApp
// Business Account and phone number, and Meta hands back everything this
// app needs. No Phone Number ID or access token for anyone to go hunting
// for in Business Manager, which isn't reasonable to expect from a
// non-technical shop owner. The old manual-entry path stays available
// (collapsed under "Enter details manually instead") for anyone who
// already has a System User token they'd rather paste in directly.
function WhatsAppConnectForm({ onConnected }) {
  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState({ phoneNumberId: "", whatsappBusinessAccountId: "", accessToken: "" });
  const [connecting, setConnecting] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [error, setError] = useState("");

  // Full-page redirect through Meta's own signup — same mechanism the
  // Social tab's "Connect Instagram / Facebook" already uses reliably.
  // Replaced an earlier JS-SDK-popup version that kept getting interfered
  // with by Chrome's newer FedCM identity flow (silently blocked, or
  // flashing open and closing within about a second) — a plain redirect
  // has none of that.
  async function startSignup() {
    setSigningUp(true);
    setError("");
    try {
      const result = await connectWhatsAppEmbedded();
      window.location.href = result.installUrl;
    } catch (err) {
      setError(err.message);
      setSigningUp(false);
    }
  }

  async function connectManually(e) {
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
            Log in with Facebook and Meta walks you through picking or creating a WhatsApp Business number —
            no IDs or tokens to go find yourself.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {!showManual ? (
          <>
            <Button onClick={startSignup} disabled={signingUp}>
              <MessageCircle size={16} />
              {signingUp ? "Opening Facebook…" : "Continue with Facebook"}
            </Button>
            {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
            <button
              type="button"
              onClick={() => { setShowManual(true); setError(""); }}
              className="mt-4 block text-xs font-medium text-indigo-600 hover:underline"
            >
              Already have a System User access token? Enter details manually instead.
            </button>
          </>
        ) : (
          <>
            <form onSubmit={connectManually} className="space-y-3">
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
            <button type="button" onClick={() => { setShowManual(false); setError(""); }} className="mt-4 block text-xs font-medium text-indigo-600 hover:underline">
              ← Back to Continue with Facebook
            </button>
          </>
        )}
        <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          Also set the webhook URL in your Meta App's WhatsApp configuration to this backend's{" "}
          <code>/api/whatsapp/webhook</code> — one webhook per Meta App covers every company connected here,
          messages are routed to the right account automatically.
        </div>
      </CardContent>
    </Card>
  );
}

// ─── New chat (start a conversation with a number that has no thread yet) ───
// WhatsApp's Cloud API only allows a free-text message when the customer
// messaged in within the last 24 hours — a genuinely first-ever contact to
// a number that has never messaged in will be rejected by Meta unless sent
// as an approved message template, which this app doesn't build yet. The
// note below sets that expectation up front rather than letting the error
// surface as a confusing failure.
function NewChatForm({ onStarted, onCancel, conversations }) {
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Once enough digits are typed to be a real number, check whether it's
  // already an open conversation — if not, WhatsApp requires an approved
  // template (see TemplateSendForm) instead of free text, so the form
  // switches modes rather than let a doomed send fail with a confusing error.
  const waId = to.replace(/\D/g, "");
  const isColdNumber = waId.length >= 10 && !conversations.some((c) => c.waId === waId);

  async function send(e) {
    e.preventDefault();
    if (!to.trim() || (!text.trim() && !attachment)) return;
    setSending(true);
    setError("");
    try {
      const res = await startWhatsAppConversation(to.trim(), text.trim(), attachment ? { mediaId: attachment.mediaId, mediaType: attachment.mediaType } : {});
      onStarted(res.conversation);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2.5 border-b border-[var(--line)] bg-slate-50/60 p-3">
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

      {isColdNumber ? (
        <TemplateSendForm to={to} onSent={onStarted} />
      ) : (
        <form onSubmit={send} className="space-y-2.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="First message…"
            rows={2}
            className="w-full resize-none rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500"
          />
          <AttachmentPicker attachment={attachment} onChange={setAttachment} />
          {error ? (
            <div>
              <p className="text-xs font-medium text-rose-700">{error}</p>
              {isPermissionError(error) ? <FixPermissionsHint /> : null}
            </div>
          ) : null}
          <p className="text-[10px] leading-4 text-slate-400">
            Only works if this number has messaged your WhatsApp before, or within the last 24 hours.
          </p>
          <Button type="submit" disabled={sending || !to.trim() || (!text.trim() && !attachment)} className="h-8 w-full text-xs">
            {sending ? "Sending…" : "Start chat"}
          </Button>
        </form>
      )}
    </div>
  );
}

// ─── Message thread ──────────────────────────────────────────────────────────

const MEDIA_TYPES = new Set(["image", "video", "audio", "document", "sticker"]);

// A file uploaded through AttachmentPicker (outbound) or received on a
// webhook (inbound) both end up as Meta's own opaque mediaId — routed
// through the backend's media proxy either way. mediaUrl only exists for
// the handful of older messages sent before file upload replaced the
// paste-a-link flow.
function MessageMedia({ message }) {
  if (!MEDIA_TYPES.has(message.type)) return null;
  const src = message.mediaId ? whatsappMediaUrl(message.mediaId) : message.mediaUrl;
  if (!src) return <p className="text-xs italic text-slate-400">[{message.type} unavailable]</p>;

  if (message.type === "image" || message.type === "sticker") {
    return <img src={src} alt="Attachment" className="mb-1.5 max-h-64 rounded-lg object-cover" />;
  }
  if (message.type === "video") {
    return <video src={src} controls className="mb-1.5 max-h-64 rounded-lg" />;
  }
  if (message.type === "audio") {
    return <audio src={src} controls className="mb-1.5 w-full" />;
  }
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1.5 flex items-center gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 text-xs font-semibold text-indigo-700 hover:underline"
    >
      <Paperclip size={12} />
      Open attachment
    </a>
  );
}

function MessageThread({ conversation, channelName }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState(null);
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
    if (!text.trim() && !attachment) return;
    setSending(true);
    setError("");
    const draftText = text;
    const draftAttachment = attachment;
    setText("");
    setAttachment(null);
    try {
      await sendWhatsAppMessage(conversation._id, draftText, draftAttachment ? { mediaId: draftAttachment.mediaId, mediaType: draftAttachment.mediaType } : {});
      await load();
    } catch (err) {
      setError(err.message);
      setText(draftText);
      setAttachment(draftAttachment);
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
        <div ref={bottomRef} />
      </div>

      {error ? (
        <div className="border-t border-rose-100 bg-rose-50 px-4 py-2">
          <p className="text-xs font-medium text-rose-700">{error}</p>
          {isPermissionError(error) ? <FixPermissionsHint /> : null}
        </div>
      ) : null}

      <div className="border-t border-[var(--line)] px-3 pt-2">
        <AttachmentPicker attachment={attachment} onChange={setAttachment} />
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--line)] p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Type a message…"
          className="h-10 flex-1 rounded-full border border-[var(--line)] bg-white px-4 text-sm outline-none focus:border-indigo-500"
        />
        <Button onClick={send} disabled={sending || (!text.trim() && !attachment)} className="h-10 w-10 shrink-0 rounded-full p-0">
          <Send size={15} />
        </Button>
      </div>
    </div>
  );
}

function FixPermissionsButton() {
  const [fixing, setFixing] = useState(false);
  const [result, setResult] = useState("");

  async function fix() {
    setFixing(true);
    setResult("");
    try {
      await fixWhatsAppPermissions();
      setResult("Done — sending should work now.");
    } catch (err) {
      setResult(err.message);
    } finally {
      setFixing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result ? <span className="text-xs font-medium text-amber-900">{result}</span> : null}
      <Button onClick={fix} disabled={fixing} className="h-8 text-xs">
        {fixing ? "Fixing…" : "Fix permissions"}
      </Button>
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
  const [showNewChat, setShowNewChat] = useState(false);
  const [showChangeNumber, setShowChangeNumber] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Set only when the redirect callback found more than one WhatsApp
  // number across every WABA Meta granted access to — {selectionToken,
  // candidates}. Nothing was connected yet at this point; the company
  // picks one below and that's what actually finishes the connection.
  const [pendingChoice, setPendingChoice] = useState(null);

  useEffect(() => {
    listWhatsAppChannels()
      .then((res) => setChannel((res.channels || [])[0] || null))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingChannel(false));
  }, []);

  // Reads the redirect callback's own query params — status=connected,
  // status=error&message=..., or status=choose&selectionToken=...&
  // candidates=... when Meta granted access to more than one number. This
  // is the only place a company ever finds out what actually happened
  // after clicking "Continue with Facebook"; without it the flow could
  // silently succeed, silently fail, or need a choice made, and the UI
  // would look identical either way.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (!status) return;

    if (status === "error") {
      setError(params.get("message") || "Something went wrong connecting WhatsApp.");
    } else if (status === "connected") {
      setNotice("WhatsApp connected.");
    } else if (status === "choose") {
      const selectionToken = params.get("selectionToken");
      let candidates = [];
      try {
        candidates = JSON.parse(params.get("candidates") || "[]");
      } catch {
        candidates = [];
      }
      if (selectionToken && candidates.length) {
        setPendingChoice({ selectionToken, candidates });
      } else {
        setError("Meta's response was missing the phone number list — click Continue with Facebook and try again.");
      }
    }

    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function choosePhoneNumber(candidate) {
    setError("");
    try {
      const res = await finalizeWhatsAppSignup(pendingChoice.selectionToken, candidate.phoneNumberId);
      setPendingChoice(null);
      setChannel(res.channel);
      setNotice("WhatsApp connected.");
    } catch (err) {
      setError(err.message);
    }
  }

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

  function handleStarted(conversation) {
    setShowNewChat(false);
    setSelected(conversation);
    loadConversations();
  }

  // connectWhatsAppChannel upserts on {companyId, provider, shop:"whatsapp"}
  // — a company only ever has one WhatsApp channel row — so submitting this
  // form again with a different Phone Number ID/token replaces the number
  // in place rather than creating a second connection.
  function handleChanged(newChannel) {
    setShowChangeNumber(false);
    setChannel(newChannel);
    setSelected(null);
    setConversations([]);
  }

  // Fully removes the connection so the connect form comes back — for when
  // a company wants to stop using this number entirely rather than replace
  // it with another one.
  async function disconnect() {
    if (!window.confirm(`Disconnect ${channel.name}? Conversations already in the panel stay, but you'll need to reconnect to send or receive new messages.`)) return;
    setDisconnecting(true);
    setError("");
    try {
      await disconnectWhatsAppChannel(channel._id || channel.id);
      setChannel(null);
      setSelected(null);
      setConversations([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-95px)] max-w-[1920px] flex-col overflow-hidden px-4 py-4 lg:px-8">
      <section className="mb-4 shrink-0 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="teal">WhatsApp Business</Badge>
          <h1 className="mt-3 text-2xl tracking-tight text-slate-950 md:text-[24px]">WhatsApp Inbox</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Two-way WhatsApp conversations with your customers, right inside the panel.
          </p>
        </div>
        {channel ? (
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowNewChat(true)} className="h-9 text-xs">
              <Plus size={13} />
              New chat
            </Button>
            <Button variant="secondary" onClick={loadConversations} disabled={loadingConversations} className="h-9 text-xs">
              <RefreshCw size={13} className={loadingConversations ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button variant="secondary" onClick={() => setShowChangeNumber((v) => !v)} className="h-9 text-xs">
              {showChangeNumber ? "Cancel" : "Change number"}
            </Button>
            <Button variant="secondary" onClick={disconnect} disabled={disconnecting} className="h-9 text-xs text-rose-600 hover:bg-rose-50">
              <Unlink size={13} />
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        ) : null}
      </section>

      {notice ? (
        <div className="mb-4 shrink-0 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">{notice}</div>
      ) : null}
      {error ? (
        <div className="mb-4 shrink-0 rounded-lg border border-rose-100 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
      {pendingChoice ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Which number do you want to connect?</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Your Facebook login has access to {pendingChoice.candidates.length} WhatsApp numbers. Pick the one this panel should use.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingChoice.candidates.map((c) => (
              <button
                key={c.phoneNumberId}
                onClick={() => choosePhoneNumber(c)}
                className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50/50"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{c.verifiedName || "(no display name yet)"}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {c.displayPhoneNumber || "Unknown number"} · Phone Number ID {c.phoneNumberId} · WABA {c.whatsappBusinessAccountId}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-indigo-600">Connect this number →</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPendingChoice(null)}
              className="mt-2 block text-xs font-medium text-slate-500 hover:underline"
            >
              Cancel
            </button>
          </CardContent>
        </Card>
      ) : loadingChannel ? (
        <Card><CardContent><ListRowsSkeleton rows={3} /></CardContent></Card>
      ) : !channel ? (
        <WhatsAppConnectForm onConnected={setChannel} />
      ) : showChangeNumber ? (
        <WhatsAppConnectForm onConnected={handleChanged} />
      ) : (
        <div className="flex h-full flex-col">
          <Card className="mb-4 shrink-0">
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-2 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Connected number</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{channel.external?.whatsappPhoneNumber || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Display name</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{channel.external?.whatsappDisplayName || channel.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Phone Number ID</p>
                <p className="mt-0.5 font-mono text-xs text-slate-600">{channel.external?.phoneNumberId || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">WhatsApp Business Account ID</p>
                <p className="mt-0.5 font-mono text-xs text-slate-600">{channel.external?.whatsappBusinessAccountId || "—"}</p>
              </div>
            </CardContent>
          </Card>

          {/* Getting "(#200) You do not have the necessary permissions to
              send messages..." means Meta never registered this app as a
              subscribed app on the WABA — a one-time step, separate from
              connecting itself, that a connection made before this fix
              existed can be missing. */}
          <Card className="mb-4 shrink-0 border-amber-200 bg-amber-50">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
              <p className="text-xs text-amber-800">
                Getting a "necessary permissions" error when sending? Click this once to fix it.
              </p>
              <FixPermissionsButton />
            </CardContent>
          </Card>
          <Card className="min-h-0 flex-1 overflow-hidden">
          <div className="grid h-full grid-cols-1 md:grid-cols-[300px_1fr]">
            {/* Conversation list */}
            <div className="flex flex-col border-r border-[var(--line)]">
              <div className="border-b border-[var(--line)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Conversations</p>
              </div>
              {showNewChat ? <NewChatForm onStarted={handleStarted} onCancel={() => setShowNewChat(false)} conversations={conversations} /> : null}
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
        </div>
      )}
      </div>
    </div>
  );
}
