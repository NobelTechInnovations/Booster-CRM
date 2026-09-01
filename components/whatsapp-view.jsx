"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, RefreshCw, Check, CheckCheck, Clock, Plus, X, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListRowsSkeleton } from "@/components/ui/skeleton";
import {
  connectWhatsApp,
  completeWhatsAppEmbeddedSignup,
  listWhatsAppChannels,
  listWhatsAppConversations,
  getWhatsAppMessages,
  sendWhatsAppMessage,
  startWhatsAppConversation,
  disconnectWhatsAppChannel,
} from "@/lib/api";

// App ID and this Configuration ID are both meant to be public — Meta's own
// JS SDK docs pass them directly in client-side code, the same way a
// Stripe or Google publishable key works. Neither grants access to
// anything by itself.
const META_APP_ID = "1000876402957904";
const WHATSAPP_SIGNUP_CONFIG_ID = "28165972503056854";
const GRAPH_API_VERSION = "v21.0";

let fbSdkPromise = null;

// Loads Meta's JS SDK exactly once per page, however many times this is
// called — WhatsAppConnectForm can mount/unmount as the panel is opened
// and closed.
function loadFacebookSdk() {
  if (fbSdkPromise) return fbSdkPromise;
  fbSdkPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("No window"));
    if (window.FB) return resolve(window.FB);

    window.fbAsyncInit = () => {
      window.FB.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: false, version: GRAPH_API_VERSION });
      resolve(window.FB);
    };

    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Could not load Meta's login SDK — check your connection and try again."));
    document.body.appendChild(script);
  });
  return fbSdkPromise;
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
  const sessionInfoRef = useRef({});

  useEffect(() => {
    loadFacebookSdk().catch((err) => setError(err.message));

    // Meta posts the phone_number_id/waba_id it just set up via
    // postMessage while the signup popup is still open — FB.login's own
    // callback only ever returns the authorization code, not these ids,
    // so they're captured here and combined with the code once login
    // finishes.
    function handleMessage(event) {
      if (!event.origin?.endsWith("facebook.com")) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH" && data.data) {
        sessionInfoRef.current = { phoneNumberId: data.data.phone_number_id, whatsappBusinessAccountId: data.data.waba_id };
      } else if (data.event === "CANCEL") {
        setError("Signup was closed before finishing — try again and complete every step in the popup.");
      } else if (data.event === "ERROR") {
        setError(data.data?.error_message || "Meta reported an error during signup.");
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Deliberately not async, and calls FB.login synchronously with no await
  // in between — Chrome's popup blocker only allows window.open (which
  // FB.login opens internally) when it happens inside the same call stack
  // as the click that triggered it. Awaiting loadFacebookSdk() here first
  // — even though it's usually already resolved from the useEffect preload
  // above — was enough of a gap for Chrome to stop treating the resulting
  // window.open as user-initiated and silently block it, with FB.login's
  // callback then never firing at all (no error, just a stuck button).
  function startSignup() {
    setError("");
    if (!window.FB) {
      setError("Still loading — give it a second and click Continue with Facebook again.");
      return;
    }
    setSigningUp(true);
    sessionInfoRef.current = {};
    try {
      window.FB.login(
        async (response) => {
          const code = response?.authResponse?.code;
          if (!code) {
            setError(response?.status === "unknown" ? "Signup was closed before finishing." : "Meta didn't return an authorization code.");
            setSigningUp(false);
            return;
          }
          const { phoneNumberId, whatsappBusinessAccountId } = sessionInfoRef.current;
          if (!phoneNumberId) {
            setError("Meta didn't hand back a phone number — please try again and finish every step in the popup.");
            setSigningUp(false);
            return;
          }
          try {
            const res = await completeWhatsAppEmbeddedSignup({ code, phoneNumberId, whatsappBusinessAccountId });
            onConnected(res.channel);
          } catch (err) {
            setError(err.message);
          } finally {
            setSigningUp(false);
          }
        },
        {
          config_id: WHATSAPP_SIGNUP_CONFIG_ID,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
        },
      );
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
function NewChatForm({ onStarted, onCancel }) {
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send(e) {
    e.preventDefault();
    if (!to.trim() || !text.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await startWhatsAppConversation(to.trim(), text.trim());
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
      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
      <p className="text-[10px] leading-4 text-slate-400">
        Only works if this number has messaged your WhatsApp before, or within the last 24 hours — Meta blocks
        cold outreach without an approved message template.
      </p>
      <Button type="submit" disabled={sending || !to.trim() || !text.trim()} className="h-8 w-full text-xs">
        {sending ? "Sending…" : "Start chat"}
      </Button>
    </form>
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
  const [showNewChat, setShowNewChat] = useState(false);
  const [showChangeNumber, setShowChangeNumber] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
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

      {loadingChannel ? (
        <Card><CardContent><ListRowsSkeleton rows={3} /></CardContent></Card>
      ) : !channel ? (
        <WhatsAppConnectForm onConnected={setChannel} />
      ) : showChangeNumber ? (
        <WhatsAppConnectForm onConnected={handleChanged} />
      ) : (
        <Card className="overflow-hidden">
          <div className="grid h-[640px] grid-cols-1 md:grid-cols-[300px_1fr]">
            {/* Conversation list */}
            <div className="flex flex-col border-r border-[var(--line)]">
              <div className="border-b border-[var(--line)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Conversations</p>
              </div>
              {showNewChat ? <NewChatForm onStarted={handleStarted} onCancel={() => setShowNewChat(false)} /> : null}
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
