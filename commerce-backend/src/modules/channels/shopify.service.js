import crypto from "node:crypto";
import { URLSearchParams } from "node:url";
import { env } from "../../config/env.js";
import { upsertShopifyChannel } from "../../repositories/store.js";
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
    throw new HttpError(500, "Shopify credentials are not configured");
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
