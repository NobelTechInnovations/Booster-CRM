"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listWhatsAppChannels, listWhatsAppConversations, startWhatsAppConversation } from "@/lib/api";
import { TemplateSendForm } from "@/components/whatsapp-template-picker";

// Manual "message this person on WhatsApp" action for Customers/Leads —
// same underlying rule as the WhatsApp inbox's own New chat form: a number
// that has already messaged in (or is inside the 24h window) can get plain
// text, anyone else needs an approved template. Reuses TemplateSendForm so
// that logic isn't duplicated a second time.
export function SendWhatsAppModal({ phone, name, onClose }) {
  const [channel, setChannel] = useState(undefined); // undefined = loading, null = not connected
  const [hasExisting, setHasExisting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const waId = String(phone || "").replace(/\D/g, "");

  useEffect(() => {
    let cancelled = false;
    Promise.all([listWhatsAppChannels(), listWhatsAppConversations()])
      .then(([channelsRes, convRes]) => {
        if (cancelled) return;
        const found = (channelsRes.channels || [])[0] || null;
        setChannel(found);
        setHasExisting((convRes.conversations || []).some((c) => c.waId === waId));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setChecking(false));
    return () => { cancelled = true; };
  }, [waId]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError("");
    try {
      await startWhatsAppConversation(waId, text.trim());
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-16 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <MessageCircle size={15} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Send WhatsApp</p>
              <p className="text-xs text-slate-500">{name || "Customer"} · {phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {!waId ? (
            <p className="text-sm text-rose-700">This record has no phone number to message.</p>
          ) : checking ? (
            <p className="text-xs text-slate-400">Checking WhatsApp connection…</p>
          ) : !channel ? (
            <p className="text-sm text-slate-600">
              No WhatsApp number is connected yet. Connect one from the WhatsApp tab first.
            </p>
          ) : sent ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              Message sent — open the WhatsApp tab to keep the conversation going.
            </p>
          ) : hasExisting ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a message…"
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
              <Button onClick={send} disabled={sending || !text.trim()} className="w-full">
                {sending ? "Sending…" : "Send"}
              </Button>
            </>
          ) : (
            <TemplateSendForm to={waId} onSent={() => setSent(true)} />
          )}
        </div>
      </div>
    </div>
  );
}
