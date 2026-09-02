import { env } from "../../config/env.js";
import { HttpError } from "../../utils/http-error.js";
import {
  upsertSmartWhatsAppSession,
  getSmartWhatsAppSession,
  upsertSmartConversation,
  listSmartConversations,
  getSmartConversation,
  markSmartConversationRead,
  deleteSmartConversation,
  createSmartMessage,
  updateSmartMessageStatus,
  listSmartMessagesForConversation,
} from "../../repositories/smart-whatsapp.repo.js";

// This entire module only ever talks to the separate smart-whatsapp
// service over plain HTTP — see smart-whatsapp-service/README.md for what
// that service is and why it has to be a standalone, always-on process
// instead of living in this codebase. Nothing here holds a live WhatsApp
// connection itself.

function requireServiceConfig() {
  if (!env.smartWhatsapp.serviceUrl) {
    throw new HttpError(500, "Smart WhatsApp isn't configured yet — set SMART_WHATSAPP_SERVICE_URL (and SMART_WHATSAPP_SHARED_SECRET) in commerce-backend's env, pointing at your running smart-whatsapp-service.");
  }
}

async function callService(path, { method = "GET", body } = {}) {
  requireServiceConfig();
  const response = await fetch(`${env.smartWhatsapp.serviceUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-smart-whatsapp-secret": env.smartWhatsapp.sharedSecret,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status >= 400 ? response.status : 502, responseBody?.message || "Smart WhatsApp service request failed");
  }
  return responseBody;
}

export async function startConnection({ companyId }) {
  const status = await callService(`/sessions/${companyId}/start`, { method: "POST" });
  await upsertSmartWhatsAppSession({ companyId, status: status.status, phoneNumber: status.phoneNumber });
  return status;
}

export async function getConnectionStatus({ companyId }) {
  // Live status from the service itself (not just this app's cached copy)
  // — the service is the only side that actually knows if the socket is
  // still open, and its own state (a process restart mid-way through
  // pairing, for one) can change without ever hitting this app's webhook.
  const status = await callService(`/sessions/${companyId}/status`);
  await upsertSmartWhatsAppSession({ companyId, status: status.status, phoneNumber: status.phoneNumber });
  return status;
}

export async function disconnect({ companyId }) {
  await callService(`/sessions/${companyId}/logout`, { method: "POST" });
  await upsertSmartWhatsAppSession({ companyId, status: "disconnected", phoneNumber: "" });
  return { ok: true };
}

async function requireOpenSession(companyId) {
  const session = await getSmartWhatsAppSession(companyId);
  if (!session || session.status !== "open") {
    throw new HttpError(400, "Smart WhatsApp isn't connected — connect it first from the panel.");
  }
}

export async function sendSmartMessage({ companyId, conversationId, to, jidServer, text, mediaUrl, mediaType, sentByUserName }) {
  await requireOpenSession(companyId);
  const result = await callService(`/sessions/${companyId}/send`, { method: "POST", body: { to, jidServer, text, mediaUrl, mediaType } });

  const waId = String(to).replace(/\D/g, "");
  const type = mediaUrl ? (mediaType || "document") : "text";
  const conversation = await upsertSmartConversation({
    companyId, waId, lastMessageAt: new Date(), lastMessagePreview: mediaUrl ? (text?.trim() || `[${type}]`) : text, incrementUnread: false,
  });
  const message = await createSmartMessage({
    companyId,
    conversationId: conversation._id,
    waMessageId: result.waMessageId || `${Date.now()}`,
    direction: "outbound",
    type,
    text: text || "",
    mediaUrl: mediaUrl || "",
    status: "sent",
    timestamp: new Date(),
    sentByUserName: sentByUserName || "",
  });
  return { conversation, message };
}

export async function startSmartConversation({ companyId, to, text, mediaUrl, mediaType, sentByUserName }) {
  return sendSmartMessage({ companyId, to, text, mediaUrl, mediaType, sentByUserName });
}

// Pushed to by the smart-whatsapp service itself — see its
// backend-client.js. Two kinds of events share this one endpoint:
// "message" (something arrived) and "status" (the connection's own state
// changed, e.g. it went from "qr" to "open" once the phone finished
// scanning, or dropped to "close"/"logged_out").
export async function handleWebhook(payload) {
  const { kind, companyId } = payload || {};
  if (!companyId) return;

  if (kind === "status") {
    await upsertSmartWhatsAppSession({ companyId, status: payload.status, phoneNumber: payload.phoneNumber });
    return;
  }

  // Delivery/read ticks for a message we already sent — see
  // session-manager.js's messages.update handler.
  if (kind === "message_status") {
    if (!payload.waMessageId || !payload.status) return;
    await updateSmartMessageStatus({ companyId, waMessageId: payload.waMessageId, status: payload.status });
    return;
  }

  if (kind === "message") {
    const { waId, jidServer, text, type, mediaId, mediaMimeType, senderName, waMessageId, timestamp } = payload;
    if (!waId || !waMessageId) return;
    const ts = timestamp ? new Date(timestamp) : new Date();
    // "outbound" here means a message sent from the phone itself, before or
    // outside this bridge (only ever comes from history-sync backfill on
    // first pairing — a live send always goes through sendSmartMessage,
    // which records itself). Defaults to "inbound" so nothing about a
    // normal live incoming message changes.
    const direction = payload.direction === "outbound" ? "outbound" : "inbound";

    const conversation = await upsertSmartConversation({
      companyId, waId, customerName: senderName,
      lastMessageAt: ts, lastMessagePreview: text || `[${type}]`,
      // Our own historical outbound messages shouldn't bump the unread
      // counter — that's for what the customer sent us.
      incrementUnread: direction === "inbound",
      jidServer,
    });
    await createSmartMessage({
      companyId,
      conversationId: conversation._id,
      waMessageId,
      direction,
      type: type || "text",
      text: text || "",
      mediaId: mediaId || "",
      mediaMimeType: mediaMimeType || "",
      status: direction === "outbound" ? "sent" : "received",
      timestamp: ts,
    });
  }
}

export { listSmartConversations, getSmartConversation, markSmartConversationRead, deleteSmartConversation, listSmartMessagesForConversation };

// Streams an inbound attachment back from the smart-whatsapp service's own
// disk — same reasoning as the Cloud API's fetchWhatsAppMedia: the
// service's media URL isn't safe/possible to hand straight to the browser
// (it needs the shared secret header, which a browser can't be trusted
// with), so this fetches it server-side and the route handler re-streams
// the bytes.
export async function fetchSmartMedia({ companyId, messageId }) {
  requireServiceConfig();
  const response = await fetch(`${env.smartWhatsapp.serviceUrl}/sessions/${companyId}/media/${messageId}`, {
    headers: { "x-smart-whatsapp-secret": env.smartWhatsapp.sharedSecret },
  });
  if (!response.ok) {
    throw new HttpError(response.status >= 400 ? response.status : 502, "Could not fetch this attachment from the Smart WhatsApp service.");
  }
  return { body: response.body, contentType: response.headers.get("content-type") || "application/octet-stream" };
}
