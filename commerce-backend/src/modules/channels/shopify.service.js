import crypto from "node:crypto";
import { URLSearchParams } from "node:url";
import { env } from "../../config/env.js";
import {
  getChannelForSync,
  updateChannelSyncState,
  upsertShopifyChannel,
  addShopifyWebhookRecord,
} from "../../repositories/channel.repo.js";
import { saveSyncedShopifyData, getCommerceRecordForUpdate } from "../../repositories/order.repo.js";
import { getShopifyConfig } from "../../repositories/company.repo.js";
import { HttpError } from "../../utils/http-error.js";
import { createOauthState, readOauthState } from "../../utils/oauth-state.js";

// Every brand can OAuth through THEIR OWN Shopify app (Dev Dashboard →
// "Custom" distribution) instead of the one shared app in env.shopify.* —
// falls back to the shared app when a company hasn't set up its own, so
// existing OAuth connections (e.g. Sukirti) are unaffected. The redirect URI
// is always the same single backend callback regardless of which app is
// used — each brand just needs to whitelist that one URL inside their own
// app's "Redirect URLs" field once, no coordination with us needed.
async function getEffectiveShopifyAppConfig(companyId) {
  const custom = await getShopifyConfig(companyId, { includeSecret: true });
  if (custom?.apiKey && custom?.apiSecret) {
    return { apiKey: custom.apiKey, apiSecret: custom.apiSecret, custom: true };
  }
  return { apiKey: env.shopify.apiKey, apiSecret: env.shopify.apiSecret, custom: false };
}

export function normalizeShop(shop) {
  const cleaned = String(shop || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (!cleaned) {
    throw new HttpError(400, "Shop is required");
  }

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned)) {
    throw new HttpError(400, "Shop must be a valid myshopify.com domain");
  }

  return cleaned;
}

export async function buildShopifyInstallUrl({ shop, companyId, userId }) {
  if (!shop && env.shopify.installUrl) {
    return env.shopify.installUrl;
  }

  const config = await getEffectiveShopifyAppConfig(companyId);
  if (!config.apiKey || !config.apiSecret) {
    throw new HttpError(
      500,
      "Shopify app credentials are not configured. Either set up this brand's own app (Client ID/Secret) on the Shopify card, or add SHOPIFY_API_KEY and SHOPIFY_API_SECRET in commerce-backend/.env for the shared app.",
    );
  }

  const normalizedShop = normalizeShop(shop);
  const state = createOauthState({ companyId, userId, shop: normalizedShop });
  const redirectUri = `${env.shopify.appUrl}/api/channels/shopify/callback`;
  const params = new URLSearchParams({
    client_id: config.apiKey,
    scope: env.shopify.scopes,
    redirect_uri: redirectUri,
    state,
  });

  return `https://${normalizedShop}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyShopifyHmac(query, apiSecret) {
  if (!apiSecret) {
    throw new HttpError(500, "Shopify API secret is not configured");
  }

  const { hmac, signature, ...rest } = query;

  if (!hmac) {
    throw new HttpError(400, "Missing Shopify HMAC");
  }

  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${Array.isArray(rest[key]) ? rest[key].join(",") : rest[key]}`)
    .join("&");

  const digest = crypto.createHmac("sha256", apiSecret).update(message).digest("hex");
  const expected = Buffer.from(digest, "utf8");
  const actual = Buffer.from(String(hmac), "utf8");

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new HttpError(401, "Invalid Shopify HMAC");
  }
}

function formatShopifyError(body) {
  if (!body) return "Unknown error";
  if (typeof body.errors === "string") return body.errors;
  if (typeof body.errors === "object" && body.errors !== null) {
    return Object.entries(body.errors)
      .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(", ") : typeof val === "object" ? JSON.stringify(val) : val}`)
      .join("; ");
  }
  if (body.message) return body.message;
  return JSON.stringify(body);
}

async function shopifyFetch(shop, path, accessToken, options = {}) {
  const response = await fetch(`https://${shop}/admin/api/${env.shopify.apiVersion}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorDetails = formatShopifyError(body);
    throw new HttpError(response.status, `Shopify API request failed: ${errorDetails}`, body);
  }

  return body;
}

async function shopifyFetchWithHeaders(shop, path, accessToken, options = {}) {
  const response = await fetch(`https://${shop}/admin/api/${env.shopify.apiVersion}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorDetails = formatShopifyError(body);
    throw new HttpError(response.status, `Shopify API request failed: ${errorDetails}`, body);
  }

  return { body, headers: response.headers };
}

function getNextPageInfo(linkHeader) {
  if (!linkHeader) return "";

  const nextLink = linkHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.includes('rel="next"'));

  if (!nextLink) return "";

  const match = nextLink.match(/[?&]page_info=([^&>]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function exchangeCodeForAccessToken(shop, code, config = { apiKey: env.shopify.apiKey, apiSecret: env.shopify.apiSecret }) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.apiKey,
      client_secret: config.apiSecret,
      code,
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.access_token) {
    throw new HttpError(response.status || 502, "Could not exchange Shopify code", body);
  }

  return {
    accessToken: body.access_token,
    scopes: String(body.scope || env.shopify.scopes)
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  };
}

export async function fetchShopDetails(shop, accessToken) {
  const body = await shopifyFetch(shop, "/shop.json", accessToken);
  return body.shop || {};
}

async function fetchPaginatedShopifyResource(shop, accessToken, { path, key, params = {}, maxPages = 40 }) {
  let pageInfo = "";
  let pageCount = 0;
  const records = [];

  do {
    const requestParams = pageInfo
      ? new URLSearchParams({ limit: "250", page_info: pageInfo })
      : new URLSearchParams({ limit: "250", ...params });

    const { body, headers } = await shopifyFetchWithHeaders(shop, `${path}?${requestParams.toString()}`, accessToken);
    records.push(...(body[key] || []));
    pageInfo = getNextPageInfo(headers.get("link"));
    pageCount += 1;
  } while (pageInfo && pageCount < maxPages);

  return records;
}

export async function fetchShopifyOrders(shop, accessToken) {
  return fetchPaginatedShopifyResource(shop, accessToken, {
    path: "/orders.json",
    key: "orders",
    params: {
      status: "any",
      // note_attributes/landing_site/referring_site carry UTM data used to attribute Meta ad spend to orders — keep these.
      // fulfillments carries tracking number/url/company for orders fulfilled via Shopify admin or another channel.
      fields:
        "id,name,order_number,email,phone,customer,financial_status,fulfillment_status,note,note_attributes,tags,currency,total_price,subtotal_price,total_tax,payment_gateway_names,line_items,shipping_address,landing_site,referring_site,source_name,created_at,processed_at,cancelled_at,fulfillments",
    },
  });
}

export async function fetchShopifyProducts(shop, accessToken) {
  return fetchPaginatedShopifyResource(shop, accessToken, {
    path: "/products.json",
    key: "products",
    params: {
      fields: "id,title,handle,status,vendor,product_type,tags,image,images,variants,created_at,updated_at,published_at",
    },
  });
}

export async function fetchShopifyCustomers(shop, accessToken) {
  return fetchPaginatedShopifyResource(shop, accessToken, {
    path: "/customers.json",
    key: "customers",
    params: {
      fields: "id,email,phone,first_name,last_name,state,tags,note,orders_count,total_spent,currency,default_address,created_at,updated_at",
    },
  });
}

function buildMetrics({ orders, products, customers, fallbackCurrency }) {
  const salesTotal = orders.reduce((total, order) => total + Number(order.total_price || 0), 0);
  const latestOrder = orders
    .slice()
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];

  return {
    orderCount: orders.length,
    productCount: products.length,
    customerCount: customers.length,
    salesTotal,
    currency: latestOrder?.currency || fallbackCurrency || "",
    lastOrderName: latestOrder?.name || "",
    lastOrderAt: latestOrder?.created_at ? new Date(latestOrder.created_at) : undefined,
  };
}

function resultValue(result) {
  return result.status === "fulfilled" ? result.value : [];
}

function syncStatus(result) {
  return result.status === "fulfilled" ? "idle" : "failed";
}

function syncErrorMessage(results) {
  return results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message || "Shopify sync failed")
    .join("; ");
}

function cleanString(value) {
  return String(value || "").trim();
}

function cleanTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => cleanString(tag)).filter(Boolean).join(", ");
  }

  return cleanString(value);
}

function pickDefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([_key, value]) => value !== undefined));
}

function requireWriteScope(channel, scope) {
  if (!channel.scopes?.includes(scope)) {
    throw new HttpError(403, `Shopify token is missing ${scope}. Update SHOPIFY_SCOPES and reconnect this channel.`);
  }
}

function productPayload(payload) {
  const product = pickDefined({
    title: payload.title !== undefined ? cleanString(payload.title) : undefined,
    vendor: payload.vendor !== undefined ? cleanString(payload.vendor) : undefined,
    product_type: payload.productType !== undefined ? cleanString(payload.productType) : undefined,
    status: payload.status !== undefined ? cleanString(payload.status) : undefined,
    tags: payload.tags !== undefined ? cleanTags(payload.tags) : undefined,
  });

  if (Array.isArray(payload.variants)) {
    product.variants = payload.variants
      .filter((variant) => variant.externalId || variant.id)
      .map((variant) =>
        pickDefined({
          id: variant.externalId || variant.id,
          sku: variant.sku !== undefined ? cleanString(variant.sku) : undefined,
          price: variant.price !== undefined ? String(variant.price) : undefined,
          barcode: variant.barcode !== undefined ? cleanString(variant.barcode) : undefined,
        }),
      );
  }

  return product;
}

function customerPayload(payload) {
  return pickDefined({
    first_name: payload.firstName !== undefined ? cleanString(payload.firstName) : undefined,
    last_name: payload.lastName !== undefined ? cleanString(payload.lastName) : undefined,
    email: payload.email !== undefined ? cleanString(payload.email) : undefined,
    phone: payload.phone !== undefined ? cleanString(payload.phone) : undefined,
    tags: payload.tags !== undefined ? cleanTags(payload.tags) : undefined,
    note: payload.note !== undefined ? cleanString(payload.note) : undefined,
  });
}

function orderPayload(payload) {
  return pickDefined({
    email: payload.email !== undefined ? cleanString(payload.email) : undefined,
    phone: payload.phone !== undefined ? cleanString(payload.phone) : undefined,
    tags: payload.tags !== undefined ? cleanTags(payload.tags) : undefined,
    note: payload.note !== undefined ? cleanString(payload.note) : undefined,
  });
}

export async function updateShopifyRecord({ companyId, resource, recordId, payload }) {
  const context = await getCommerceRecordForUpdate({ companyId, resource, recordId });

  if (!context) {
    throw new HttpError(404, "Synced record not found");
  }

  const { record, channel } = context;
  const accessToken = channel.credentials?.accessToken;

  if (!accessToken) {
    throw new HttpError(400, "Shopify access token is missing. Reconnect the channel first.");
  }

  if (resource === "products") {
    requireWriteScope(channel, "write_products");
    const product = productPayload(payload);
    const body = await shopifyFetch(channel.shop, `/products/${record.externalId}.json`, accessToken, {
      method: "PUT",
      body: JSON.stringify({ product: { id: record.externalId, ...product } }),
    });
    const saved = await saveSyncedShopifyData({ companyId, channelId: channel._id, shop: channel.shop, products: [body.product] });
    return { resource, record: saved.products[0] };
  }

  if (resource === "customers") {
    requireWriteScope(channel, "write_customers");
    const customer = customerPayload(payload);
    const body = await shopifyFetch(channel.shop, `/customers/${record.externalId}.json`, accessToken, {
      method: "PUT",
      body: JSON.stringify({ customer: { id: record.externalId, ...customer } }),
    });
    const saved = await saveSyncedShopifyData({ companyId, channelId: channel._id, shop: channel.shop, customers: [body.customer] });
    return { resource, record: saved.customers[0] };
  }

  if (resource === "orders") {
    requireWriteScope(channel, "write_orders");
    const order = orderPayload(payload);
    const body = await shopifyFetch(channel.shop, `/orders/${record.externalId}.json`, accessToken, {
      method: "PUT",
      body: JSON.stringify({ order: { id: record.externalId, ...order } }),
    });
    const saved = await saveSyncedShopifyData({ companyId, channelId: channel._id, shop: channel.shop, orders: [body.order] });
    return { resource, record: saved.orders[0] };
  }

  throw new HttpError(400, "Unsupported synced record type");
}

/**
 * Create a new order directly on Shopify using the provided line items, customer, and shipping address.
 * Returns the newly created Shopify order object.
 */
export async function createShopifyOrderDirect({ companyId, customerId, lineItems, shippingAddress, note, tags, isCOD }) {
  const context = await getCommerceRecordForUpdate({ companyId, resource: "customers", recordId: customerId });

  if (!context) {
    throw new HttpError(404, "Customer not found");
  }

  const { record: customer, channel } = context;
  const accessToken = channel.credentials?.accessToken;

  if (!accessToken) {
    throw new HttpError(400, "Shopify access token is missing. Reconnect the channel first.");
  }

  requireWriteScope(channel, "write_orders");

  const shopifyLineItems = lineItems.map((item) => {
    const li = {
      quantity: Number(item.quantity) || 1,
    };

    const variantIdNum = Number(item.variantId);
    if (!isNaN(variantIdNum) && variantIdNum > 0) {
      li.variant_id = variantIdNum;
    }

    if (item.title || item.productTitle) {
      li.title = item.title || item.productTitle;
    }

    if (item.price !== undefined && item.price !== null && item.price !== "") {
      li.price = String(item.price);
    }

    return li;
  });

  const customerIdNum = Number(customer.externalId);
  const customerPayloadObj = (!isNaN(customerIdNum) && customerIdNum > 0)
    ? { id: customerIdNum }
    : pickDefined({
        email: customer.email || undefined,
        first_name: customer.firstName || undefined,
        last_name: customer.lastName || undefined,
        phone: customer.phone || undefined,
      });

  const orderPayloadBody = pickDefined({
    customer: Object.keys(customerPayloadObj).length ? customerPayloadObj : undefined,
    line_items: shopifyLineItems,
    shipping_address: shippingAddress
      ? pickDefined({
          first_name: shippingAddress.firstName || customer.firstName || undefined,
          last_name: shippingAddress.lastName || customer.lastName || undefined,
          address1: shippingAddress.address1 || undefined,
          address2: shippingAddress.address2 || undefined,
          city: shippingAddress.city || undefined,
          province: shippingAddress.province || undefined,
          country: shippingAddress.country || "India",
          zip: shippingAddress.zip || undefined,
          phone: shippingAddress.phone || customer.phone || undefined,
        })
      : undefined,
    note: note || undefined,
    tags: tags || undefined,
    send_receipt: true,
    send_fulfillment_receipt: true,
    financial_status: isCOD ? "pending" : "paid",
  });

  const body = await shopifyFetch(channel.shop, "/orders.json", accessToken, {
    method: "POST",
    body: JSON.stringify({ order: orderPayloadBody }),
  });

  return { order: body.order, channel };
}

export async function syncShopifyData({ channelId, companyId }) {
  const channel = await getChannelForSync({ channelId, companyId });

  if (!channel) {
    throw new HttpError(404, "Channel not found");
  }

  if (channel.provider !== "shopify") {
    throw new HttpError(400, "Only Shopify sync is available right now");
  }

  // A channel can be left stuck on "syncing" if a previous run crashed before its
  // finally-block ran (e.g. server restart mid-sync). Self-heal: treat a "syncing"
  // status older than 5 minutes as stale and let this call proceed instead of
  // permanently requiring a manual reconnect.
  const STALE_SYNC_MS = 5 * 60 * 1000;
  const syncStartedAt = channel.sync?.lastSyncAt ? new Date(channel.sync.lastSyncAt).getTime() : 0;
  const isStaleSyncing = channel.status === "syncing" && Date.now() - syncStartedAt > STALE_SYNC_MS;

  if (channel.status !== "connected" && !isStaleSyncing) {
    throw new HttpError(400, "Reconnect Shopify before syncing orders");
  }

  const accessToken = channel.credentials?.accessToken;

  if (!accessToken) {
    throw new HttpError(400, "Shopify access token is missing. Reconnect the channel first.");
  }

  await updateChannelSyncState({
    channelId,
    companyId,
    status: "syncing",
    sync: {
      products: "running",
      orders: "running",
      inventory: "running",
      customers: "running",
      lastSyncAt: new Date(),
      lastError: undefined,
    },
  });

  // Everything below can throw (network errors, DB write failures, etc). The channel
  // must never be left stuck on status "syncing" — that hides it as "disconnected" on
  // the frontend and blocks all future syncs (see the status !== "connected" guard above).
  // Always fall back to "connected" with a failure note if anything goes wrong.
  try {
    const [ordersResult, productsResult, customersResult] = await Promise.allSettled([
      fetchShopifyOrders(channel.shop, accessToken),
      fetchShopifyProducts(channel.shop, accessToken),
      fetchShopifyCustomers(channel.shop, accessToken),
    ]);

    const orders = resultValue(ordersResult);
    const products = resultValue(productsResult);
    const customers = resultValue(customersResult);
    const failures = syncErrorMessage([ordersResult, productsResult, customersResult]);

    if (!orders.length && !products.length && !customers.length && failures) {
      await updateChannelSyncState({
        channelId,
        companyId,
        status: "connected",
        sync: {
          products: "failed",
          orders: "failed",
          inventory: "failed",
          customers: "failed",
          lastSyncAt: new Date(),
          lastError: failures,
        },
      });

      throw new HttpError(502, failures);
    }

    await saveSyncedShopifyData({
      companyId,
      channelId,
      shop: channel.shop,
      orders,
      products,
      customers,
    });

    const metrics = buildMetrics({
      orders,
      products,
      customers,
      fallbackCurrency: channel.metrics?.currency || channel.external?.currency,
    });

    return await updateChannelSyncState({
      channelId,
      companyId,
      status: "connected",
      metrics,
      sync: {
        products: syncStatus(productsResult),
        orders: syncStatus(ordersResult),
        inventory: syncStatus(productsResult),
        customers: syncStatus(customersResult),
        lastSyncAt: new Date(),
        lastError: failures || undefined,
      },
    });
  } catch (error) {
    // Reset status back to "connected" (never leave it stuck on "syncing") so the
    // channel keeps showing as connected and can be retried without a full reconnect.
    await updateChannelSyncState({
      channelId,
      companyId,
      status: "connected",
      sync: {
        products: "failed",
        orders: "failed",
        inventory: "failed",
        customers: "failed",
        lastSyncAt: new Date(),
        lastError: error.message,
      },
    }).catch(() => {});

    throw error;
  }
}

export async function registerShopifyWebhooks(shop, accessToken, channelId, companyId) {
  const webhookTopics = [
    { topic: "orders/create", path: "/api/webhooks/shopify/orders/create" },
    { topic: "orders/updated", path: "/api/webhooks/shopify/orders/updated" },
    { topic: "orders/cancelled", path: "/api/webhooks/shopify/orders/cancelled" },
    { topic: "fulfillments/create", path: "/api/webhooks/shopify/fulfillments/create" },
  ];

  for (const { topic, path } of webhookTopics) {
    try {
      const address = `${env.shopify.appUrl}${path}`;
      const body = await shopifyFetch(shop, "/webhooks.json", accessToken, {
        method: "POST",
        body: JSON.stringify({
          webhook: {
            topic,
            address,
            format: "json",
          },
        }),
      });

      if (body.webhook?.id) {
        await addShopifyWebhookRecord({
          channelId,
          companyId,
          topic,
          webhookId: body.webhook.id,
        });
      }
    } catch (err) {
      console.warn(`[Shopify Webhook] Could not register webhook ${topic} for ${shop}:`, err.message);
    }
  }
}

export async function completeShopifyConnection(query) {
  const shop = normalizeShop(query.shop);
  // Read (and signature-verify, via our own JWT_SECRET) our state token first —
  // it's independent of Shopify's HMAC below and tells us which company/brand
  // initiated this, which in turn tells us WHICH app's secret to verify the
  // Shopify HMAC against (the brand's own app, or the shared one as fallback).
  const state = readOauthState(query.state);

  if (state.shop !== shop) {
    throw new HttpError(400, "Shopify state does not match shop");
  }

  const config = await getEffectiveShopifyAppConfig(state.companyId);
  verifyShopifyHmac(query, config.apiSecret);

  const { accessToken, scopes } = await exchangeCodeForAccessToken(shop, query.code, config);
  const shopDetails = await fetchShopDetails(shop, accessToken);

  const channel = await upsertShopifyChannel({
    companyId: state.companyId,
    userId: state.userId,
    shop,
    shopDetails,
    scopes,
    accessToken,
  });

  // Automatically register real-time webhooks
  registerShopifyWebhooks(shop, accessToken, channel._id || channel.id, state.companyId).catch(console.error);

  return channel;
}
