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

// Best-effort, provider-agnostic: pulls out an event "type" label and a short
// human-readable summary so the events list is scannable without opening
// every raw payload. Recognizes Razorpay's shape explicitly (well-documented,
// verified against their docs); everything else falls back to a generic
// key-sniffing pass over common field names, since we don't have a verified
// payload shape for Shiprocket Checkout / Fastrr / every possible provider.
export function extractEventSummary(provider, payload) {
  const p = payload || {};

  if (provider === "razorpay" && p.event) {
    const entity = p.payload?.payment?.entity || p.payload?.order?.entity || {};
    const amount = entity.amount ? `₹${(entity.amount / 100).toLocaleString("en-IN")}` : "";
    const who = entity.email || entity.contact || "";
    return { type: p.event, summary: [amount, p.event, who].filter(Boolean).join(" — ") };
  }

  // Generic fallback: look for a type/event field, and common
  // customer/amount fields anywhere in the top two levels of the payload.
  const type = p.event || p.type || p.event_type || p.status || "webhook.received";
  const flat = { ...p, ...(typeof p.data === "object" ? p.data : {}), ...(typeof p.payload === "object" ? p.payload : {}) };
  const email = flat.email || flat.customer_email || flat.contact_email;
  const phone = flat.phone || flat.mobile || flat.customer_phone || flat.contact;
  const amount = flat.amount || flat.total || flat.cart_value || flat.order_value;
  const who = email || phone || flat.customer_name || flat.name || "";
  const amountLabel = amount ? `₹${Number(amount).toLocaleString("en-IN")}` : "";

  return {
    type: String(type),
    summary: [amountLabel, String(type), who].filter(Boolean).join(" — ") || "Webhook received",
  };
}
