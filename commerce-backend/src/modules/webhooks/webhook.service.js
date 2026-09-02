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
  return {
    ...p,
    ...(typeof p.data === "object" ? p.data : {}),
    ...(typeof p.payload === "object" ? p.payload : {}),
    // Fastrr nests the ip/landing-page fields one level down here rather than
    // at the top level — verified against real payloads (see cart_attributes
    // .landing_page_url / .ipv4_address on every real event we've received).
    ...(typeof p.cart_attributes === "object" ? p.cart_attributes : {}),
  };
}

// Turns a Shopify product-page URL's slug into a readable title — the only
// thing we have to go on when the cart itself is empty (shopper hasn't added
// anything yet, just landed on a product page). "guntur-teekha-lal-mirch-...
// -250g" -> "Guntur Teekha Lal Mirch ... 250g". Deliberately just a slug
// humanizer, not a guess at the real product title.
function humanizeProductSlug(slug) {
  return slug
    .split("-")
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

// What product(s) the shopper actually seems interested in — for a lead list
// where "which product" is the whole point of following up. Prefers the real
// cart contents (item_name_list / items[].name — verified against real Fastrr
// payloads) since that's literally what's in their cart; falls back to
// parsing a /products/<slug> URL when the cart is still empty (shopper is
// just browsing a product page, hasn't added it yet).
export function extractProductInterest(payload) {
  const flat = flatten(payload);

  const namesFromList = Array.isArray(flat.item_name_list) ? flat.item_name_list.filter(Boolean) : [];
  const namesFromItems = Array.isArray(flat.items) ? flat.items.map((item) => item?.name || item?.title).filter(Boolean) : [];
  const cartNames = [...new Set([...namesFromList, ...namesFromItems])];
  if (cartNames.length) return cartNames.join(", ");

  const landingUrl = flat.landing_page_url || flat.landing_site || "";
  const productMatch = String(landingUrl).match(/\/products\/([a-z0-9-]+)/i);
  if (productMatch) return humanizeProductSlug(productMatch[1]);

  return "";
}

// The price to go with extractProductInterest's name — real cart payloads
// (verified against actual Fastrr events) carry it right alongside the name,
// either per-item (items[].price) or as a parallel array (item_price_list),
// but nothing ever pulled it out before. Only the first item's price when
// there are several — good enough to give a follow-up call something
// concrete to reference, not meant to be an exact multi-item cart total
// (that's cartValue, already captured separately).
export function extractProductPrice(payload) {
  const flat = flatten(payload);

  if (Array.isArray(flat.items) && flat.items[0]?.price !== undefined) {
    return Number(flat.items[0].price);
  }
  if (Array.isArray(flat.item_price_list) && flat.item_price_list[0] !== undefined) {
    return Number(flat.item_price_list[0]);
  }
  return undefined;
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
  const ip = flat.ipv4_address || flat.ip_address || flat.ip || "";
  const landingPageUrl = flat.landing_page_url || flat.landing_site || "";
  const productInterest = extractProductInterest(payload);
  const productPrice = extractProductPrice(payload);
  return { name, phone, email, stage, cartValue, ip, landingPageUrl, productInterest, productPrice };
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
