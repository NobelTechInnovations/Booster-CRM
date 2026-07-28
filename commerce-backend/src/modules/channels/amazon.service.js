import { URL, URLSearchParams } from "node:url";
import { env } from "../../config/env.js";
import { getAmazonConfig, getChannelForSync, saveSyncedAmazonData, updateChannelSyncState, upsertAmazonChannel } from "../../repositories/store.js";
import { HttpError } from "../../utils/http-error.js";
import { createOauthState, readOauthState } from "../../utils/oauth-state.js";

function normalizeAmazonApplicationId(value) {
  return String(value || "").trim();
}

function isSellerAppId(value) {
  return /^amzn1\.sellerapps\.app\.[a-z0-9-]+$/i.test(String(value || "").trim());
}

function isPrivateSolutionAppId(value) {
  return /^amzn1\.sp\.solution\.[a-z0-9-]+$/i.test(String(value || "").trim());
}

function requireAmazonConfig(config) {
  if (!config?.applicationId || !config?.clientId || !config?.clientSecret) {
    throw new HttpError(400, "Save Amazon app setup first: application ID, LWA client ID, and LWA client secret.");
  }

  if (!isSellerAppId(config.applicationId) && !isPrivateSolutionAppId(config.applicationId)) {
    throw new HttpError(
      400,
      "Amazon application ID must look like amzn1.sellerapps.app.xxxxx or amzn1.sp.solution.xxxxx. Do not paste the LWA client ID.",
    );
  }
}

export function createAmazonPendingState({ companyId, userId, marketplaceId, draftMode }) {
  return createOauthState({
    type: "amazon-connect",
    companyId,
    userId,
    marketplaceId,
    draftMode: draftMode !== false,
  });
}

export async function buildAmazonAuthorizeUrl({ companyId, userId }) {
  const config = await getAmazonConfig(companyId, { includeSecret: true });
  requireAmazonConfig(config);

  if (isPrivateSolutionAppId(config.applicationId)) {
    throw new HttpError(
      400,
      "This Amazon app is a private Solution Provider app. Use refresh token connect instead of website OAuth redirect.",
    );
  }

  const params = new URLSearchParams({
    application_id: normalizeAmazonApplicationId(config.applicationId),
  });

  if (config.draftMode) {
    params.set("version", "beta");
  }

  return `${config.sellerCentralUrl || "https://sellercentral.amazon.in"}/apps/authorize/consent?${params.toString()}`;
}

export async function connectAmazonPrivateApp({ companyId, userId, refreshToken, sellerId }) {
  const config = await getAmazonConfig(companyId, { includeSecret: true });
  requireAmazonConfig(config);

  if (!isPrivateSolutionAppId(config.applicationId)) {
    throw new HttpError(
      400,
      "Direct refresh-token connect is for private SP-API apps with an application ID like amzn1.sp.solution.xxxxx.",
    );
  }

  const cleanedRefreshToken = String(refreshToken || "").trim();
  if (!cleanedRefreshToken) {
    throw new HttpError(400, "Amazon refresh token is required for private app connect.");
  }

  const accessToken = await refreshAmazonAccessToken({ refreshToken: cleanedRefreshToken, config });

  return upsertAmazonChannel({
    companyId,
    userId,
    sellingPartnerId: String(sellerId || "self-authorized").trim(),
    marketplaceId: config.marketplaceId,
    refreshToken: cleanedRefreshToken,
    accessToken,
  });
}

export function buildAmazonLoginRedirectUrl(query, pendingState) {
  const pending = readOauthState(pendingState);

  if (pending.type !== "amazon-connect") {
    throw new HttpError(400, "Amazon connect session is invalid. Start the Amazon connection again.");
  }

  const amazonCallbackUri = String(query.amazon_callback_uri || "").trim();
  const amazonState = String(query.amazon_state || "").trim();
  const sellingPartnerId = String(query.selling_partner_id || "").trim();

  if (!amazonCallbackUri || !amazonState || !sellingPartnerId) {
    throw new HttpError(400, "Amazon login handoff is missing amazon_callback_uri, amazon_state, or selling_partner_id.");
  }

  const state = createOauthState({
    provider: "amazon",
    companyId: pending.companyId,
    userId: pending.userId,
    marketplaceId: pending.marketplaceId,
    sellingPartnerId,
  });

  const redirectUrl = new URL(amazonCallbackUri);
  redirectUrl.searchParams.set("amazon_state", amazonState);
  redirectUrl.searchParams.set("state", state);
  redirectUrl.searchParams.set("redirect_uri", `${env.amazon.appUrl}/api/channels/amazon/callback`);

  if (pending.draftMode || query.version === "beta") {
    redirectUrl.searchParams.set("version", "beta");
  }

  return redirectUrl.toString();
}

async function exchangeAmazonCodeForToken({ code, redirectUri, config }) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: params.toString(),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.refresh_token) {
    throw new HttpError(response.status || 502, "Could not exchange Amazon authorization code", body);
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
  };
}

async function refreshAmazonAccessToken({ refreshToken, config }) {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: params.toString(),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.access_token) {
    throw new HttpError(response.status || 502, "Could not refresh Amazon access token", body);
  }

  return body.access_token;
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

async function spApiFetch({ config, accessToken, path, params = {}, method = "GET" }) {
  const requestUrl = new URL(path, config.spApiEndpoint || "https://sellingpartnerapi-eu.amazon.com");
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    requestUrl.searchParams.set(key, String(value));
  });

  const response = await fetch(requestUrl, {
    method,
    headers: {
      host: requestUrl.host,
      "user-agent": "CommerceOS/0.1 (Language=JavaScript; Platform=Node)",
      "x-amz-access-token": accessToken,
      "x-amz-date": amzDate(),
    },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpError(response.status || 502, "Amazon SP-API request failed", body);
  }

  return body;
}

async function fetchAmazonOrders({ config, accessToken }) {
  const orders = [];
  const syncDays = Math.max(1, Math.min(90, Number(config.syncDays || 30)));
  let nextToken = "";
  let pageCount = 0;

  do {
    const body = await spApiFetch({
      config,
      accessToken,
      path: "/orders/v0/orders",
      params: nextToken
        ? { NextToken: nextToken }
        : {
            MarketplaceIds: config.marketplaceId,
            CreatedAfter: new Date(Date.now() - syncDays * 24 * 60 * 60 * 1000).toISOString(),
            MaxResultsPerPage: 100,
          },
    });

    orders.push(...(body.payload?.Orders || []));
    nextToken = body.payload?.NextToken || "";
    pageCount += 1;
  } while (nextToken && pageCount < 10);

  return orders;
}

async function fetchAmazonProducts({ config, accessToken, sellerId }) {
  const products = [];
  let nextToken = "";
  let pageCount = 0;

  do {
    const body = await spApiFetch({
      config,
      accessToken,
      path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}`,
      params: {
        marketplaceIds: config.marketplaceId,
        includedData: "summaries,attributes,offers,fulfillmentAvailability",
        pageSize: 20,
        ...(nextToken ? { pageToken: nextToken } : {}),
      },
    });

    products.push(...(body.items || []));
    nextToken = body.pagination?.nextToken || "";
    pageCount += 1;
  } while (nextToken && pageCount < 10);

  return products;
}

function amazonMetrics({ orders, products, customers }) {
  const salesTotal = orders.reduce((total, order) => total + Number(order.OrderTotal?.Amount || 0), 0);
  const latestOrder = orders
    .slice()
    .sort((left, right) => new Date(right.PurchaseDate || 0) - new Date(left.PurchaseDate || 0))[0];

  return {
    orderCount: orders.length,
    productCount: products.length,
    customerCount: customers.length,
    salesTotal,
    currency: latestOrder?.OrderTotal?.CurrencyCode || "",
    lastOrderName: latestOrder?.AmazonOrderId || "",
    lastOrderAt: latestOrder?.PurchaseDate ? new Date(latestOrder.PurchaseDate) : undefined,
  };
}

export async function completeAmazonConnection(query) {
  const state = readOauthState(query.state);

  if (state.provider !== "amazon") {
    throw new HttpError(400, "Amazon state is invalid");
  }

  const sellingPartnerId = String(query.selling_partner_id || "").trim();
  const code = String(query.spapi_oauth_code || "").trim();

  if (!sellingPartnerId || !code) {
    throw new HttpError(400, "Amazon callback is missing selling_partner_id or spapi_oauth_code");
  }

  const config = await getAmazonConfig(state.companyId, { includeSecret: true });
  requireAmazonConfig(config);

  const redirectUri = `${env.amazon.appUrl}/api/channels/amazon/callback`;
  const { accessToken, refreshToken } = await exchangeAmazonCodeForToken({ code, redirectUri, config });

  return upsertAmazonChannel({
    companyId: state.companyId,
    userId: state.userId,
    sellingPartnerId: state.sellingPartnerId || sellingPartnerId,
    marketplaceId: state.marketplaceId || config.marketplaceId,
    refreshToken,
    accessToken,
  });
}

export async function syncAmazonData({ channelId, companyId }) {
  const channel = await getChannelForSync({ channelId, companyId });

  if (!channel) {
    throw new HttpError(404, "Channel not found");
  }

  if (channel.provider !== "amazon") {
    throw new HttpError(400, "Only Amazon sync can use this endpoint");
  }

  const config = await getAmazonConfig(companyId, { includeSecret: true });
  requireAmazonConfig(config);

  const refreshToken = channel.credentials?.refreshToken;
  if (!refreshToken) {
    throw new HttpError(400, "Amazon channel is missing refresh token. Reconnect Amazon seller login.");
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

  try {
    const accessToken = await refreshAmazonAccessToken({ refreshToken, config });
    const sellerId = channel.external?.sellingPartnerId && channel.external.sellingPartnerId !== "self-authorized" ? channel.external.sellingPartnerId : "";
    const [ordersResult, productsResult] = await Promise.allSettled([
      fetchAmazonOrders({ config, accessToken }),
      sellerId ? fetchAmazonProducts({ config, accessToken, sellerId }) : Promise.resolve([]),
    ]);

    const orders = ordersResult.status === "fulfilled" ? ordersResult.value : [];
    const products = productsResult.status === "fulfilled" ? productsResult.value : [];
    const saved = await saveSyncedAmazonData({
      companyId,
      channelId,
      shop: channel.shop,
      orders,
      products,
    });
    const sync = {
      orders: ordersResult.status === "fulfilled" ? "idle" : "failed",
      products: productsResult.status === "fulfilled" ? "idle" : "failed",
      inventory: productsResult.status === "fulfilled" ? "idle" : "failed",
      customers: ordersResult.status === "fulfilled" ? "idle" : "failed",
      lastSyncAt: new Date(),
      lastError: [ordersResult, productsResult]
        .filter((result) => result.status === "rejected")
        .map((result) => result.reason?.message || "Amazon sync failed")
        .join("; "),
    };

    return updateChannelSyncState({
      channelId,
      companyId,
      status: "connected",
      sync,
      metrics: amazonMetrics({ orders, products, customers: saved.customers }),
    });
  } catch (error) {
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
    });

    throw error;
  }
}
