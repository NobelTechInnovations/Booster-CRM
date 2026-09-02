import { config } from "./config.js";

// Pushes events to commerce-backend the moment they happen — this service
// never waits to be asked. Best-effort: a delivery failure here is logged,
// not thrown, so a momentary blip in reaching the main backend never takes
// down a company's live WhatsApp connection.
async function postToBackend(path, body) {
  try {
    const res = await fetch(`${config.backendUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-smart-whatsapp-secret": config.sharedSecret,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[smart-whatsapp] backend rejected ${path}: ${res.status} ${await res.text().catch(() => "")}`);
    }
  } catch (err) {
    console.warn(`[smart-whatsapp] could not reach backend at ${path}: ${err.message}`);
  }
}

// direction defaults to "inbound" (every call site before history sync
// existed only ever pushed inbound messages) — history sync is the one
// caller that passes "outbound" too, for messages sent from the phone
// itself before this bridge ever connected.
export function notifyInboundMessage({ companyId, waId, text, type, mediaId, mediaMimeType, senderName, waMessageId, timestamp, direction }) {
  return postToBackend(config.backendWebhookPath, {
    kind: "message",
    companyId, waId, text, type, mediaId, mediaMimeType, senderName, waMessageId,
    direction: direction || "inbound",
    timestamp: timestamp || new Date().toISOString(),
  });
}

export function notifyStatusChange({ companyId, status, phoneNumber }) {
  return postToBackend(config.backendWebhookPath, {
    kind: "status",
    companyId, status, phoneNumber,
  });
}
