import { isMongoConnected } from "../config/database.js";
import { Channel } from "../models/channel.model.js";
import { ShopifyPendingAppConfig } from "../models/shopify-pending-app-config.model.js";
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
    const channels = await Channel.find(filter).sort({ updatedAt: -1 }).lean();
    return channels.map(withoutCredentials);
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
      .select("+credentials.accessToken +credentials.pageAccessToken +credentials.refreshToken +credentials.token +credentials.tokenExpiresAt +credentials.username +credentials.password +credentials.apiKey +credentials.apiSecret")
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

// Deliberately different from disconnectChannel above — "inactive" pauses
// auto-sync (the daily sync job and webhook receiver both already filter
// on status:"connected", so this alone is enough to stop both — see
// shopify-sync.job.js and shopify-webhook.routes.js) while leaving the
// access token and any per-channel app credentials completely intact, so
// re-activating needs no reconnect. Only ever toggles between these two
// values — a channel that's genuinely "disconnected" or "reconnect_required"
// needs the real reconnect flow, not this.
export async function setChannelActive({ channelId, companyId, active }) {
  const status = active ? "connected" : "inactive";
  if (isMongoConnected()) {
    const channel = await Channel.findOne({ _id: channelId, companyId }).lean();
    if (!channel) return null;
    if (!["connected", "inactive"].includes(channel.status)) {
      return { error: `Can't toggle a channel that's currently "${channel.status}" — reconnect it first` };
    }
    return Channel.findOneAndUpdate({ _id: channelId, companyId }, { $set: { status } }, { returnDocument: "after" }).lean();
  }

  const channel = memory.channels.get(channelId);
  if (!channel || String(channel.companyId) !== String(companyId)) return null;
  if (!["connected", "inactive"].includes(channel.status)) {
    return { error: `Can't toggle a channel that's currently "${channel.status}" — reconnect it first` };
  }
  channel.status = status;
  channel.updatedAt = now();
  return withoutCredentials(channel);
}

// Sets a channel's Shopify app credentials directly, without any OAuth
// round-trip — the access token already granted doesn't depend on the app
// secret at all (that's only ever used to verify the OAuth callback, which
// already happened, and incoming webhooks). This is what lets a company
// re-attach the right app secret to an already-connected store if it was
// ever lost (e.g. a shared/company-wide config getting overwritten by a
// different store's setup) or is only now being split out into its own app.
export async function updateChannelAppCredentials({ channelId, companyId, apiKey, apiSecret }) {
  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { _id: channelId, companyId },
      { $set: { "credentials.apiKey": apiKey, "credentials.apiSecret": apiSecret } },
      { returnDocument: "after" },
    ).lean();
  }

  const channel = memory.channels.get(channelId);
  if (!channel || String(channel.companyId) !== String(companyId)) return null;
  channel.credentials = { ...channel.credentials, apiKey, apiSecret };
  channel.updatedAt = now();
  return withoutCredentials(channel);
}

// ─── Shopify Channel ────────────────────────────────────────────────────────

// apiKey/apiSecret are optional — only passed when this specific connect
// used a per-store custom Shopify app (see shopify-pending-app-config
// model). Both branches below set credentials via dotted paths rather than
// replacing the whole `credentials` object, specifically so a plain
// reconnect (no new app credentials supplied) never wipes an apiKey/
// apiSecret this channel already had stored from an earlier connect.
export async function upsertShopifyChannel({ companyId, userId, shop, shopDetails, scopes, accessToken, apiKey, apiSecret }) {
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
          "credentials.accessToken": accessToken,
          ...(apiKey ? { "credentials.apiKey": apiKey } : {}),
          ...(apiSecret ? { "credentials.apiSecret": apiSecret } : {}),
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
    credentials: {
      ...(existing?.credentials || {}),
      accessToken,
      ...(apiKey ? { apiKey } : {}),
      ...(apiSecret ? { apiSecret } : {}),
    },
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

// See shopify-pending-app-config.model.js for why this exists at all — a
// short-lived bridge for a per-store custom Shopify app's credentials
// across the OAuth redirect round-trip, keyed by {companyId, shop} rather
// than a new opaque token since both already ride in the OAuth state.
// Mongo-only (no memory-store fallback) — a real OAuth round-trip against
// Shopify's own servers needs a real backend either way.
export async function upsertShopifyPendingAppConfig({ companyId, shop, apiKey, apiSecret }) {
  if (!isMongoConnected()) return null;
  return ShopifyPendingAppConfig.findOneAndUpdate(
    { companyId, shop },
    { $set: { apiKey, apiSecret } },
    { upsert: true, new: true },
  ).lean();
}

export async function getShopifyPendingAppConfig({ companyId, shop }) {
  if (!isMongoConnected()) return null;
  return ShopifyPendingAppConfig.findOne({ companyId, shop }).select("+apiSecret").lean();
}

export async function deleteShopifyPendingAppConfig({ companyId, shop }) {
  if (!isMongoConnected()) return;
  await ShopifyPendingAppConfig.deleteOne({ companyId, shop });
}

export async function getShopifyChannelByShop(shop) {
  if (isMongoConnected()) {
    return Channel.findOne({ provider: "shopify", shop, status: "connected" })
      .select("+credentials.accessToken +credentials.apiSecret")
      .lean();
  }
  return clone([...memory.channels.values()].find((ch) => ch.provider === "shopify" && ch.shop === shop) || null);
}

// The connected Shopify channel for a company — used wherever we need to push
// something new INTO Shopify (e.g. creating a customer) rather than reading
// an already-synced record, so there's no existing SyncedCustomer/SyncedOrder
// to resolve the channel from yet.
export async function getConnectedShopifyChannel(companyId) {
  if (isMongoConnected()) {
    return Channel.findOne({ companyId, provider: "shopify", status: "connected" })
      .select("+credentials.accessToken")
      .lean();
  }
  return clone([...memory.channels.values()].find((ch) => String(ch.companyId) === String(companyId) && ch.provider === "shopify" && ch.status === "connected") || null);
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
  const selectFields = "+credentials.username +credentials.password +credentials.token +credentials.tokenExpiresAt +credentials.apiKey +credentials.apiSecret +credentials.licenseKey";

  if (isMongoConnected()) {
    // Try new-style first (channelType: "shipping"), then fall back to old-style (no channelType)
    const channel = await Channel.findOne({ companyId, provider, channelType: "shipping" })
      .select(selectFields)
      .lean();

    if (channel) return channel;

    // Backward-compat: old velocity channels had no channelType
    return Channel.findOne({ companyId, provider })
      .select(selectFields)
      .lean();
  }

  const channel = [...memory.channels.values()].find(
    (ch) => String(ch.companyId) === String(companyId) && ch.provider === provider && (ch.channelType === "shipping" || !ch.channelType),
  );
  return channel ? clone(channel) : null;
}

export async function upsertShippingChannel({ companyId, userId, provider, name, shop, credentials, external = {} }) {
  if (isMongoConnected()) {
    // Match existing channel regardless of whether it was created with the old or new code path
    const existing = await Channel.findOne({
      companyId,
      provider,
      $or: [{ shop }, { shop: provider }],
    }).lean();

    const filter = existing
      ? { _id: existing._id }
      : { companyId, provider, shop, channelType: "shipping" };

    return Channel.findOneAndUpdate(
      filter,
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
  const SHIPPING_PROVIDERS = ["velocity", "shiprocket", "shipway", "shipmozo", "delhivery"];

  if (isMongoConnected()) {
    // Return channels that are explicitly typed as shipping OR have a known shipping provider
    const channels = await Channel.find({
      companyId,
      $or: [
        { channelType: "shipping" },
        { provider: { $in: SHIPPING_PROVIDERS }, channelType: { $exists: false } },
      ],
    })
      .sort({ updatedAt: -1 })
      .lean();
    return channels.map(withoutCredentials);
  }

  return [...memory.channels.values()]
    .filter((ch) => {
      if (String(ch.companyId) !== String(companyId)) return false;
      return ch.channelType === "shipping" || (!ch.channelType && SHIPPING_PROVIDERS.includes(ch.provider));
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(withoutCredentials);
}

export async function listSalesChannels(companyId) {
  return listChannels(companyId, { channelType: "sales" });
}

// ─── Ads Channel (Meta) ──────────────────────────────────────────────────────

export async function listAdsChannels(companyId) {
  return listChannels(companyId, { channelType: "ads" });
}

export async function upsertMetaChannel({ companyId, userId, businessId, accessToken, longLivedTokenExpiresAt, adAccountId, adAccountName, adAccountCurrency }) {
  const shop = "meta-ads";

  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { companyId, provider: "meta", shop },
      {
        $set: {
          channelType: "ads",
          provider: "meta",
          companyId,
          shop,
          name: adAccountName ? `Meta Ads · ${adAccountName}` : "Meta Ads",
          status: "connected",
          scopes: ["ads_read", "business_management"],
          credentials: { accessToken, longLivedTokenExpiresAt },
          external: { businessId, adAccountId, adAccountName, adAccountCurrency },
          connectedBy: userId,
          disconnectedAt: null,
        },
      },
      { new: true, upsert: true },
    ).lean();
  }

  const existing = [...memory.channels.values()].find(
    (ch) => String(ch.companyId) === String(companyId) && ch.provider === "meta" && ch.shop === shop,
  );

  const channel = {
    _id: existing?._id || id(),
    channelType: "ads",
    provider: "meta",
    companyId,
    shop,
    name: adAccountName ? `Meta Ads · ${adAccountName}` : "Meta Ads",
    status: "connected",
    scopes: ["ads_read", "business_management"],
    credentials: { accessToken, longLivedTokenExpiresAt },
    external: { businessId, adAccountId, adAccountName, adAccountCurrency },
    sync: existing?.sync || { orders: "idle" },
    connectedBy: userId,
    disconnectedAt: null,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };

  memory.channels.set(channel._id, channel);
  return clone(channel);
}

export async function updateMetaAdAccount({ companyId, channelId, adAccountId, adAccountName, adAccountCurrency }) {
  const update = {
    "external.adAccountId": adAccountId,
    "external.adAccountName": adAccountName,
    "external.adAccountCurrency": adAccountCurrency,
    name: adAccountName ? `Meta Ads · ${adAccountName}` : "Meta Ads",
  };

  if (isMongoConnected()) {
    return Channel.findOneAndUpdate({ _id: channelId, companyId, provider: "meta" }, { $set: update }, { new: true }).lean();
  }

  const channel = memory.channels.get(channelId);
  if (!channel || String(channel.companyId) !== String(companyId)) return null;
  channel.external = { ...channel.external, adAccountId, adAccountName, adAccountCurrency };
  channel.name = update.name;
  channel.updatedAt = now();
  return withoutCredentials(channel);
}

// ─── Social Channel (Instagram / Facebook Page via Meta) ───────────────────
// Deliberately a separate Channel doc from the Ads one above — same Meta
// provider, but a distinct `shop` value ("meta-social" vs "meta-ads") so
// the {companyId, provider, shop} unique index never collides between the
// two, and disconnecting one never touches the other.

export async function listSocialChannels(companyId) {
  return listChannels(companyId, { channelType: "social" });
}

// Hard delete, not the generic disconnectChannel's soft status flip —
// listSocialChannels/listChannels don't filter by status, so a soft
// disconnect would leave the row in place and the frontend (which just
// takes channels[0]) would keep showing it as connected. A full delete is
// also what "remove and connect a different Instagram/Facebook account"
// actually needs: reconnecting after this creates a fresh channel row
// rather than reusing stale pageId/igUserId from the account being removed.
export async function deleteSocialChannel({ channelId, companyId }) {
  if (isMongoConnected()) {
    return Channel.findOneAndDelete({ _id: channelId, companyId, channelType: "social" }).lean();
  }
  const channel = memory.channels.get(channelId);
  if (!channel || String(channel.companyId) !== String(companyId) || channel.channelType !== "social") return null;
  memory.channels.delete(channelId);
  return withoutCredentials(channel);
}

// pageAccessToken is distinct from the user-level accessToken exchanged from
// the OAuth code — Meta's "new Pages experience" rejects Page/Instagram
// media, insights, comments, and reply calls made with a user token
// (error_subcode 2069032, "A Page access token is required for this call").
// findFirstPageWithInstagram already gets this token per-Page from
// /me/accounts; it's stored here so social.service.js's Graph calls can use
// the right one instead of the user token.
export async function upsertSocialChannel({ companyId, userId, accessToken, pageAccessToken, longLivedTokenExpiresAt, pageId, pageName, igUserId, igUsername }) {
  const shop = "meta-social";
  const name = pageName ? `Instagram/Facebook · ${pageName}` : "Instagram/Facebook";

  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { companyId, provider: "meta", shop },
      {
        $set: {
          channelType: "social",
          provider: "meta",
          companyId,
          shop,
          name,
          status: "connected",
          scopes: [
            "pages_show_list", "pages_read_engagement", "pages_manage_engagement",
            "pages_manage_posts", "pages_manage_metadata", "instagram_basic",
            "instagram_manage_comments", "instagram_manage_insights",
            "instagram_content_publish", "business_management",
          ],
          credentials: { accessToken, pageAccessToken, longLivedTokenExpiresAt },
          external: { pageId, pageName, igUserId, igUsername },
          connectedBy: userId,
          disconnectedAt: null,
        },
      },
      { new: true, upsert: true },
    ).lean();
  }

  const existing = [...memory.channels.values()].find(
    (ch) => String(ch.companyId) === String(companyId) && ch.provider === "meta" && ch.shop === shop,
  );

  const channel = {
    _id: existing?._id || id(),
    channelType: "social",
    provider: "meta",
    companyId,
    shop,
    name,
    status: "connected",
    scopes: [
      "pages_show_list", "pages_read_engagement", "pages_manage_engagement",
      "pages_manage_posts", "pages_manage_metadata", "instagram_basic",
      "instagram_manage_comments", "instagram_manage_insights",
      "instagram_content_publish", "business_management",
    ],
    credentials: { accessToken, pageAccessToken, longLivedTokenExpiresAt },
    external: { pageId, pageName, igUserId, igUsername },
    sync: existing?.sync || { orders: "idle" },
    connectedBy: userId,
    disconnectedAt: null,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };

  memory.channels.set(channel._id, channel);
  return clone(channel);
}

// ─── WhatsApp Channel ────────────────────────────────────────────────────────
// Per-company, entered manually (System User token + Phone Number ID pasted
// from the company's own WhatsApp Business Account in Meta Business Manager)
// rather than OAuth — the Cloud API has no simple end-user consent flow for
// provisioning a business phone number, so the standard integration pattern
// is credential entry, not a redirect dance.

export async function listWhatsAppChannels(companyId) {
  return listChannels(companyId, { channelType: "whatsapp" });
}

// Same reasoning as deleteSocialChannel above — hard delete so the
// frontend's channels[0]||null check naturally falls back to the connect
// form, and so a re-connect with a different phone number starts clean
// instead of upserting stale fields onto the removed number's row.
export async function deleteWhatsAppChannel({ channelId, companyId }) {
  if (isMongoConnected()) {
    return Channel.findOneAndDelete({ _id: channelId, companyId, channelType: "whatsapp" }).lean();
  }
  const channel = memory.channels.get(channelId);
  if (!channel || String(channel.companyId) !== String(companyId) || channel.channelType !== "whatsapp") return null;
  memory.channels.delete(channelId);
  return withoutCredentials(channel);
}

export async function upsertWhatsAppChannel({ companyId, userId, phoneNumberId, whatsappBusinessAccountId, accessToken, whatsappDisplayName, whatsappPhoneNumber }) {
  const shop = "whatsapp";
  const name = whatsappDisplayName ? `WhatsApp · ${whatsappDisplayName}` : "WhatsApp Business";

  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { companyId, provider: "meta", shop },
      {
        $set: {
          channelType: "whatsapp",
          provider: "meta",
          companyId,
          shop,
          name,
          status: "connected",
          credentials: { accessToken },
          external: { phoneNumberId, whatsappBusinessAccountId, whatsappDisplayName, whatsappPhoneNumber },
          connectedBy: userId,
          disconnectedAt: null,
        },
      },
      { new: true, upsert: true },
    ).lean();
  }

  const existing = [...memory.channels.values()].find(
    (ch) => String(ch.companyId) === String(companyId) && ch.provider === "meta" && ch.shop === shop,
  );

  const channel = {
    _id: existing?._id || id(),
    channelType: "whatsapp",
    provider: "meta",
    companyId,
    shop,
    name,
    status: "connected",
    credentials: { accessToken },
    external: { phoneNumberId, whatsappBusinessAccountId, whatsappDisplayName, whatsappPhoneNumber },
    connectedBy: userId,
    disconnectedAt: null,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };

  memory.channels.set(channel._id, channel);
  return clone(channel);
}

// Global (cross-tenant) lookup by phoneNumberId — how an inbound WhatsApp
// webhook event (which only carries the phone_number_id, no companyId) gets
// routed back to the right company. Needs the accessToken selected too
// since the caller uses this to both resolve companyId AND to reply.
export async function getWhatsAppChannelByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;

  if (isMongoConnected()) {
    return Channel.findOne({ channelType: "whatsapp", "external.phoneNumberId": phoneNumberId })
      .select("+credentials.accessToken")
      .lean();
  }

  const found = [...memory.channels.values()].find(
    (ch) => ch.channelType === "whatsapp" && ch.external?.phoneNumberId === phoneNumberId,
  );
  return found ? clone(found) : null;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function getStoreMode() {
  return isMongoConnected() ? "mongodb" : "memory";
}
