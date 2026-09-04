const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
// Every brand's own Shopify OAuth app needs this exact URL in its "Redirect
// URLs" field — it never changes per brand, so it's safe to show directly in the UI.
export const SHOPIFY_OAUTH_REDIRECT_URI = `${API_URL}/api/channels/shopify/callback`;

// The inbound URL is safe to reconstruct/show any time (it's meant to be
// pasted into an external dashboard) — only the endpoint's secret is truly
// one-time, never returned again after creation.
export function webhookInboundUrl(token) {
  return `${API_URL}/api/webhooks/inbound/${token}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.message || "API request failed");
  }

  return body;
}

function authHeaders() {
  const session = getSession();
  if (!session?.token) {
    throw new Error("Login required");
  }

  return {
    Authorization: `Bearer ${session.token}`,
  };
}

async function ensureSession() {
  let session = getSession();

  if (!session?.token) {
    session = await createDevSession();
    saveSession(session);
  }

  return session;
}

export async function createDevSession() {
  return request("/api/auth/dev-login", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function saveSession(session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("commerceos_session", JSON.stringify(session));
}

export function getSession() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("commerceos_session");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_error) {
    window.localStorage.removeItem("commerceos_session");
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("commerceos_session");
}

export async function signupCompany(payload) {
  const session = await request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  saveSession(session);
  return session;
}

export async function loginCompany(payload) {
  const session = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (session.token) {
    saveSession(session);
  }
  return session;
}

// ─── Multi-brand: same login email, multiple companies ─────────────────────

export async function listMyCompanies() {
  return request("/api/auth/companies", {
    headers: authHeaders(),
  });
}

export async function createBrand(companyName) {
  const session = await request("/api/auth/companies", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ companyName }),
  });
  if (session.token) {
    saveSession(session);
  }
  return session;
}

export async function switchCompany(companyId) {
  const session = await request("/api/auth/switch-company", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ companyId }),
  });
  if (session.token) {
    saveSession(session);
  }
  return session;
}

export async function createShopifyConnection(shop) {
  const session = await ensureSession();

  return request("/api/channels/shopify/connect", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({ shop }),
  });
}

// Per-brand Shopify OAuth app credentials (Dev Dashboard "Custom" app's
// Client ID/Secret) — lets a brand OAuth through their own app instead of
// the shared one. Save once, then createShopifyConnection() uses it automatically.
export async function saveShopifySetup(payload) {
  const session = await ensureSession();

  return request("/api/channels/shopify/setup", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function saveAmazonSetup(payload) {
  const session = await ensureSession();

  return request("/api/channels/amazon/setup", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify(payload),
  });
}

// ─── Inbound Webhook Inbox (payments, abandoned carts, etc.) ────────────────

export async function listWebhookEndpoints() {
  return request("/api/webhooks/endpoints", { headers: authHeaders() });
}

export async function createWebhookEndpoint(payload) {
  const session = await ensureSession();
  return request("/api/webhooks/endpoints", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
    body: JSON.stringify(payload),
  });
}

export async function updateWebhookEndpoint(endpointId, payload) {
  const session = await ensureSession();
  return request(`/api/webhooks/endpoints/${endpointId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${session.token}` },
    body: JSON.stringify(payload),
  });
}

export async function deleteWebhookEndpoint(endpointId) {
  const session = await ensureSession();
  return request(`/api/webhooks/endpoints/${endpointId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.token}` },
  });
}

export async function listWebhookEvents(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/webhooks/events${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

export async function getWebhookEvent(eventId) {
  return request(`/api/webhooks/events/${eventId}`, { headers: authHeaders() });
}

// Events grouped by lead (cart/order/customer) — one row per lead instead of
// one per raw event, with follow-up tracking.
export async function listWebhookLeads(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/webhooks/leads${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

export async function getWebhookLeadEvents(leadId) {
  return request(`/api/webhooks/leads/${leadId}/events`, { headers: authHeaders() });
}

export async function logWebhookLeadFollowUp(leadId, payload) {
  const session = await ensureSession();
  return request(`/api/webhooks/leads/${leadId}/follow-up`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
    body: JSON.stringify(payload),
  });
}

// IP -> city/region + likely follow-up language, resolved lazily (cached
// server-side after the first call for a given lead).
export async function resolveLeadGeo(leadId) {
  const session = await ensureSession();
  return request(`/api/webhooks/leads/${leadId}/resolve-geo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
  });
}

export async function markLeadSeen(leadId) {
  return request(`/api/webhooks/leads/${leadId}/mark-seen`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function resolveLeadsGeoBulk(leadIds) {
  const session = await ensureSession();
  return request(`/api/webhooks/leads/resolve-geo-bulk`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ leadIds }),
  });
}

export async function createAmazonConnection() {
  const session = await ensureSession();

  return request("/api/channels/amazon/connect", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({}),
  });
}

export async function createAmazonPrivateConnection(payload) {
  const session = await ensureSession();

  return request("/api/channels/amazon/connect-private", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function listChannels() {
  return request("/api/channels", {
    headers: authHeaders(),
  });
}

export async function syncChannel(channelId) {
  return request(`/api/channels/${channelId}/sync`, {
    method: "POST",
    headers: authHeaders(),
  });
}

// Soft-disconnects a connected channel (Shopify, Amazon, etc.) — clears its
// stored access token and flips status to "disconnected" server-side
// (channel.repo.js's disconnectChannel), so orders/products already synced
// stay put, only the live connection is severed. Reconnecting later creates
// a fresh OAuth grant rather than resuming this one.
export async function disconnectChannel(channelId) {
  return request(`/api/channels/${channelId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

// Pauses (or resumes) auto-sync for a channel without touching its
// credentials — different from disconnectChannel above, which clears the
// access token and needs a real reconnect. See setChannelActive on the
// backend for exactly what "inactive" excludes.
export async function setChannelActive(channelId, active) {
  return request(`/api/channels/${channelId}/status`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active }),
  });
}

// Re-attaches a Shopify app's Client ID/Secret to an already-connected
// channel — no reconnect needed, see updateChannelAppCredentials on the
// backend for why that's safe.
export async function updateChannelAppCredentials(channelId, { apiKey, apiSecret }) {
  return request(`/api/channels/${channelId}/app-credentials`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ apiKey, apiSecret }),
  });
}

// ─── Store-to-store migration ────────────────────────────────────────────────
// Copies order/customer data from one connected Shopify channel to another,
// inside our own database only — see migration.service.js on the backend
// for the full contract (idempotent, never touches Shopify itself).
export async function copyStoreData({ sourceChannelId, targetChannelId, includeCustomers = true, includeOrders = true }) {
  return request("/api/migration/copy", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ sourceChannelId, targetChannelId, includeCustomers, includeOrders }),
  });
}

// The one migration step that DOES write to a real Shopify store — pushes
// previously-copied customers (never orders) onto the target channel's real
// Shopify admin. See pushMigratedCustomersToShopify's own comment for why.
export async function pushMigratedCustomersToShopify(targetChannelId) {
  return request("/api/migration/push-customers", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ targetChannelId }),
  });
}

// Turns marketing consent ON for every real (pushed) customer on the
// target channel — a customer created/matched via pushMigratedCustomersToShopify
// lands with marketing consent off by default, since Shopify has no
// "carry over consent from another store" concept.
export async function enableMarketingForPushedCustomers(targetChannelId) {
  return request("/api/migration/enable-marketing", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ targetChannelId }),
  });
}

export async function getChannelDashboard({ period } = {}) {
  const query = period ? `?period=${encodeURIComponent(period)}` : "";
  return request(`/api/channels/dashboard${query}`, {
    headers: authHeaders(),
  });
}

export async function listSyncedRecords(resource) {
  return request(`/api/channels/records/${resource}`, {
    headers: authHeaders(),
  });
}

export async function listAllOrders() {
  return request("/api/channels/records/orders", {
    headers: authHeaders(),
  });
}

export async function updateSyncedRecord(resource, recordId, payload) {
  return request(`/api/channels/records/${resource}/${recordId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function getProductMappingOptions() {
  return request("/api/channels/product-mappings/options", {
    headers: authHeaders(),
  });
}

export async function listProductMappings() {
  return request("/api/channels/product-mappings", {
    headers: authHeaders(),
  });
}

export async function saveProductMapping(payload) {
  return request("/api/channels/product-mappings", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function getCompanyProfile() {
  return request("/api/company", {
    headers: authHeaders(),
  });
}

export async function updateCompanyProfile(payload) {
  const result = await request("/api/company", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  const session = getSession();
  if (session) {
    saveSession({ ...session, company: result.company });
  }

  return result;
}

// Brand logo shown on the public order-tracking page and every invoice
// (PDF + print). logoDataUrl is a data: URI (see FileReader usage in
// company-view.jsx) — pass "" to remove the logo.
export async function updateCompanyLogo(logoDataUrl) {
  const result = await request("/api/company/logo", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ logoDataUrl }),
  });

  const session = getSession();
  if (session) {
    saveSession({ ...session, company: result.company });
  }

  return result;
}

export async function updateCompanyKyc(payload) {
  const result = await request("/api/company/kyc", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  const session = getSession();
  if (session) {
    saveSession({ ...session, company: result.company });
  }

  return result;
}

// ─── Data export request → admin approval → download ────────────────────────

export async function requestDataExport() {
  return request("/api/company/data-export/request", {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function getMyDataExportStatus() {
  return request("/api/company/data-export", { headers: authHeaders() });
}

// Bypasses request() (JSON-only) — same blob-download pattern as
// downloadLabelsBulk above. 403s with a clear message unless the latest
// request has actually been approved by a platform admin.
export async function downloadMyDataExport() {
  const res = await fetch(`${API_URL}/api/company/data-export/download`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || "Failed to download your data");
  }
  const disposition = res.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  const blob = await res.blob();
  return { blob, filename: filenameMatch?.[1] || "my-data.zip" };
}

export async function updateTaxSettings(payload) {
  const result = await request("/api/company/tax-settings", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const session = getSession();
  if (session) saveSession({ ...session, company: result.company });
  return result;
}

export async function updateNotificationSettings(payload) {
  const result = await request("/api/company/notification-settings", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const session = getSession();
  if (session) saveSession({ ...session, company: result.company });
  return result;
}

export async function changeOwnPassword(payload) {
  return request("/api/users/me/password", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

// ─── Generic Multi-Provider Shipping APIs ────────────────────────────────────

export async function listShippingProviders() {
  return request("/api/shipping/providers");
}

export async function listShippingChannels() {
  return request("/api/shipping/channels", {
    headers: authHeaders(),
  });
}

export async function connectShippingProvider(provider, payload) {
  return request(`/api/shipping/${provider}/connect`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function syncWarehouses(provider) {
  return request(`/api/shipping/${provider}/warehouses/sync`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function listWarehouses(provider) {
  const query = provider ? `?provider=${provider}` : "";
  return request(`/api/shipping/warehouses${query}`, {
    headers: authHeaders(),
  });
}

export async function createWarehouse(provider, payload) {
  return request(`/api/shipping/${provider}/warehouses`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

// For providers with no "list warehouses" API (e.g. Velocity) — registers a
// warehouse the user already created on the provider's own dashboard, by ID,
// without creating a duplicate there.
export async function linkWarehouse(provider, payload) {
  return request(`/api/shipping/${provider}/warehouses/link`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function checkServiceability(provider, payload) {
  return request(`/api/shipping/${provider}/serviceability`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function cancelShipment(provider, awbs, orderIds = []) {
  return request(`/api/shipping/${provider}/orders/cancel`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ awbs, orderIds }),
  });
}

export async function trackShipment(provider, awbs) {
  return request(`/api/shipping/${provider}/orders/track`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ awbs }),
  });
}

export async function listAllShipments(provider) {
  const query = provider ? `?provider=${provider}` : "";
  return request(`/api/shipping/shipments${query}`, {
    headers: authHeaders(),
  });
}

// ─── Automated Order Fulfillment APIs ────────────────────────────────────────

export async function listFulfillmentOrders() {
  return request("/api/fulfillment/orders", {
    headers: authHeaders(),
  });
}

export async function listFulfilledOrders() {
  return request("/api/fulfillment/orders/fulfilled", {
    headers: authHeaders(),
  });
}

export async function shipFulfillmentOrder(payload) {
  return request("/api/fulfillment/ship", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

// Ships many orders at once through the same provider + warehouse, courier
// auto-assigned per order — for assigning a batch of orders to a shipment
// in one action.
export async function shipFulfillmentOrdersBulk({ orderIds, provider, warehouseId }) {
  return request("/api/fulfillment/ship-bulk", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ orderIds, provider, warehouseId }),
  });
}

// Creates an order directly in the panel (walk-in, phone/WhatsApp order) —
// isDraft:true saves it as freely-editable scratch space that never
// touches Shopify until finalized via finalizeDraftOrder() below.
export async function createLocalFulfillmentOrder({ customer, shippingAddress, lineItems, isCOD, note, isDraft }) {
  return request("/api/fulfillment/orders/local", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ customer, shippingAddress, lineItems, isCOD, note, isDraft }),
  });
}

// Edits a draft's own contents — only valid while it's still a draft.
export async function updateDraftFulfillmentOrder(orderId, { customer, shippingAddress, lineItems, isCOD, note }) {
  return request(`/api/fulfillment/orders/${orderId}/draft`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ customer, shippingAddress, lineItems, isCOD, note }),
  });
}

// Permanently discards a draft that never went anywhere.
export async function discardDraftOrder(orderId) {
  return request(`/api/fulfillment/orders/${orderId}/discard-draft`, {
    method: "POST",
    headers: authHeaders(),
  });
}

// Pushes a draft order for real onto Shopify — the only thing that ever
// turns a draft into a synced order. Requires a connected Shopify channel.
export async function finalizeDraftOrder(orderId) {
  return request(`/api/channels/orders/${orderId}/finalize-draft`, {
    method: "POST",
    headers: authHeaders(),
  });
}

// Downloads one merged PDF of every selected shipment's label and marks
// them downloaded. Bypasses request() (JSON-only) since this returns a
// binary PDF — returns a Blob plus the raw response headers so the caller
// can trigger a browser download and read which labels (if any) were
// skipped (X-Labels-Skipped).
export async function downloadLabelsBulk(shipmentIds) {
  const res = await fetch(`${API_URL}/api/fulfillment/labels/bulk-download`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ shipmentIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || "Failed to download labels");
  }
  const skippedHeader = res.headers.get("X-Labels-Skipped");
  const blob = await res.blob();
  return { blob, skipped: skippedHeader ? JSON.parse(skippedHeader) : [] };
}

export async function cancelFulfillmentOrder(orderId, reason = "customer") {
  return request(`/api/fulfillment/orders/${orderId}/cancel`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
}

// Cancels just the courier shipment (+ Shopify fulfillment, best-effort) and
// moves the order back to unfulfilled so it can be shipped again — distinct
// from cancelFulfillmentOrder() above (cancels the whole order) and from
// cancelShipment(provider, awbs) below (raw AWB-level courier cancel).
export async function cancelOrderShipment(orderId) {
  return request(`/api/fulfillment/orders/${orderId}/cancel-shipment`, {
    method: "POST",
    headers: authHeaders(),
  });
}

// Pulls live tracking status for one order's shipment right now instead of
// waiting for the 15-minute background job — reverts to unfulfilled if the
// courier reports the shipment cancelled on their own dashboard.
export async function syncShipmentStatus(orderId) {
  return request(`/api/fulfillment/orders/${orderId}/sync-shipment-status`, {
    method: "POST",
    headers: authHeaders(),
  });
}

// (Re-)push tracking number + courier to Shopify for an already-shipped order.
// Safe: only creates a Shopify fulfillment record, never modifies order data.
export async function pushTrackingToShopify(orderId) {
  return request(`/api/fulfillment/orders/${orderId}/push-tracking`, {
    method: "POST",
    headers: authHeaders(),
  });
}

// Marks an order shipped by hand — for a courier booked directly outside
// this panel. No real Shipment record is created; this just records the
// tracking details the seller already has.
export async function markOrderShippedManually(orderId, { trackingNumber, trackingCompany, trackingUrl }) {
  return request(`/api/fulfillment/orders/${orderId}/mark-shipped`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ trackingNumber, trackingCompany, trackingUrl }),
  });
}

// Manual delivery-status toggle — delivered:true marks delivered,
// delivered:false reverts back to shipped.
export async function updateOrderDeliveryStatus(orderId, delivered) {
  return request(`/api/fulfillment/orders/${orderId}/delivery-status`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ delivered }),
  });
}

export async function listActiveShipments() {
  return request("/api/fulfillment/shipments/active", {
    headers: authHeaders(),
  });
}

// ─── Backward Compatibility Wrappers for Velocity ───────────────────────────

export async function connectVelocity(payload) {
  return connectShippingProvider("velocity", payload);
}

export async function createVelocityWarehouse(payload) {
  return createWarehouse("velocity", payload);
}

export async function listVelocityWarehouses() {
  return listWarehouses("velocity");
}

export async function checkVelocityServiceability(payload) {
  return checkServiceability("velocity", payload);
}

export async function createVelocityForwardOrder(payload) {
  return request("/api/shipping/velocity/orders/forward", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function createVelocityReverseOrder(payload) {
  return request("/api/shipping/velocity/orders/reverse", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function cancelVelocityOrder(awbs) {
  return cancelShipment("velocity", awbs);
}

export async function trackVelocityOrder(awbs) {
  return trackShipment("velocity", awbs);
}

export async function listVelocityShipments() {
  return listAllShipments("velocity");
}

// ─── User Management ─────────────────────────────────────────────────────────

export async function listUsers() {
  return request("/api/users", {
    headers: authHeaders(),
  });
}

export async function createUser(payload) {
  return request("/api/users", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateUser(userId, payload) {
  return request(`/api/users/${userId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

// ─── Customer CRM / Follow-Up APIs ───────────────────────────────────────────

export async function addCustomerFollowUp(customerId, payload) {
  return request(`/api/channels/customers/${customerId}/follow-up`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function getUpcomingFollowUps() {
  return request("/api/channels/customers/upcoming-followups", {
    headers: authHeaders(),
  });
}

export async function createCustomerOrder(customerId, payload) {
  return request(`/api/channels/customers/${customerId}/create-order`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

// Creates a customer directly in Shopify (mirrors Shopify's own "New
// customer" form) and syncs it back into our own Customers list.
export async function createCustomer(payload) {
  return request("/api/channels/customers", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

// ─── Inventory: SKU cost sheet (buying price, MRP, shipping, margin) ────────

export async function listSkuCosts() {
  return request("/api/inventory/costs", { headers: authHeaders() });
}

export async function saveSkuCost(sku, payload) {
  return request(`/api/inventory/costs/${encodeURIComponent(sku)}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function deleteSkuCost(sku) {
  return request(`/api/inventory/costs/${encodeURIComponent(sku)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

// ─── Inventory: Packaging Assets (jars, stickers, etc) ─────────────────────

export async function listAssets() {
  return request("/api/inventory/assets", { headers: authHeaders() });
}

export async function createAsset(payload) {
  return request("/api/inventory/assets", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateAsset(assetId, payload) {
  return request(`/api/inventory/assets/${assetId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function deleteAsset(assetId) {
  return request(`/api/inventory/assets/${assetId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function adjustAssetStock(assetId, { delta, reason }) {
  return request(`/api/inventory/assets/${assetId}/adjust`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ delta, reason }),
  });
}

export async function listAssetMappings() {
  return request("/api/inventory/assets/mappings", { headers: authHeaders() });
}

export async function saveAssetMapping(payload) {
  return request("/api/inventory/assets/mappings", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function deleteAssetMapping(sku) {
  return request(`/api/inventory/assets/mappings/${encodeURIComponent(sku)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

// ─── Automation ───────────────────────────────────────────────────────────

export async function listAutomationRules() {
  return request("/api/automation/rules", { headers: authHeaders() });
}

export async function createAutomationRule(payload) {
  return request("/api/automation/rules", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateAutomationRule(ruleId, payload) {
  return request(`/api/automation/rules/${ruleId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function toggleAutomationRule(ruleId, isActive) {
  return request(`/api/automation/rules/${ruleId}/toggle`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ isActive }),
  });
}

export async function runAutomationRule(ruleId) {
  return request(`/api/automation/rules/${ruleId}/run`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function deleteAutomationRule(ruleId) {
  return request(`/api/automation/rules/${ruleId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

// The known built-in trigger keys — a company can still type its own
// custom trigger name instead (see automation-rule.model.js's own comment
// on why trigger isn't a hard enum).
export async function listAutomationTriggers() {
  return request("/api/automation/triggers", { headers: authHeaders() });
}

// ─── Email (SMTP connect + templates + automation send log) ────────────────

export async function connectEmailChannel(payload) {
  return request("/api/channels/email/connect", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function testEmailChannel() {
  return request("/api/channels/email/test", { method: "POST", headers: authHeaders() });
}

export async function listEmailTemplates() {
  return request("/api/email/templates", { headers: authHeaders() });
}

export async function createEmailTemplate(payload) {
  return request("/api/email/templates", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateEmailTemplate(templateId, payload) {
  return request(`/api/email/templates/${templateId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function deleteEmailTemplate(templateId) {
  return request(`/api/email/templates/${templateId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function testSendEmailTemplate(templateId) {
  return request(`/api/email/templates/${templateId}/test-send`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function listEmailLogs(limit = 100) {
  return request(`/api/email/logs?limit=${limit}`, { headers: authHeaders() });
}

// ─── Reports ──────────────────────────────────────────────────────────────

export async function listReportTypes() {
  return request("/api/reports/types", { headers: authHeaders() });
}

export async function getReport(type, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/reports/${type}${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

// ─── Finance: Summary & Sales Analytics ──────────────────────────────────────

export async function getFinanceSummary(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/finance/summary${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

export async function getSalesAnalytics(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/finance/sales-analytics${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

// CM1/CM2/EBITDA contribution-margin waterfall, built from the same numbers
// as getFinanceSummary — see getUnitEconomics() in finance.repo.js.
export async function getUnitEconomics(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/finance/unit-economics${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

// Combined revenue + expenses + Meta ad spend (GST-inclusive), same period buckets.
export async function getFinanceTrend(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/finance/trend${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

// The order rows behind the "Refunded/Returned Revenue" KPI.
export async function listRefundedOrders(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/finance/refunds${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

// The order rows behind the "Shipping Cost" KPI — for verifying/manually
// correcting per-order shipping cost.
export async function listShippingCosts(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/finance/shipping-costs${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

export async function updateOrderShippingCost(orderId, shippingCost) {
  return request(`/api/finance/orders/${orderId}/shipping-cost`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ shippingCost }),
  });
}

// Manual discount/extra-charge adjustment on an order — layered on top of
// the channel-reported total rather than overwriting it, so it survives
// future Shopify/Amazon re-syncs. isCOD is optional — pass it to also
// correct the order's payment mode in the same request.
export async function updateOrderAdjustments(orderId, { discount, extraCharge, note, isCOD }) {
  return request(`/api/finance/orders/${orderId}/adjustments`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ discount, extraCharge, note, isCOD }),
  });
}

// "confirmed" | "declined" | "pending" — did the customer actually confirm
// this order (usually via a follow-up call/WhatsApp) before it's trusted
// for fulfillment.
export async function updateOrderConfirmation(orderId, status) {
  return request(`/api/finance/orders/${orderId}/confirmation`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
}

// Panel-only "picked up for packing / label prep" flag — a middle stage
// between confirmed and actually shipped. Never touches Shopify.
export async function updateOrderFulfillmentAssignment(orderId, assigned) {
  return request(`/api/finance/orders/${orderId}/fulfillment-assignment`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ assigned }),
  });
}

// ─── Finance: Vendors ─────────────────────────────────────────────────────────

export async function listVendors() {
  return request("/api/finance/vendors", { headers: authHeaders() });
}

export async function createVendor(payload) {
  return request("/api/finance/vendors", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function updateVendor(vendorId, payload) {
  return request(`/api/finance/vendors/${vendorId}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function deleteVendor(vendorId) {
  return request(`/api/finance/vendors/${vendorId}`, { method: "DELETE", headers: authHeaders() });
}

// ─── Finance: Purchases (raw material / packaging) ───────────────────────────

export async function listPurchases(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/finance/purchases${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

export async function createPurchase(payload) {
  return request("/api/finance/purchases", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function updatePurchase(purchaseId, payload) {
  return request(`/api/finance/purchases/${purchaseId}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function deletePurchase(purchaseId) {
  return request(`/api/finance/purchases/${purchaseId}`, { method: "DELETE", headers: authHeaders() });
}

// ─── Finance: Expenses ────────────────────────────────────────────────────────

export async function listExpenses(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/finance/expenses${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

export async function createExpense(payload) {
  return request("/api/finance/expenses", { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function updateExpense(expenseId, payload) {
  return request(`/api/finance/expenses/${expenseId}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function deleteExpense(expenseId) {
  return request(`/api/finance/expenses/${expenseId}`, { method: "DELETE", headers: authHeaders() });
}

export async function getExpensesByPartner(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/finance/expenses/by-partner${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

// ─── Ads: Meta ────────────────────────────────────────────────────────────────

export async function connectMetaAds() {
  return request("/api/ads/meta/connect", { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
}

export async function listAdsChannels() {
  return request("/api/ads/channels", { headers: authHeaders() });
}

export async function listMetaAdAccounts(channelId) {
  return request(`/api/ads/meta/${channelId}/ad-accounts`, { headers: authHeaders() });
}

export async function selectMetaAdAccount(channelId, payload) {
  return request(`/api/ads/meta/${channelId}/select-account`, { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function syncAdInsights(channelId, payload = {}) {
  return request(`/api/ads/${channelId}/sync`, { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

export async function recomputeAdAttribution(channelId, payload = {}) {
  return request(`/api/ads/${channelId}/recompute-attribution`, { method: "POST", headers: authHeaders(), body: JSON.stringify(payload) });
}

// Live "what's it at right now" check — never persisted. The official figure
// only ever moves via the daily 8am sync.
export async function getMetaAdSpendToday(channelId) {
  return request(`/api/ads/${channelId}/spend-today`, { headers: authHeaders() });
}

// Meta's own reported age/gender delivery breakdown — for targeting decisions.
export async function getAdsDemographics(channelId, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/ads/${channelId}/demographics${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

export async function getAdsSummary(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/ads/summary${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

export async function listAdInsights(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/ads/insights${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

export async function linkAdProduct(insightId, productTitle) {
  return request(`/api/ads/insights/${insightId}/link-product`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ productTitle }),
  });
}

// ─── Social: Instagram / Facebook ───────────────────────────────────────────

export async function connectMetaSocial() {
  return request("/api/social/meta/connect", { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
}

export async function listSocialChannels() {
  return request("/api/social/channels", { headers: authHeaders() });
}

export async function syncSocialPosts(channelId) {
  return request(`/api/social/${channelId}/sync`, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
}

export async function listSocialPosts(channelId, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/social/${channelId}/posts${query ? `?${query}` : ""}`, { headers: authHeaders() });
}

export async function listPostComments(postId, { refresh = true } = {}) {
  const query = refresh === false ? "?refresh=false" : "";
  return request(`/api/social/posts/${postId}/comments${query}`, { headers: authHeaders() });
}

export async function replyToSocialComment(commentId, { channelId, postId, message }) {
  return request(`/api/social/comments/${commentId}/reply`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ channelId, postId, message }),
  });
}

// Fully removes the connection — the way to disconnect and connect a
// different Instagram/Facebook account entirely.
export async function disconnectSocialChannel(channelId) {
  return request(`/api/social/channels/${channelId}`, { method: "DELETE", headers: authHeaders() });
}

export async function createSocialPost(channelId, { platforms, caption, mediaUrl }) {
  return request(`/api/social/${channelId}/posts`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ platforms, caption, mediaUrl }),
  });
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────

export async function connectWhatsApp({ phoneNumberId, whatsappBusinessAccountId, accessToken }) {
  return request("/api/whatsapp/connect", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ phoneNumberId, whatsappBusinessAccountId, accessToken }),
  });
}

// "Continue with Facebook" — a full-page redirect through Meta's own
// WhatsApp signup, same pattern as connectMetaSocial. No token/ID typing.
export async function connectWhatsAppEmbedded() {
  return request("/api/whatsapp/meta/connect", { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
}

// Finishes signup once the company picks a number on the "choose" screen —
// only reached when the redirect callback found more than one.
export async function finalizeWhatsAppSignup(selectionToken, phoneNumberId) {
  return request("/api/whatsapp/meta/finalize", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ selectionToken, phoneNumberId }),
  });
}

export async function listWhatsAppChannels() {
  return request("/api/whatsapp/channels", { headers: authHeaders() });
}

export async function listWhatsAppConversations() {
  return request("/api/whatsapp/conversations", { headers: authHeaders() });
}

// Clears a conversation and its messages from this app's own history —
// doesn't touch Meta or the customer's own WhatsApp, only this panel's copy.
export async function deleteWhatsAppConversation(conversationId) {
  return request(`/api/whatsapp/conversations/${conversationId}`, { method: "DELETE", headers: authHeaders() });
}

export async function getWhatsAppMessages(conversationId) {
  return request(`/api/whatsapp/conversations/${conversationId}/messages`, { headers: authHeaders() });
}

export async function sendWhatsAppMessage(conversationId, text, { mediaUrl, mediaId, mediaType } = {}) {
  return request(`/api/whatsapp/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ text, mediaUrl, mediaId, mediaType }),
  });
}

// Starts a conversation with a phone number that has no existing thread yet
// — the "send the first message" case sendWhatsAppMessage above can't cover
// since it needs an existing conversationId to key off. Only works if that
// number has messaged this WhatsApp number before, or within the last 24
// hours — otherwise use startWhatsAppTemplateConversation below.
export async function startWhatsAppConversation(to, text, { mediaUrl, mediaId, mediaType } = {}) {
  return request("/api/whatsapp/conversations/start", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ to, text, mediaUrl, mediaId, mediaType }),
  });
}

// Uploads an actual file straight to Meta's WhatsApp media store (not this
// app's own storage) and returns { mediaId, mediaType } to attach to a send.
// Raw fetch, not the shared request() helper — a file upload needs
// multipart/form-data, and the browser has to set that Content-Type itself
// (with its boundary) rather than the JSON one request() always adds.
export async function uploadWhatsAppMedia(file) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_URL}/api/whatsapp/media/upload`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(),
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Upload failed");
  return body;
}

// The approved-templates list from Meta's WhatsApp Manager — only these can
// message a number that has never messaged in first (WhatsApp platform
// rule, not something this app can bypass with free text).
export async function listWhatsAppTemplates() {
  return request("/api/whatsapp/templates", { headers: authHeaders() });
}

// Starts a genuinely cold conversation using one of those approved
// templates. bodyParams fills the template's {{1}}, {{2}}... placeholders,
// in order.
// bodyText is the template's own raw BODY text (with {{1}}, {{2}}...
// placeholders) — passed through so the backend can render what actually
// gets shown in our own chat history instead of just the template's name.
export async function startWhatsAppTemplateConversation(to, templateName, language, bodyParams = [], bodyText = "") {
  return request("/api/whatsapp/conversations/start-template", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ to, templateName, language, bodyParams, bodyText }),
  });
}

// Backend-proxied URL for an inbound attachment — Meta's own media link
// needs a Bearer token and expires in minutes, so it's fetched fresh
// through the backend on every load instead of being usable directly.
// Carries the auth token as a query param since <img src>/<a href> can't
// set an Authorization header.
export function whatsappMediaUrl(mediaId) {
  const session = getSession();
  const token = session?.token ? `?token=${encodeURIComponent(session.token)}` : "";
  return `${API_URL}/api/whatsapp/media/${mediaId}${token}`;
}

// Fully removes the connection — the way to disconnect this number so a
// company can connect a different one.
export async function disconnectWhatsAppChannel(channelId) {
  return request(`/api/whatsapp/channels/${channelId}`, { method: "DELETE", headers: authHeaders() });
}

// Retries Meta's "subscribe app to WhatsApp Business Account" step without
// a full reconnect — fixes "(#200) You do not have the necessary
// permissions to send messages on behalf of this WhatsApp Business Account"
// on a connection made before this step was added.
// Generates the order's Tax Invoice as a real PDF server-side and sends it
// as a WhatsApp document to the order's phone number — needs a 24-hour
// customer-service window open with that number (a WhatsApp platform rule,
// not something this app can route around); if it's not, the error message
// here is Meta's own rejection reason.
export async function sendOrderInvoiceWhatsApp(orderId) {
  return request(`/api/whatsapp/orders/${orderId}/send-invoice`, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
}

export async function fixWhatsAppPermissions() {
  return request("/api/whatsapp/meta/fix-permissions", { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
}

// ─── Smart WhatsApp — separate, unofficial (WhatsApp Web-paired) integration.
// Same shape as the functions above, just against /api/smart-whatsapp
// instead of /api/whatsapp — kept as its own set of calls rather than
// parameterizing the existing ones, matching the "genuinely separate
// feature" this shipped as.

export async function connectSmartWhatsApp() {
  return request("/api/smart-whatsapp/connect", { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
}

export async function getSmartWhatsAppStatus() {
  return request("/api/smart-whatsapp/status", { headers: authHeaders() });
}

export async function disconnectSmartWhatsApp() {
  return request("/api/smart-whatsapp/disconnect", { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
}

export async function listSmartWhatsAppConversations() {
  return request("/api/smart-whatsapp/conversations", { headers: authHeaders() });
}

export async function deleteSmartWhatsAppConversation(conversationId) {
  return request(`/api/smart-whatsapp/conversations/${conversationId}`, { method: "DELETE", headers: authHeaders() });
}

export async function getSmartWhatsAppMessages(conversationId) {
  return request(`/api/smart-whatsapp/conversations/${conversationId}/messages`, { headers: authHeaders() });
}

export async function sendSmartWhatsAppMessage(conversationId, text, { mediaUrl, mediaType } = {}) {
  return request(`/api/smart-whatsapp/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ text, mediaUrl, mediaType }),
  });
}

// No 24-hour-window / template restriction here — unlike the Cloud API,
// Smart WhatsApp is a real phone-style connection that can message any
// number at any time, the same as texting someone new from your own phone.
export async function startSmartWhatsAppConversation(to, text, { mediaUrl, mediaType } = {}) {
  return request("/api/smart-whatsapp/conversations/start", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ to, text, mediaUrl, mediaType }),
  });
}

export function smartWhatsappMediaUrl(messageId) {
  const session = getSession();
  const token = session?.token ? `?token=${encodeURIComponent(session.token)}` : "";
  return `${API_URL}/api/smart-whatsapp/media/${messageId}${token}`;
}

// ─── Billing — company-side plan/wallet/upgrade, backed by Razorpay ────────

export async function listBillingPlans() {
  return request("/api/billing/plans", { headers: authHeaders() });
}

export async function getMyBilling() {
  return request("/api/billing/me", { headers: authHeaders() });
}

export async function rechargeWallet(amount) {
  return request("/api/billing/wallet/recharge", { method: "POST", headers: authHeaders(), body: JSON.stringify({ amount }) });
}

export async function upgradePlan(planId) {
  return request("/api/billing/upgrade", { method: "POST", headers: authHeaders(), body: JSON.stringify({ planId }) });
}

export async function verifyPayment({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  return request("/api/billing/verify", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ razorpayOrderId, razorpayPaymentId, razorpaySignature }),
  });
}

// ─── Public order tracking (no auth) ─────────────────────────────────────────
// Customer-facing "track my order" surface, scoped by the company's own
// public slug — deliberately no authHeaders() here at all, this is meant to
// be called by an anonymous visitor. See public-tracking.repo.js on the
// backend for exactly what's (and isn't) returned.

// Just the brand identity — loaded on page mount, before any search, so
// the page shows the real store name/logo immediately instead of a
// generic placeholder until the visitor enters a phone number.
export async function getPublicCompanyBranding(companySlug) {
  return request(`/api/public/track/${encodeURIComponent(companySlug)}/branding`);
}

// Phone or email — either works, same flexibility as the support-ticket
// lookup below.
export async function listPublicOrdersByContact(companySlug, { phone, email } = {}) {
  return request(`/api/public/track/${encodeURIComponent(companySlug)}/orders?${contactQuery(phone, email)}`);
}

export async function getPublicOrderDetail(companySlug, orderId, { phone, email } = {}) {
  return request(`/api/public/track/${encodeURIComponent(companySlug)}/orders/${encodeURIComponent(orderId)}?${contactQuery(phone, email)}`);
}

// ─── Public Support Tickets (no login) ──────────────────────────────────────
// Same no-auth, company-slug-scoped shape as the tracking functions above —
// see public-support.routes.js on the backend for exactly what's returned.

function contactQuery(phone, email) {
  const params = new URLSearchParams();
  if (phone) params.set("phone", phone);
  if (email) params.set("email", email);
  return params.toString();
}

export async function listPublicTicketsByContact(companySlug, phone, email) {
  return request(`/api/public/support/${encodeURIComponent(companySlug)}/tickets?${contactQuery(phone, email)}`);
}

export async function getPublicTicketDetail(companySlug, ticketId, phone, email) {
  return request(`/api/public/support/${encodeURIComponent(companySlug)}/tickets/${encodeURIComponent(ticketId)}?${contactQuery(phone, email)}`);
}

export async function createSupportTicket(companySlug, payload) {
  return request(`/api/public/support/${encodeURIComponent(companySlug)}/tickets`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// The three customer-side ticket actions — comment (always available),
// close (self-close, or confirming a staff-requested pending close), and
// reopen (only valid from closed). Each carries phone/email in the body
// the same way the lookup GETs carry it in the query — same re-validation
// contract on the backend.
export async function commentOnPublicTicket(companySlug, ticketId, { phone, email, message }) {
  return request(`/api/public/support/${encodeURIComponent(companySlug)}/tickets/${encodeURIComponent(ticketId)}/comment`, {
    method: "POST",
    body: JSON.stringify({ phone, email, message }),
  });
}

export async function closePublicTicket(companySlug, ticketId, { phone, email }) {
  return request(`/api/public/support/${encodeURIComponent(companySlug)}/tickets/${encodeURIComponent(ticketId)}/close`, {
    method: "POST",
    body: JSON.stringify({ phone, email }),
  });
}

export async function reopenPublicTicket(companySlug, ticketId, { phone, email }) {
  return request(`/api/public/support/${encodeURIComponent(companySlug)}/tickets/${encodeURIComponent(ticketId)}/reopen`, {
    method: "POST",
    body: JSON.stringify({ phone, email }),
  });
}

// ─── Support Tickets (company panel, authenticated) ─────────────────────────

export async function listSupportTickets(status) {
  return request(`/api/support/tickets${status ? `?status=${encodeURIComponent(status)}` : ""}`, { headers: authHeaders() });
}

export async function getSupportTicket(ticketId) {
  return request(`/api/support/tickets/${ticketId}`, { headers: authHeaders() });
}

export async function replySupportTicket(ticketId, message) {
  return request(`/api/support/tickets/${ticketId}/reply`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ message }),
  });
}

export async function updateSupportTicketStatus(ticketId, status) {
  return request(`/api/support/tickets/${ticketId}/status`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
}
