import { URLSearchParams } from "node:url";
import { env } from "../../config/env.js";
import { graphFetch, graphFetchAll } from "../../utils/graph-api.js";
import { HttpError } from "../../utils/http-error.js";
import { createOauthState, readOauthState } from "../../utils/oauth-state.js";
import {
  getChannelForSync,
  updateChannelSyncState,
  upsertSocialChannel,
} from "../../repositories/channel.repo.js";
import { upsertSocialPosts, upsertSocialComments, listCommentsForPost, getSocialPost } from "../../repositories/social.repo.js";

const GRAPH_BASE = () => `https://graph.facebook.com/${env.meta.apiVersion}`;

// Deliberately its own permission set and its own OAuth redirect URI,
// entirely separate from modules/ads/meta.service.js's Ads flow — connecting
// Social never touches, and can never break, the existing Ads connection.
const SOCIAL_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_engagement",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_insights",
  "business_management",
].join(",");

function requireMetaConfig() {
  if (!env.meta.appId || !env.meta.appSecret) {
    throw new HttpError(
      500,
      "Meta app credentials are not configured. Add META_APP_ID and META_APP_SECRET in commerce-backend/.env, then restart the backend.",
    );
  }
}

// Its own path (not /api/ads/meta/callback) — must be added as an
// additional "Valid OAuth Redirect URI" in the Meta App dashboard alongside
// the existing Ads one; the two flows never share a callback.
function redirectUri() {
  return `${env.meta.appUrl}/api/social/meta/callback`;
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

export function buildSocialAuthorizeUrl({ companyId, userId }) {
  requireMetaConfig();

  const state = createOauthState({ companyId, userId });
  const params = new URLSearchParams({
    client_id: env.meta.appId,
    redirect_uri: redirectUri(),
    state,
    scope: SOCIAL_SCOPES,
    response_type: "code",
  });

  return `https://www.facebook.com/${env.meta.apiVersion}/dialog/oauth?${params.toString()}`;
}

// Copied from meta.service.js's identical two-step exchange rather than
// imported — keeps this module fully independent so nothing here can ever
// regress the working Ads OAuth flow.
async function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    client_id: env.meta.appId,
    client_secret: env.meta.appSecret,
    redirect_uri: redirectUri(),
    code,
  });
  return graphFetch(`${GRAPH_BASE()}/oauth/access_token?${params.toString()}`);
}

async function exchangeForLongLivedToken(shortLivedToken) {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: env.meta.appId,
    client_secret: env.meta.appSecret,
    fb_exchange_token: shortLivedToken,
  });
  return graphFetch(`${GRAPH_BASE()}/oauth/access_token?${params.toString()}`);
}

// A Facebook Page only has an Instagram presence if a Business/Creator IG
// account was linked to it (standard Meta requirement — a personal IG
// account can never be connected this way). Pages without one are skipped;
// if a business has multiple Pages, this picks the first one that DOES have
// an IG account linked, since that's almost always the one actually in use
// for their storefront/marketing.
async function findFirstPageWithInstagram(accessToken) {
  const pagesParams = new URLSearchParams({ fields: "id,name,access_token", access_token: accessToken });
  const pages = await graphFetchAll(`${GRAPH_BASE()}/me/accounts?${pagesParams.toString()}`, { maxRows: 50 });

  for (const page of pages) {
    const igParams = new URLSearchParams({ fields: "instagram_business_account", access_token: accessToken });
    const igLookup = await graphFetch(`${GRAPH_BASE()}/${page.id}?${igParams.toString()}`).catch(() => ({}));
    const igUserId = igLookup?.instagram_business_account?.id;
    if (igUserId) {
      const igDetailsParams = new URLSearchParams({ fields: "username", access_token: accessToken });
      const igDetails = await graphFetch(`${GRAPH_BASE()}/${igUserId}?${igDetailsParams.toString()}`).catch(() => ({}));
      return { pageId: page.id, pageName: page.name, igUserId, igUsername: igDetails?.username || "" };
    }
  }

  // Still connect the first Page even with no IG account, so Facebook Page
  // post sync/reply works — Instagram-specific calls just won't have
  // anything to sync against until the user links an IG Business account.
  return pages[0] ? { pageId: pages[0].id, pageName: pages[0].name, igUserId: "", igUsername: "" } : {};
}

export async function completeSocialConnection(query) {
  requireMetaConfig();

  const { code, error, error_description: errorDescription } = query || {};
  if (error) throw new HttpError(400, errorDescription || `Meta authorization failed: ${error}`);
  if (!code) throw new HttpError(400, "Missing Meta authorization code");

  const { companyId, userId } = readOauthState(query.state);

  const shortLived = await exchangeCodeForToken(code);
  const longLived = await exchangeForLongLivedToken(shortLived.access_token).catch(() => shortLived);

  const accessToken = longLived.access_token || shortLived.access_token;
  const expiresIn = Number(longLived.expires_in || shortLived.expires_in || 0);
  const longLivedTokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

  const { pageId, pageName, igUserId, igUsername } = await findFirstPageWithInstagram(accessToken).catch(() => ({}));
  if (!pageId) {
    throw new HttpError(400, "No Facebook Page found on this account. Connect an account that manages at least one Facebook Page.");
  }

  const channel = await upsertSocialChannel({
    companyId, userId, accessToken, longLivedTokenExpiresAt, pageId, pageName, igUserId, igUsername,
  });

  return { channel };
}

// ─── Post + insight sync ─────────────────────────────────────────────────────

function toIsoDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

async function fetchPostInsights(mediaId, accessToken, metrics) {
  const params = new URLSearchParams({ metric: metrics.join(","), access_token: accessToken });
  const body = await graphFetch(`${GRAPH_BASE()}/${mediaId}/insights?${params.toString()}`).catch(() => ({ data: [] }));
  const byName = {};
  for (const entry of body.data || []) {
    byName[entry.name] = entry.values?.[0]?.value ?? 0;
  }
  return byName;
}

async function syncInstagramPosts({ companyId, channelId, channel }) {
  if (!channel.external?.igUserId) return [];
  const accessToken = channel.credentials.accessToken;

  const params = new URLSearchParams({
    fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
    limit: "25",
    access_token: accessToken,
  });
  const media = await graphFetchAll(`${GRAPH_BASE()}/${channel.external.igUserId}/media?${params.toString()}`, { maxRows: 25 });

  const records = [];
  for (const item of media) {
    // Per-media insights is a separate Graph call with no bulk equivalent —
    // capped to the 25 most recent posts above specifically to bound this.
    // VIDEO/CAROUSEL_ALBUM support a different metric set than IMAGE; reach/
    // impressions/saved work across all types, so that's what's requested.
    const insights = await fetchPostInsights(item.id, accessToken, ["reach", "impressions", "saved"]);
    records.push({
      companyId,
      channelId,
      platform: "instagram",
      externalPostId: item.id,
      pageId: channel.external.pageId,
      igUserId: channel.external.igUserId,
      caption: item.caption || "",
      mediaType: item.media_type,
      mediaUrl: item.media_url,
      thumbnailUrl: item.thumbnail_url || "",
      permalink: item.permalink,
      postedAt: new Date(item.timestamp),
      insights: {
        reach: insights.reach || 0,
        impressions: insights.impressions || 0,
        likeCount: item.like_count || 0,
        commentsCount: item.comments_count || 0,
        saved: insights.saved || 0,
        shares: 0,
      },
      lastSyncedAt: new Date(),
      raw: item,
    });
  }
  return records;
}

async function syncFacebookPosts({ companyId, channelId, channel }) {
  const accessToken = channel.credentials.accessToken;
  const params = new URLSearchParams({
    fields: "id,message,full_picture,permalink_url,created_time,shares",
    limit: "25",
    access_token: accessToken,
  });
  const posts = await graphFetchAll(`${GRAPH_BASE()}/${channel.external.pageId}/posts?${params.toString()}`, { maxRows: 25 });

  const records = [];
  for (const item of posts) {
    const insights = await fetchPostInsights(item.id, accessToken, ["post_impressions", "post_impressions_unique"]);
    // Facebook doesn't return like/comment counts on the base /posts edge the
    // way Instagram's /media does — a summary=true field expansion would be
    // needed for exact counts; left at 0 rather than an extra guessed call,
    // consistent with this codebase's "never fabricate a number" convention.
    records.push({
      companyId,
      channelId,
      platform: "facebook",
      externalPostId: item.id,
      pageId: channel.external.pageId,
      caption: item.message || "",
      mediaType: "facebook_post",
      mediaUrl: item.full_picture || "",
      permalink: item.permalink_url || "",
      postedAt: new Date(item.created_time),
      insights: {
        reach: insights.post_impressions_unique || 0,
        impressions: insights.post_impressions || 0,
        likeCount: 0,
        commentsCount: 0,
        saved: 0,
        shares: item.shares?.count || 0,
      },
      lastSyncedAt: new Date(),
      raw: item,
    });
  }
  return records;
}

export async function syncSocialPosts({ companyId, channelId }) {
  const channel = await getChannelForSync({ channelId, companyId });
  if (!channel || channel.provider !== "meta" || channel.channelType !== "social") {
    throw new HttpError(404, "Social channel not found");
  }

  await updateChannelSyncState({ channelId, companyId, sync: { orders: "running" } });

  try {
    const [igRecords, fbRecords] = await Promise.all([
      syncInstagramPosts({ companyId, channelId, channel }),
      syncFacebookPosts({ companyId, channelId, channel }),
    ]);
    const records = [...igRecords, ...fbRecords];
    await upsertSocialPosts(records);

    const updatedChannel = await updateChannelSyncState({
      channelId, companyId, sync: { orders: "idle", lastSyncAt: new Date(), lastError: undefined },
    });

    return { channel: updatedChannel, syncedRows: records.length };
  } catch (error) {
    await updateChannelSyncState({ channelId, companyId, sync: { orders: "failed", lastError: error.message } });
    throw error;
  }
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function syncCommentsForPost({ companyId, channelId, postId }) {
  const [channel, post] = await Promise.all([
    getChannelForSync({ channelId, companyId }),
    getSocialPost({ companyId, postId }),
  ]);
  if (!channel) throw new HttpError(404, "Social channel not found");
  if (!post) throw new HttpError(404, "Post not found");

  const params = new URLSearchParams({
    fields: "id,text,username,timestamp,parent_id",
    limit: "50",
    access_token: channel.credentials.accessToken,
  });
  const commentField = post.platform === "instagram" ? "comments" : "comments";
  const rows = await graphFetchAll(`${GRAPH_BASE()}/${post.externalPostId}/${commentField}?${params.toString()}`, { maxRows: 200 });

  const records = rows.map((row) => ({
    companyId,
    channelId,
    postId: post._id,
    externalCommentId: row.id,
    parentCommentId: row.parent_id || "",
    fromUsername: row.username || row.from?.name || "",
    fromId: row.from?.id || "",
    text: row.text || row.message || "",
    postedAt: new Date(row.timestamp || row.created_time),
    isOwnReply: false,
    raw: row,
  }));

  if (records.length) await upsertSocialComments(records);
  return listCommentsForPost({ companyId, postId: post._id });
}

// postId is the local SocialPost._id the comment thread is already open
// on (the frontend always has this — the reply box lives inside an open
// post's comment panel), passed through so the saved reply links to the
// right post without an extra lookup call to Meta.
export async function replyToComment({ companyId, channelId, postId, commentId, message }) {
  const channel = await getChannelForSync({ channelId, companyId });
  if (!channel) throw new HttpError(404, "Social channel not found");
  if (!message?.trim()) throw new HttpError(400, "Reply message is required");

  const params = new URLSearchParams({ message, access_token: channel.credentials.accessToken });
  const body = await graphFetch(`${GRAPH_BASE()}/${commentId}/replies?${params.toString()}`, { method: "POST" }).catch(() => {
    // Facebook Page comments use POST /{comment-id}/comments instead of
    // /replies (Instagram-specific endpoint) — retry the Facebook shape
    // before giving up.
    const fbParams = new URLSearchParams({ message, access_token: channel.credentials.accessToken });
    return graphFetch(`${GRAPH_BASE()}/${commentId}/comments?${fbParams.toString()}`, { method: "POST" });
  });

  const [saved] = await upsertSocialComments([{
    companyId,
    channelId,
    postId,
    externalCommentId: body.id,
    parentCommentId: commentId,
    fromUsername: "",
    fromId: "",
    text: message,
    postedAt: new Date(),
    isOwnReply: true,
    raw: body,
  }]);

  return { reply: saved };
}
