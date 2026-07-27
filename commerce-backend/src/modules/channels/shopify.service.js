import crypto from "node:crypto";
import { URLSearchParams } from "node:url";
import { env } from "../../config/env.js";
import {
  getChannelForSync,
  getCommerceRecordForUpdate,
  saveSyncedShopifyData,
  updateChannelSyncState,
  upsertShopifyChannel,
} from "../../repositories/store.js";
import { HttpError } from "../../utils/http-error.js";
import { createOauthState, readOauthState } from "../../utils/oauth-state.js";

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

export function buildShopifyInstallUrl({ shop, companyId, userId }) {
  if (!shop && env.shopify.installUrl) {
    return env.shopify.installUrl;
  }

  if (!env.shopify.apiKey || !env.shopify.apiSecret) {
    throw new HttpError(
      500,
      "Shopify app credentials are not configured. Add SHOPIFY_API_KEY and SHOPIFY_API_SECRET in commerce-backend/.env, then restart the backend.",
    );
  }

  const normalizedShop = normalizeShop(shop);
  const state = createOauthState({ companyId, userId, shop: normalizedShop });
  const redirectUri = `${env.shopify.appUrl}/api/channels/shopify/callback`;
  const params = new URLSearchParams({
    client_id: env.shopify.apiKey,
    scope: env.shopify.scopes,
    redirect_uri: redirectUri,
    state,
  });

  return `https://${normalizedShop}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyShopifyHmac(query) {
  if (!env.shopify.apiSecret) {
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

  const digest = crypto.createHmac("sha256", env.shopify.apiSecret).update(message).digest("hex");
  const expected = Buffer.from(digest, "utf8");
  const actual = Buffer.from(String(hmac), "utf8");

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new HttpError(401, "Invalid Shopify HMAC");
  }
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
    throw new HttpError(response.status, "Shopify API request failed", body);
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
    throw new HttpError(response.status, "Shopify API request failed", body);
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

export async function exchangeCodeForAccessToken(shop, code) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.shopify.apiKey,
      client_secret: env.shopify.apiSecret,
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
      fields:
        "id,name,order_number,email,phone,customer,financial_status,fulfillment_status,note,tags,currency,total_price,subtotal_price,total_tax,payment_gateway_names,line_items,shipping_address,created_at,processed_at,cancelled_at",
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

export async function syncShopifyData({ channelId, companyId }) {
  const channel = await getChannelForSync({ channelId, companyId });

  if (!channel) {
    throw new HttpError(404, "Channel not found");
  }

  if (channel.provider !== "shopify") {
    throw new HttpError(400, "Only Shopify sync is available right now");
  }

  if (channel.status !== "connected") {
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

  return updateChannelSyncState({
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
}

export async function completeShopifyConnection(query) {
  verifyShopifyHmac(query);

  const shop = normalizeShop(query.shop);
  const state = readOauthState(query.state);

  if (state.shop !== shop) {
    throw new HttpError(400, "Shopify state does not match shop");
  }

  const { accessToken, scopes } = await exchangeCodeForAccessToken(shop, query.code);
  const shopDetails = await fetchShopDetails(shop, accessToken);

  return upsertShopifyChannel({
    companyId: state.companyId,
    userId: state.userId,
    shop,
    shopDetails,
    scopes,
    accessToken,
  });
}
