import crypto from "node:crypto";
import { getChannelForSync, updateChannelSyncState, upsertOyklaneChannel } from "../../repositories/channel.repo.js";
import { saveSyncedOyklaneData } from "../../repositories/order.repo.js";
import { fetchWithTimeout } from "../../utils/fetch-with-timeout.js";
import { HttpError } from "../../utils/http-error.js";

// Oyklane (https://oyklane.com/developers) — API-key sales channel.
// Keys are created per store under Settings ▸ API & webhooks and carry their
// own permissions (read_orders, write_products, …); a call outside them is a
// 403 from Oyklane, surfaced to the user as-is.

const BASE_URL = "https://api.oyklane.com/api/v1";
const PAGE_LIMIT = 100;
// 240 req/min per key: 50 pages × 3 resources stays well inside one sync.
const MAX_PAGES = 50;
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

async function oyklaneFetch(apiKey, path, { method = "GET", query, body } = {}, attempt = 0) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const response = await fetchWithTimeout(url, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 429 && attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    return oyklaneFetch(apiKey, path, { method, query, body }, attempt + 1);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = payload.error || payload.message || response.statusText;
    if (response.status === 401) throw new HttpError(400, "Oyklane rejected the API key — it may have been revoked. Reconnect with a new key.");
    if (response.status === 403) throw new HttpError(403, `Oyklane API key lacks permission for this action: ${reason}`);
    throw new HttpError(response.status >= 500 ? 502 : response.status, `Oyklane: ${reason}`);
  }
  return payload;
}

async function fetchAll(apiKey, path, query = {}) {
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data = [], total } = await oyklaneFetch(apiKey, path, { query: { ...query, page, limit: PAGE_LIMIT } });
    rows.push(...data);
    if (data.length < PAGE_LIMIT || (total && rows.length >= total)) break;
  }
  return rows;
}

function requireApiKey(channel) {
  const apiKey = channel?.credentials?.apiKey;
  if (!apiKey) throw new HttpError(400, "Oyklane API key is missing. Reconnect the channel.");
  return apiKey;
}

export async function connectOyklane({ companyId, userId, apiKey, webhookSecret }) {
  const key = String(apiKey || "").trim();
  if (!/^oyk_[A-Za-z0-9_-]{8,}$/.test(key)) {
    throw new HttpError(400, "Enter the Oyklane API key (starts with oyk_) from Settings ▸ API & webhooks.");
  }
  const secret = String(webhookSecret || "").trim();
  if (secret && !secret.startsWith("whsec_")) {
    throw new HttpError(400, "The webhook signing secret starts with whsec_.");
  }

  // Validates the key and tells us which store it belongs to.
  const { data: shop = {} } = await oyklaneFetch(key, "/shop");
  const handle = String(shop.handle || shop.domain || shop.id || "").toLowerCase();
  if (!handle) throw new HttpError(502, "Oyklane didn't return the store details for this key.");

  return upsertOyklaneChannel({
    companyId,
    userId,
    shop: handle,
    name: shop.name ? `Oyklane · ${shop.name}` : "Oyklane",
    apiKey: key,
    webhookSecret: secret,
    external: { domain: shop.domain, currency: shop.currency, timeZone: shop.time_zone || shop.timezone },
  });
}

function oyklaneMetrics({ orders, products, customers }) {
  const latest = orders[0];
  return {
    orderCount: orders.length,
    productCount: products.length,
    customerCount: customers.length,
    salesTotal: orders.reduce((total, order) => total + Number(order.total || 0), 0),
    currency: latest?.currency || "INR",
    lastOrderName: latest?.number ? `#${latest.number}` : "",
    lastOrderAt: latest?.created_at ? new Date(latest.created_at) : undefined,
  };
}

export async function syncOyklaneData({ channelId, companyId }) {
  const channel = await getChannelForSync({ channelId, companyId });
  if (!channel) throw new HttpError(404, "Channel not found");
  if (channel.provider !== "oyklane") throw new HttpError(400, "Only Oyklane channels can use this sync");
  const apiKey = requireApiKey(channel);

  await updateChannelSyncState({
    channelId,
    companyId,
    status: "syncing",
    sync: { products: "running", orders: "running", inventory: "running", customers: "running", lastSyncAt: new Date(), lastError: undefined },
  });

  // Each resource is independent: a key without read_customers still syncs
  // its orders and products instead of failing the whole run.
  const [ordersResult, productsResult, customersResult] = await Promise.allSettled([
    fetchAll(apiKey, "/orders"),
    fetchAll(apiKey, "/products"),
    fetchAll(apiKey, "/customers"),
  ]);
  const value = (result) => (result.status === "fulfilled" ? result.value : []);
  const state = (result) => (result.status === "fulfilled" ? "idle" : "failed");

  // List rows may be summaries; orders need line items for fulfilment, so
  // fetch the detail for any order the list returned without them.
  const orders = await Promise.all(
    value(ordersResult).map(async (order) =>
      Array.isArray(order.line_items) ? order : (await oyklaneFetch(apiKey, `/orders/${order.id}`).catch(() => ({ data: order }))).data,
    ),
  );
  const products = value(productsResult);
  const customers = value(customersResult);

  await saveSyncedOyklaneData({ companyId, channelId, shop: channel.shop, orders, products, customers });

  const errors = [ordersResult, productsResult, customersResult].filter((r) => r.status === "rejected").map((r) => r.reason?.message);
  return updateChannelSyncState({
    channelId,
    companyId,
    status: "connected",
    sync: {
      orders: state(ordersResult),
      products: state(productsResult),
      inventory: state(productsResult),
      customers: state(customersResult),
      lastSyncAt: new Date(),
      lastError: errors.join("; ") || undefined,
    },
    metrics: oyklaneMetrics({ orders, products, customers }),
  });
}

// ─── Writes back to Oyklane ──────────────────────────────────────────────────

// Product edits from the Booster panel. Only changed fields are sent, as the
// API asks; stock goes through /inventory/adjust because product PATCH
// doesn't own quantities.
export async function updateOyklaneRecord({ channel, resource, record, payload }) {
  const apiKey = requireApiKey(channel);

  if (resource !== "products") {
    throw new HttpError(400, `Oyklane ${resource} can't be edited from here — the Oyklane API only allows product, stock and shipping updates.`);
  }

  const patch = {};
  for (const [from, to] of [["title", "title"], ["status", "status"], ["vendor", "vendor"], ["productType", "product_type"], ["description", "description"]]) {
    if (payload[from] !== undefined) patch[to] = String(payload[from]).trim();
  }
  if (payload.tags !== undefined) {
    patch.tags = Array.isArray(payload.tags) ? payload.tags : String(payload.tags).split(",").map((t) => t.trim()).filter(Boolean);
  }
  const variants = Array.isArray(payload.variants) ? payload.variants.filter((v) => v.externalId || v.id) : [];
  const priced = variants.filter((v) => v.price !== undefined);
  if (priced.length) patch.variants = priced.map((v) => ({ id: String(v.externalId || v.id), price: Number(v.price) }));

  if (Object.keys(patch).length) {
    await oyklaneFetch(apiKey, `/products/${encodeURIComponent(record.externalId)}`, { method: "PATCH", body: patch });
  }
  for (const variant of variants.filter((v) => v.inventoryQuantity !== undefined)) {
    await adjustOyklaneInventory({ channel, variantId: variant.externalId || variant.id, quantity: variant.inventoryQuantity, reason: "booster_edit" });
  }

  const { data: product } = await oyklaneFetch(apiKey, `/products/${encodeURIComponent(record.externalId)}`);
  const saved = await saveSyncedOyklaneData({ companyId: channel.companyId, channelId: channel._id, shop: channel.shop, products: [product] });
  return { resource, record: saved.products[0] };
}

export async function adjustOyklaneInventory({ channel, variantId, quantity, mode = "set", reason = "adjustment" }) {
  const qty = Number(quantity);
  if (!variantId || !Number.isFinite(qty) || qty < 0) throw new HttpError(400, "A variant and a non-negative quantity are required.");
  return oyklaneFetch(requireApiKey(channel), "/inventory/adjust", {
    method: "POST",
    body: { variant_id: String(variantId), mode, quantity: Math.round(qty), reason },
  });
}

// Marks the order shipped on Oyklane with its tracking number, mirroring
// markShopifyOrderFulfilled() for the fulfilment flow.
export async function markOyklaneOrderFulfilled({ channel, orderId, courierName, awbCode, notifyCustomer = true }) {
  if (!awbCode) throw new HttpError(400, "A tracking number is required to fulfil an Oyklane order.");
  return oyklaneFetch(requireApiKey(channel), `/orders/${encodeURIComponent(orderId)}/fulfillments`, {
    method: "POST",
    body: { courier: courierName || "Courier", tracking_number: String(awbCode), notify_customer: Boolean(notifyCustomer) },
  });
}

// ─── Creates (used by channel transfer) ──────────────────────────────────────

export async function listOyklaneProducts(channel) {
  return fetchAll(requireApiKey(channel), "/products");
}

export async function createOyklaneProduct(channel, product) {
  const { data } = await oyklaneFetch(requireApiKey(channel), "/products", { method: "POST", body: product });
  return data;
}

export async function createOyklaneCustomer(channel, customer) {
  const { data } = await oyklaneFetch(requireApiKey(channel), "/customers", { method: "POST", body: customer });
  return data;
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

// x-oyklane-signature = "sha256=" + hex HMAC-SHA256 of "{timestamp}.{raw body}"
// with the endpoint's whsec_ secret; stale timestamps are rejected so a
// captured delivery can't be replayed later.
export function verifyOyklaneWebhook({ secret, rawBody, headers }) {
  if (!secret) return false;
  const timestamp = Number(headers["x-oyklane-timestamp"]);
  const signature = String(headers["x-oyklane-signature"] || "").replace(/^sha256=/, "");
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
