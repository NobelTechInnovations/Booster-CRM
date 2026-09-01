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
// future Shopify/Amazon re-syncs.
export async function updateOrderAdjustments(orderId, { discount, extraCharge, note }) {
  return request(`/api/finance/orders/${orderId}/adjustments`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ discount, extraCharge, note }),
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

export async function listWhatsAppChannels() {
  return request("/api/whatsapp/channels", { headers: authHeaders() });
}

export async function listWhatsAppConversations() {
  return request("/api/whatsapp/conversations", { headers: authHeaders() });
}

export async function getWhatsAppMessages(conversationId) {
  return request(`/api/whatsapp/conversations/${conversationId}/messages`, { headers: authHeaders() });
}

export async function sendWhatsAppMessage(conversationId, text) {
  return request(`/api/whatsapp/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ text }),
  });
}

// Starts a conversation with a phone number that has no existing thread yet
// — the "send the first message" case sendWhatsAppMessage above can't cover
// since it needs an existing conversationId to key off.
export async function startWhatsAppConversation(to, text) {
  return request("/api/whatsapp/conversations/start", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ to, text }),
  });
}

// Fully removes the connection — the way to disconnect this number so a
// company can connect a different one.
export async function disconnectWhatsAppChannel(channelId) {
  return request(`/api/whatsapp/channels/${channelId}`, { method: "DELETE", headers: authHeaders() });
}
