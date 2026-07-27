import { URLSearchParams } from "node:url";
import { env } from "../../config/env.js";
import { getAmazonConfig, getChannelForSync, updateChannelSyncState, upsertAmazonChannel } from "../../repositories/store.js";
import { HttpError } from "../../utils/http-error.js";
import { createOauthState, readOauthState } from "../../utils/oauth-state.js";

function requireAmazonConfig(config) {
  if (!config?.applicationId || !config?.clientId || !config?.clientSecret) {
    throw new HttpError(400, "Save Amazon app setup first: application ID, LWA client ID, and LWA client secret.");
  }
}

export async function buildAmazonAuthorizeUrl({ companyId, userId }) {
  const config = await getAmazonConfig(companyId, { includeSecret: true });
  requireAmazonConfig(config);

  const state = createOauthState({
    provider: "amazon",
    companyId,
    userId,
    marketplaceId: config.marketplaceId,
  });

  const params = new URLSearchParams({
    application_id: config.applicationId,
    state,
  });

  if (config.draftMode) {
    params.set("version", "beta");
  }

  return `${config.sellerCentralUrl || "https://sellercentral.amazon.in"}/apps/authorize/consent?${params.toString()}`;
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
    sellingPartnerId,
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

  await updateChannelSyncState({
    channelId,
    companyId,
    sync: {
      products: "failed",
      orders: "failed",
      inventory: "failed",
      customers: "failed",
      lastSyncAt: new Date(),
      lastError: "Amazon OAuth is connected. SP-API order/product sync requires AWS SigV4/IAM credentials to be saved in the Amazon setup.",
    },
  });

  throw new HttpError(
    400,
    "Amazon OAuth is connected. SP-API data sync needs AWS SigV4/IAM setup; app keys are saved in DB, but request-signing credentials are not configured yet.",
  );
}
