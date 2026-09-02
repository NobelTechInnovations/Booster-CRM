import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/http-error.js";

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

function requireRazorpayConfig() {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw new HttpError(500, "Razorpay isn't configured yet — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in commerce-backend's env.");
  }
}

// Same shape as every other external-API wrapper in this codebase
// (metaFetch in meta.service.js, shopifyFetch in shopify.service.js) —
// Razorpay authenticates with HTTP Basic Auth (key_id as username,
// key_secret as password), not a bearer token.
async function razorpayFetch(path, { method = "GET", body } = {}) {
  requireRazorpayConfig();
  const auth = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString("base64");
  const response = await fetch(`${RAZORPAY_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status >= 400 ? response.status : 502, responseBody?.error?.description || "Razorpay request failed", responseBody);
  }
  return responseBody;
}

// amountPaise: Razorpay's API takes the smallest currency unit (paise for
// INR), never rupees directly — callers convert (₹ * 100) before calling this.
export async function createOrder({ amountPaise, currency = "INR", receipt, notes }) {
  return razorpayFetch("/orders", {
    method: "POST",
    body: { amount: amountPaise, currency, receipt, notes },
  });
}

// The signature Razorpay Checkout hands back to the browser on a successful
// payment — verified per Razorpay's own documented formula:
// HMAC-SHA256(order_id + "|" + payment_id, key_secret), hex-encoded.
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac("sha256", env.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false; // length mismatch — definitely not a match, not a crash
  }
}

// Server-to-server webhook signature — a DIFFERENT secret from keySecret
// (set separately in Razorpay's dashboard under Settings -> Webhooks),
// HMAC-SHA256 over the exact raw request body, hex-encoded, in the
// x-razorpay-signature header. Same reasoning as this app's other inbound
// webhook verifications (see webhook.service.js) for why it needs the raw
// bytes, not a re-serialized JSON.stringify(req.body).
export function verifyWebhookSignature({ rawBody, signature }) {
  if (!env.razorpay.webhookSecret || !signature) return false;
  const expected = crypto.createHmac("sha256", env.razorpay.webhookSecret).update(rawBody, "utf8").digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}
