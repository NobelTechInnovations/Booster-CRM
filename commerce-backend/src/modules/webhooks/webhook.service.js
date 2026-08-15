import crypto from "node:crypto";

// Headers different providers use for their HMAC signature. Razorpay uses
// x-razorpay-signature (hex digest of the raw body). Many others (Cashfree,
// generic webhook tooling) use some variant of x-webhook-signature /
// x-signature, sometimes hex, sometimes base64. Rather than hardcode one
// exact scheme per provider (which we can't verify without a real payload
// from each), this tries every header we know of against both encodings and
// accepts a match on any of them — permissive on the "which header/encoding"
// question, but still a real cryptographic check against the shared secret.
const SIGNATURE_HEADERS = [
  "x-razorpay-signature",
  "x-webhook-signature",
  "x-signature",
  "x-hub-signature-256",
  "x-cf-signature",
];

export function verifyWebhookSignature({ secret, rawBody, headers }) {
  if (!secret) return { verified: false, reason: "no-secret-configured" };

  for (const headerName of SIGNATURE_HEADERS) {
    const provided = headers[headerName];
    if (!provided) continue;

    const cleaned = String(provided).replace(/^sha256=/, "");
    const hexDigest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    const base64Digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

    if (safeEqual(cleaned, hexDigest) || safeEqual(cleaned, base64Digest)) {
      return { verified: true, matchedHeader: headerName };
    }
  }

  return { verified: false, reason: "signature-mismatch-or-missing" };
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function flatten(payload) {
  const p = payload || {};
  return { ...p, ...(typeof p.data === "object" ? p.data : {}), ...(typeof p.payload === "object" ? p.payload : {}) };
}

// Pulls out the customer/cart info common to abandoned-cart style payloads.
// Verified against real Fastrr payloads (cart_id, latest_stage, first_name/
// last_name, phone_number, total_price) — not guessed. Other providers fall
// through to the same generic field-name sniffing as before.
export function extractLeadInfo(provider, payload) {
  const flat = flatten(payload);
  const name = [flat.first_name, flat.last_name].filter(Boolean).join(" ") || flat.customer_name || flat.name || "";
  const phone = flat.phone_number || flat.phone || flat.mobile || flat.contact || "";
  // Fastrr's "email" is a synthetic `{phone}@fastrr.com` placeholder when the
  // shopper hasn't given a real one yet — still useful as a stable id, just
  // not necessarily a real inbox.
  const email = flat.email || flat.customer_email || "";
  const stage = flat.latest_stage || flat.stage || "";
  const cartValueRaw = flat.total_price ?? flat.amount ?? flat.total ?? flat.cart_value;
  const cartValue = cartValueRaw !== undefined ? Number(cartValueRaw) : undefined;
  return { name, phone, email, stage, cartValue };
}

// Groups repeat events from the same underlying lead — a Fastrr cart moving
// INIT -> PAYMENT_INITIATED -> ORDER_SCREEN sends one webhook call per stage,
// all sharing one cart_id. Falls back to a customer identifier (phone/email)
// when there's no cart/order id, and returns null (caller groups by the
// event's own id) only when nothing at all is identifiable.
export function extractLeadKey(provider, payload) {
  const p = payload || {};
  const flat = flatten(payload);
  return (
    (p.cart_id && String(p.cart_id)) ||
    (p.order_id && String(p.order_id)) ||
    (p.cart_token && String(p.cart_token)) ||
    (flat.phone_number && String(flat.phone_number)) ||
    (flat.email && String(flat.email)) ||
    null
  );
}

// Best-effort, provider-agnostic: pulls out an event "type" label and a short
// human-readable summary so the events list is scannable without opening
// every raw payload. Recognizes Razorpay's shape explicitly (well-documented,
// verified against their docs) and Fastrr's shape explicitly (verified
// against real payloads); everything else falls back to generic field-name sniffing.
export function extractEventSummary(provider, payload) {
  const p = payload || {};

  if (provider === "razorpay" && p.event) {
    const entity = p.payload?.payment?.entity || p.payload?.order?.entity || {};
    const amount = entity.amount ? `₹${(entity.amount / 100).toLocaleString("en-IN")}` : "";
    const who = entity.email || entity.contact || "";
    return { type: p.event, summary: [amount, p.event, who].filter(Boolean).join(" — ") };
  }

  const info = extractLeadInfo(provider, p);
  const type = info.stage || p.event || p.type || p.event_type || p.status || "webhook.received";
  const amountLabel = info.cartValue ? `₹${info.cartValue.toLocaleString("en-IN")}` : "";
  const who = info.name || info.phone || info.email || "";

  return {
    type: String(type),
    summary: [amountLabel, String(type), who].filter(Boolean).join(" — ") || "Webhook received",
  };
}
