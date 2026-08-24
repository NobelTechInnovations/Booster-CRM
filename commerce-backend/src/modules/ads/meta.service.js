import { URLSearchParams } from "node:url";
import { env } from "../../config/env.js";
import {
  getChannelForSync,
  updateChannelSyncState,
  updateMetaAdAccount,
  upsertMetaChannel,
} from "../../repositories/channel.repo.js";
import { getOrdersInRange } from "../../repositories/order.repo.js";
import { listAdInsights, setAttribution, upsertAdInsights } from "../../repositories/ad-insight.repo.js";
import { orderMatchesAd } from "../../utils/utm.js";
import { HttpError } from "../../utils/http-error.js";
import { createOauthState, readOauthState } from "../../utils/oauth-state.js";

const GRAPH_BASE = () => `https://graph.facebook.com/${env.meta.apiVersion}`;

function requireMetaConfig() {
  if (!env.meta.appId || !env.meta.appSecret) {
    throw new HttpError(
      500,
      "Meta app credentials are not configured. Add META_APP_ID and META_APP_SECRET in commerce-backend/.env, then restart the backend.",
    );
  }
}

function redirectUri() {
  return `${env.meta.appUrl}/api/ads/meta/callback`;
}

async function metaFetch(url) {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.error) {
    const message = body?.error?.message || `Meta API request failed (${response.status})`;
    throw new HttpError(response.status >= 400 ? response.status : 502, message, body);
  }

  return body;
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

export function buildMetaAuthorizeUrl({ companyId, userId }) {
  requireMetaConfig();

  const state = createOauthState({ companyId, userId });
  const params = new URLSearchParams({
    client_id: env.meta.appId,
    redirect_uri: redirectUri(),
    state,
    scope: env.meta.scopes,
    response_type: "code",
  });

  return `https://www.facebook.com/${env.meta.apiVersion}/dialog/oauth?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    client_id: env.meta.appId,
    client_secret: env.meta.appSecret,
    redirect_uri: redirectUri(),
    code,
  });

  return metaFetch(`${GRAPH_BASE()}/oauth/access_token?${params.toString()}`);
}

async function exchangeForLongLivedToken(shortLivedToken) {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: env.meta.appId,
    client_secret: env.meta.appSecret,
    fb_exchange_token: shortLivedToken,
  });

  return metaFetch(`${GRAPH_BASE()}/oauth/access_token?${params.toString()}`);
}

export async function fetchMetaAdAccounts(accessToken) {
  const params = new URLSearchParams({ fields: "id,name,account_id,currency,account_status", access_token: accessToken });
  const body = await metaFetch(`${GRAPH_BASE()}/me/adaccounts?${params.toString()}`);
  return body.data || [];
}

export async function completeMetaConnection(query) {
  requireMetaConfig();

  const { code, error, error_description: errorDescription } = query || {};

  if (error) {
    throw new HttpError(400, errorDescription || `Meta authorization failed: ${error}`);
  }
  if (!code) {
    throw new HttpError(400, "Missing Meta authorization code");
  }

  const { companyId, userId } = readOauthState(query.state);

  const shortLived = await exchangeCodeForToken(code);
  const longLived = await exchangeForLongLivedToken(shortLived.access_token).catch(() => shortLived);

  const accessToken = longLived.access_token || shortLived.access_token;
  const expiresIn = Number(longLived.expires_in || shortLived.expires_in || 0);
  const longLivedTokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

  const adAccounts = await fetchMetaAdAccounts(accessToken).catch(() => []);
  // Multiple ad accounts are common (agencies, multi-brand sellers) — we can only auto-pick one
  // to start with. The user can switch to any other account from the Ads tab afterwards.
  const firstAccount = adAccounts[0];

  const channel = await upsertMetaChannel({
    companyId,
    userId,
    accessToken,
    longLivedTokenExpiresAt,
    adAccountId: firstAccount?.id,
    adAccountName: firstAccount?.name,
    adAccountCurrency: firstAccount?.currency,
  });

  return { channel, adAccounts };
}

// ─── Ad account selection ───────────────────────────────────────────────────

export async function listMetaAdAccountsForChannel({ companyId, channelId }) {
  const channel = await getChannelForSync({ channelId, companyId });
  if (!channel || channel.provider !== "meta") throw new HttpError(404, "Meta Ads channel not found");

  return fetchMetaAdAccounts(channel.credentials?.accessToken);
}

export async function selectMetaAdAccount({ companyId, channelId, adAccountId, adAccountName, adAccountCurrency }) {
  const channel = await updateMetaAdAccount({ companyId, channelId, adAccountId, adAccountName, adAccountCurrency });
  if (!channel) throw new HttpError(404, "Meta Ads channel not found");
  return channel;
}

// ─── Insights sync ───────────────────────────────────────────────────────────

function toIsoDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

async function fetchInsightsPage(url) {
  const body = await metaFetch(url);
  return { rows: body.data || [], next: body.paging?.next || "" };
}

export async function syncAdInsights({ companyId, channelId, days = 30 }) {
  const channel = await getChannelForSync({ channelId, companyId });
  if (!channel || channel.provider !== "meta") throw new HttpError(404, "Meta Ads channel not found");
  if (!channel.external?.adAccountId) throw new HttpError(400, "Select a Meta ad account before syncing");

  await updateChannelSyncState({ channelId, companyId, sync: { orders: "running" } });

  try {
    const until = new Date();
    const since = new Date();
    since.setDate(since.getDate() - Math.max(1, Math.min(90, Number(days) || 30)));

    const timeRange = JSON.stringify({ since: toIsoDay(since), until: toIsoDay(until) });
    const params = new URLSearchParams({
      level: "ad",
      time_increment: "1",
      fields:
        "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,cost_per_inline_link_click",
      time_range: timeRange,
      limit: "500",
      access_token: channel.credentials.accessToken,
    });

    let url = `${GRAPH_BASE()}/${channel.external.adAccountId}/insights?${params.toString()}`;
    const rows = [];

    while (url) {
      const page = await fetchInsightsPage(url);
      rows.push(...page.rows);
      url = page.next;
    }

    const records = rows
      .filter((row) => row.ad_id)
      .map((row) => ({
        companyId,
        channelId,
        provider: "meta",
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        adSetId: row.adset_id,
        adSetName: row.adset_name,
        adId: row.ad_id,
        adName: row.ad_name,
        date: new Date(row.date_start || since),
        spend: Number(row.spend || 0),
        impressions: Number(row.impressions || 0),
        reach: Number(row.reach || 0),
        frequency: Number(row.frequency || 0),
        clicks: Number(row.clicks || 0),
        linkClicks: Number(row.inline_link_clicks || 0),
        ctr: Number(row.ctr || 0),
        cpc: Number(row.cpc || 0),
        cpm: Number(row.cpm || 0),
        costPerLinkClick: Number(row.cost_per_inline_link_click || 0),
        currency: channel.external?.adAccountCurrency || "INR",
        raw: row,
      }));

    await upsertAdInsights(records);
    await runAttribution({ companyId, channelId, from: since, to: until });

    const updatedChannel = await updateChannelSyncState({
      channelId,
      companyId,
      sync: { orders: "idle", lastSyncAt: new Date(), lastError: undefined },
    });

    return { channel: updatedChannel, syncedRows: records.length };
  } catch (error) {
    await updateChannelSyncState({ channelId, companyId, sync: { orders: "failed", lastError: error.message } });
    throw error;
  }
}

/**
 * Live look at today's Meta ad spend so far — hits the Graph API directly
 * and returns the number without writing anything to AdInsight or the
 * finance ledger. The "official" figure only ever changes via the daily
 * 8am sync (syncAdInsights, scheduled in vercel.json) so mid-day checks
 * can't make the reported total drift depending on when someone happened
 * to look — this is purely "what's it at right now" on demand.
 */
export async function getMetaAdSpendToday({ companyId, channelId }) {
  const channel = await getChannelForSync({ channelId, companyId });
  if (!channel || channel.provider !== "meta") throw new HttpError(404, "Meta Ads channel not found");
  if (!channel.external?.adAccountId) throw new HttpError(400, "Select a Meta ad account before checking spend");

  const today = toIsoDay(new Date());
  const params = new URLSearchParams({
    level: "account",
    time_range: JSON.stringify({ since: today, until: today }),
    fields: "spend",
    access_token: channel.credentials.accessToken,
  });

  const body = await metaFetch(`${GRAPH_BASE()}/${channel.external.adAccountId}/insights?${params.toString()}`);
  const spend = Number(body.data?.[0]?.spend || 0);

  return { date: today, spend, currency: channel.external?.adAccountCurrency || "INR" };
}

// ─── Revenue attribution (UTM match against synced Shopify orders) ─────────

const MAX_ATTRIBUTION_DAY_DRIFT_MS = 3 * 86400000; // Meta's insight date is ad-account-local; order timestamps are UTC.

export async function runAttribution({ companyId, channelId, from, to }) {
  const [insights, { orders }] = await Promise.all([
    listAdInsights({ companyId, channelId, from, to }),
    getOrdersInRange({ companyId, from, to }),
  ]);

  const validOrders = orders.filter((order) => !order.cancelledAt && order.shopifyCreatedAt);

  // Bucket accumulator keyed by insight row, so each order is credited to exactly one
  // row (the same-ad row closest to its own day) — never double-counted across rows.
  const buckets = new Map();
  for (const insight of insights) {
    buckets.set(insight._id || `${insight.adId}:${toIsoDay(insight.date)}`, { insight, revenue: 0, orders: 0 });
  }

  for (const order of validOrders) {
    const orderDayMs = new Date(toIsoDay(order.shopifyCreatedAt)).getTime();
    let best = null;
    let bestDiff = Infinity;

    for (const insight of insights) {
      if (!orderMatchesAd(order, { campaignId: insight.campaignId, campaignName: insight.campaignName, adId: insight.adId, adName: insight.adName })) {
        continue;
      }
      const diff = Math.abs(new Date(toIsoDay(insight.date)).getTime() - orderDayMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = insight;
      }
    }

    if (best && bestDiff <= MAX_ATTRIBUTION_DAY_DRIFT_MS) {
      const key = best._id || `${best.adId}:${toIsoDay(best.date)}`;
      const bucket = buckets.get(key);
      bucket.revenue += Number(order.totalPrice || 0);
      bucket.orders += 1;
    }
  }

  let updated = 0;
  for (const { insight, revenue, orders: orderCount } of buckets.values()) {
    await setAttribution({
      companyId,
      channelId: insight.channelId,
      adId: insight.adId,
      date: insight.date,
      attributedRevenue: revenue,
      attributedOrders: orderCount,
    });
    updated += 1;
  }

  return { updated };
}
