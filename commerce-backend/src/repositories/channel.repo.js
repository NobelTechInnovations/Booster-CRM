import { isMongoConnected } from "../config/database.js";
import { Channel } from "../models/channel.model.js";
import { memory, id, clone, now } from "./memory-store.js";

function withoutCredentials(channel) {
  if (!channel) return channel;
  const copy = clone(channel);
  copy.id = copy._id;
  delete copy.credentials;
  return copy;
}

export { withoutCredentials };

export async function listChannels(companyId, { channelType } = {}) {
  const filter = { companyId, ...(channelType ? { channelType } : {}) };

  if (isMongoConnected()) {
    return Channel.find(filter).sort({ updatedAt: -1 }).lean();
  }

  return [...memory.channels.values()]
    .filter((ch) => {
      if (String(ch.companyId) !== String(companyId)) return false;
      if (channelType && ch.channelType !== channelType) return false;
      return true;
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(withoutCredentials);
}

export async function getChannelForSync({ channelId, companyId }) {
  if (isMongoConnected()) {
    return Channel.findOne({ _id: channelId, companyId })
      .select("+credentials.accessToken +credentials.refreshToken +credentials.token +credentials.tokenExpiresAt +credentials.username +credentials.password +credentials.apiKey +credentials.apiSecret")
      .lean();
  }
  const channel = memory.channels.get(channelId);
  if (!channel || String(channel.companyId) !== String(companyId)) return null;
  return clone(channel);
}

export async function getChannelById({ channelId, companyId }) {
  return getChannelForSync({ channelId, companyId });
}

export async function updateChannelSyncState({ channelId, companyId, sync, metrics, status }) {
  const update = {
    ...(sync ? { sync } : {}),
    ...(metrics ? { metrics } : {}),
    ...(status ? { status } : {}),
  };

  if (isMongoConnected()) {
    return Channel.findOneAndUpdate({ _id: channelId, companyId }, { $set: update }, { returnDocument: "after" }).lean();
  }

  const channel = memory.channels.get(channelId);
  if (!channel || String(channel.companyId) !== String(companyId)) return null;
  Object.assign(channel, update, { updatedAt: now() });
  return withoutCredentials(channel);
}

export async function disconnectChannel({ channelId, companyId }) {
  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { _id: channelId, companyId },
      { $set: { status: "disconnected", disconnectedAt: new Date(), "credentials.accessToken": undefined } },
      { returnDocument: "after" },
    ).lean();
  }

  const channel = memory.channels.get(channelId);
  if (!channel || String(channel.companyId) !== String(companyId)) return null;
  channel.status = "disconnected";
  channel.disconnectedAt = now();
  channel.updatedAt = now();
  delete channel.credentials?.accessToken;
  return withoutCredentials(channel);
}

// ─── Shopify Channel ────────────────────────────────────────────────────────

export async function upsertShopifyChannel({ companyId, userId, shop, shopDetails, scopes, accessToken }) {
  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { companyId, provider: "shopify", shop },
      {
        $set: {
          channelType: "sales",
          provider: "shopify",
          companyId,
          shop,
          name: shopDetails.name || shop,
          status: "connected",
          scopes,
          credentials: { accessToken },
          external: {
            shopId:          shopDetails.id ? String(shopDetails.id) : undefined,
            email:           shopDetails.email,
            domain:          shopDetails.domain,
            myshopifyDomain: shopDetails.myshopify_domain,
            currency:        shopDetails.currency,
            timezone:        shopDetails.iana_timezone || shopDetails.timezone,
          },
          connectedBy:    userId,
          disconnectedAt: null,
        },
      },
      { new: true, upsert: true },
    ).lean();
  }

  const existing = [...memory.channels.values()].find(
    (ch) => String(ch.companyId) === String(companyId) && ch.provider === "shopify" && ch.shop === shop,
  );

  const channel = {
    _id:         existing?._id || id(),
    channelType: "sales",
    provider:    "shopify",
    companyId,
    shop,
    name:        shopDetails.name || shop,
    status:      "connected",
    scopes,
    credentials: { accessToken },
    external: {
      shopId:          shopDetails.id ? String(shopDetails.id) : undefined,
      email:           shopDetails.email,
      domain:          shopDetails.domain,
      myshopifyDomain: shopDetails.myshopify_domain,
      currency:        shopDetails.currency,
      timezone:        shopDetails.iana_timezone || shopDetails.timezone,
    },
    sync: existing?.sync || { products: "idle", orders: "idle", inventory: "idle", customers: "idle", warehouses: "idle" },
    metrics: existing?.metrics || { orderCount: 0, salesTotal: 0, currency: shopDetails.currency },
    connectedBy:    userId,
    disconnectedAt: null,
    createdAt:      existing?.createdAt || now(),
    updatedAt:      now(),
  };

  memory.channels.set(channel._id, channel);
  return clone(channel);
}

export async function addShopifyWebhookRecord({ channelId, companyId, topic, webhookId }) {
  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { _id: channelId, companyId },
      {
        $push: {
          webhooks: { topic, webhookId: String(webhookId), registeredAt: new Date() },
        },
      },
      { new: true },
    ).lean();
  }

  const channel = memory.channels.get(channelId);
  if (!channel) return null;
  channel.webhooks = channel.webhooks || [];
  channel.webhooks.push({ topic, webhookId: String(webhookId), registeredAt: now() });
  channel.updatedAt = now();
  return clone(channel);
}

export async function getShopifyChannelByShop(shop) {
  if (isMongoConnected()) {
    return Channel.findOne({ provider: "shopify", shop, status: "connected" })
      .select("+credentials.accessToken")
      .lean();
  }
  return clone([...memory.channels.values()].find((ch) => ch.provider === "shopify" && ch.shop === shop) || null);
}

// ─── Amazon Channel ──────────────────────────────────────────────────────────

export async function upsertAmazonChannel({ companyId, userId, sellingPartnerId, marketplaceId, refreshToken, accessToken }) {
  const shop = `amazon-${sellingPartnerId}`.toLowerCase();

  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { companyId, provider: "amazon", shop },
      {
        $set: {
          channelType: "sales",
          provider:    "amazon",
          companyId,
          shop,
          name:   "Amazon",
          status: "connected",
          scopes: ["selling_partner_api"],
          credentials: { refreshToken, accessToken },
          external: { sellingPartnerId, marketplaceId },
          connectedBy:    userId,
          disconnectedAt: null,
          sync: { products: "idle", orders: "idle", inventory: "idle", customers: "idle", lastSyncAt: new Date(), lastError: undefined },
        },
      },
      { returnDocument: "after", upsert: true },
    ).lean();
  }

  const existing = [...memory.channels.values()].find(
    (ch) => String(ch.companyId) === String(companyId) && ch.provider === "amazon" && ch.shop === shop,
  );
  const channel = {
    _id:         existing?._id || id(),
    channelType: "sales",
    provider:    "amazon",
    companyId,
    shop,
    name:   "Amazon",
    status: "connected",
    scopes: ["selling_partner_api"],
    credentials: { refreshToken, accessToken },
    external: { sellingPartnerId, marketplaceId },
    sync:    existing?.sync || { products: "idle", orders: "idle", inventory: "idle", customers: "idle", lastSyncAt: now() },
    connectedBy:    userId,
    disconnectedAt: null,
    createdAt:      existing?.createdAt || now(),
    updatedAt:      now(),
  };

  memory.channels.set(channel._id, channel);
  return clone(channel);
}

// ─── Shipping Provider Channels ──────────────────────────────────────────────

export async function getShippingChannel({ companyId, provider }) {
  if (isMongoConnected()) {
    return Channel.findOne({ companyId, provider, channelType: "shipping" })
      .select("+credentials.username +credentials.password +credentials.token +credentials.tokenExpiresAt +credentials.apiKey +credentials.apiSecret")
      .lean();
  }

  const channel = [...memory.channels.values()].find(
    (ch) => String(ch.companyId) === String(companyId) && ch.provider === provider && ch.channelType === "shipping",
  );
  return channel ? clone(channel) : null;
}

export async function upsertShippingChannel({ companyId, userId, provider, name, shop, credentials, external = {} }) {
  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { companyId, provider, shop, channelType: "shipping" },
      {
        $set: {
          channelType: "shipping",
          provider,
          companyId,
          shop,
          name,
          status:      "connected",
          credentials,
          external,
          connectedBy:    userId,
          disconnectedAt: null,
        },
      },
      { new: true, upsert: true },
    ).lean();
  }

  const existing = [...memory.channels.values()].find(
    (ch) => String(ch.companyId) === String(companyId) && ch.provider === provider && ch.channelType === "shipping",
  );

  const channel = {
    _id:         existing?._id || id(),
    channelType: "shipping",
    provider,
    companyId,
    shop,
    name,
    status:      "connected",
    credentials,
    external,
    sync: existing?.sync || { warehouses: "idle" },
    connectedBy:    userId,
    disconnectedAt: null,
    createdAt:      existing?.createdAt || now(),
    updatedAt:      now(),
  };

  memory.channels.set(channel._id, channel);
  return clone(channel);
}

export async function updateShippingChannelToken({ channelId, companyId, token, tokenExpiresAt }) {
  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { _id: channelId, companyId },
      { $set: { "credentials.token": token, "credentials.tokenExpiresAt": tokenExpiresAt } },
      { new: true },
    )
      .select("+credentials.username +credentials.password +credentials.token +credentials.tokenExpiresAt")
      .lean();
  }

  const channel = memory.channels.get(channelId);
  if (!channel || String(channel.companyId) !== String(companyId)) return null;
  channel.credentials = { ...channel.credentials, token, tokenExpiresAt };
  channel.updatedAt = now();
  return clone(channel);
}

export async function listShippingChannels(companyId) {
  return listChannels(companyId, { channelType: "shipping" });
}

export async function listSalesChannels(companyId) {
  return listChannels(companyId, { channelType: "sales" });
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function getStoreMode() {
  return isMongoConnected() ? "mongodb" : "memory";
}
