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

export async function checkServiceability(provider, payload) {
  return request(`/api/shipping/${provider}/serviceability`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function cancelShipment(provider, awbs) {
  return request(`/api/shipping/${provider}/orders/cancel`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ awbs }),
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

export async function cancelFulfillmentOrder(orderId, reason = "customer") {
  return request(`/api/fulfillment/orders/${orderId}/cancel`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
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

// Combined revenue + expenses + Meta ad spend (GST-inclusive), same period buckets.
export async function getFinanceTrend(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/api/finance/trend${query ? `?${query}` : ""}`, { headers: authHeaders() });
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
