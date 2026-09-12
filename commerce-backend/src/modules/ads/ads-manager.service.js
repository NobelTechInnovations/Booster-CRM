import { URLSearchParams } from "node:url";
import { env } from "../../config/env.js";
import { getChannelForSync } from "../../repositories/channel.repo.js";
import { HttpError } from "../../utils/http-error.js";
import { graphFetch } from "../../utils/graph-api.js";

// The live-editing half of the Meta Ads integration — meta.service.js
// handles OAuth + the read-only insights sync/spend/demographics/
// attribution; this handles listing and actually editing campaigns, ad
// sets, and ads on the real, live ad account. There is no draft/staging
// step — every write here goes straight to Meta, the same way shipping an
// order or sending a WhatsApp template is the real action, not a preview
// of one.
//
// Requires the ads_management scope (added in config/env.js's default
// meta.scopes) — a channel connected before that scope existed only has a
// token good for reading, and every write function below will fail with a
// Meta permissions error until that channel is disconnected and
// reconnected once (Channels → Ads) to pick up the new scope.

const GRAPH_BASE = () => `https://graph.facebook.com/${env.meta.apiVersion}`;

// ISO 4217 currencies Meta (and everyone else) treats as having no minor
// unit — everything else, INR included, uses a 2-decimal minor unit, so a
// ₹500 daily budget is sent to Meta as 50000. Budgets in the Marketing API
// are always specified in the ad account's own currency's smallest unit;
// getting this wrong silently sets a budget 100x smaller (or larger) than
// intended, not an error Meta would ever surface.
const ZERO_DECIMAL_CURRENCIES = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

function toMinorUnits(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return ZERO_DECIMAL_CURRENCIES.has(String(currency || "").toUpperCase()) ? Math.round(n) : Math.round(n * 100);
}

function fromMinorUnits(amount, currency) {
  const n = Number(amount || 0);
  return ZERO_DECIMAL_CURRENCIES.has(String(currency || "").toUpperCase()) ? n : n / 100;
}

async function requireMetaChannel({ companyId, channelId }) {
  const channel = await getChannelForSync({ channelId, companyId });
  if (!channel || channel.provider !== "meta") throw new HttpError(404, "Meta Ads channel not found");
  if (!channel.external?.adAccountId) throw new HttpError(400, "Select a Meta ad account first (Channels → Ads)");
  return channel;
}

// Meta's mutation endpoints accept a plain form-encoded POST body — object/
// array field values (targeting, object_story_spec, creative) are sent as
// their JSON string form within that body, exactly like Meta's own API
// examples show, rather than switching to a JSON request body.
function buildFormParams(fields, accessToken) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    params.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  params.append("access_token", accessToken);
  return params;
}

async function metaPost(pathOrId, fields, accessToken) {
  return graphFetch(`${GRAPH_BASE()}/${pathOrId}`, { method: "POST", body: buildFormParams(fields, accessToken) });
}

// ─── Reading (campaigns → ad sets → ads, each with its own trailing 30-day
// insights) ───────────────────────────────────────────────────────────────

function extractInsightsSummary(entity) {
  const row = entity.insights?.data?.[0];
  if (!row) return { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, purchases: 0 };
  const purchaseAction = (row.actions || []).find((a) => a.action_type === "purchase" || a.action_type === "omni_purchase");
  return {
    spend: Number(row.spend || 0),
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    ctr: Number(row.ctr || 0),
    cpc: Number(row.cpc || 0),
    purchases: purchaseAction ? Number(purchaseAction.value || 0) : 0,
  };
}

// Only the handful of targeting fields this app's editor actually exposes
// (age range, gender, country list) — a real ad set's targeting object can
// carry dozens of other dimensions (detailed interests, custom audiences,
// placements, device/OS...); those are left exactly as Meta has them,
// merged back in untouched by updateAdSet below, not editable from here.
function normalizeTargeting(targeting) {
  if (!targeting) return null;
  return {
    ageMin: targeting.age_min ?? 18,
    ageMax: targeting.age_max ?? 65,
    genders: targeting.genders?.length ? targeting.genders : [1, 2], // Meta convention: 1 = male, 2 = female, omitted/both = all
    countries: targeting.geo_locations?.countries || [],
  };
}

export async function listCampaigns({ companyId, channelId }) {
  const channel = await requireMetaChannel({ companyId, channelId });
  const currency = channel.external?.adAccountCurrency || "INR";
  const params = new URLSearchParams({
    fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,updated_time,insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions}",
    limit: "100",
    access_token: channel.credentials.accessToken,
  });
  const body = await graphFetch(`${GRAPH_BASE()}/${channel.external.adAccountId}/campaigns?${params.toString()}`);

  return {
    currency,
    campaigns: (body.data || []).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      effectiveStatus: c.effective_status,
      objective: c.objective,
      dailyBudget: c.daily_budget ? fromMinorUnits(c.daily_budget, currency) : null,
      lifetimeBudget: c.lifetime_budget ? fromMinorUnits(c.lifetime_budget, currency) : null,
      createdTime: c.created_time,
      updatedTime: c.updated_time,
      insights: extractInsightsSummary(c),
    })),
  };
}

export async function listAdSets({ companyId, channelId, campaignId }) {
  const channel = await requireMetaChannel({ companyId, channelId });
  const currency = channel.external?.adAccountCurrency || "INR";
  const params = new URLSearchParams({
    fields: "id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting,insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions}",
    limit: "100",
    access_token: channel.credentials.accessToken,
  });
  const body = await graphFetch(`${GRAPH_BASE()}/${campaignId}/adsets?${params.toString()}`);

  return {
    currency,
    adSets: (body.data || []).map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      effectiveStatus: a.effective_status,
      dailyBudget: a.daily_budget ? fromMinorUnits(a.daily_budget, currency) : null,
      lifetimeBudget: a.lifetime_budget ? fromMinorUnits(a.lifetime_budget, currency) : null,
      optimizationGoal: a.optimization_goal,
      billingEvent: a.billing_event,
      targeting: normalizeTargeting(a.targeting),
      insights: extractInsightsSummary(a),
    })),
  };
}

export async function listAds({ companyId, channelId, adSetId }) {
  const channel = await requireMetaChannel({ companyId, channelId });
  const currency = channel.external?.adAccountCurrency || "INR";
  const params = new URLSearchParams({
    fields: "id,name,status,effective_status,creative{id,object_story_spec,thumbnail_url,image_url,body,title},insights.date_preset(last_30d){spend,impressions,clicks,ctr,cpc,actions}",
    limit: "100",
    access_token: channel.credentials.accessToken,
  });
  const body = await graphFetch(`${GRAPH_BASE()}/${adSetId}/ads?${params.toString()}`);

  return {
    currency,
    ads: (body.data || []).map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      effectiveStatus: a.effective_status,
      creative: a.creative
        ? {
          id: a.creative.id,
          thumbnailUrl: a.creative.thumbnail_url || "",
          imageUrl: a.creative.image_url || "",
          caption: a.creative.object_story_spec?.link_data?.message || a.creative.body || "",
          title: a.creative.object_story_spec?.link_data?.name || a.creative.title || "",
        }
        : null,
      insights: extractInsightsSummary(a),
    })),
  };
}

// ─── Writing ─────────────────────────────────────────────────────────────────

export async function updateCampaign({ companyId, channelId, campaignId, status, dailyBudget, lifetimeBudget }) {
  const channel = await requireMetaChannel({ companyId, channelId });
  const currency = channel.external?.adAccountCurrency || "INR";
  const fields = {};
  if (status) fields.status = status;
  if (dailyBudget !== undefined) fields.daily_budget = toMinorUnits(dailyBudget, currency);
  if (lifetimeBudget !== undefined) fields.lifetime_budget = toMinorUnits(lifetimeBudget, currency);
  if (!Object.keys(fields).length) throw new HttpError(400, "Nothing to update");

  await metaPost(campaignId, fields, channel.credentials.accessToken);
  return { success: true };
}

export async function updateAdSet({ companyId, channelId, adSetId, status, dailyBudget, lifetimeBudget, targeting }) {
  const channel = await requireMetaChannel({ companyId, channelId });
  const currency = channel.external?.adAccountCurrency || "INR";
  const fields = {};
  if (status) fields.status = status;
  if (dailyBudget !== undefined) fields.daily_budget = toMinorUnits(dailyBudget, currency);
  if (lifetimeBudget !== undefined) fields.lifetime_budget = toMinorUnits(lifetimeBudget, currency);
  if (targeting) {
    fields.targeting = {
      age_min: targeting.ageMin,
      age_max: targeting.ageMax,
      genders: targeting.genders,
      ...(targeting.countries?.length ? { geo_locations: { countries: targeting.countries } } : {}),
    };
  }
  if (!Object.keys(fields).length) throw new HttpError(400, "Nothing to update");

  await metaPost(adSetId, fields, channel.credentials.accessToken);
  return { success: true };
}

export async function updateAdStatus({ companyId, channelId, adId, status }) {
  const channel = await requireMetaChannel({ companyId, channelId });
  if (!status) throw new HttpError(400, "Status is required");

  await metaPost(adId, { status }, channel.credentials.accessToken);
  return { success: true };
}

async function uploadAdImage({ adAccountId, accessToken, buffer, filename, mimeType }) {
  const form = new FormData();
  const name = filename || "creative.jpg";
  form.append(name, new Blob([buffer], { type: mimeType }), name);
  form.append("access_token", accessToken);

  const response = await fetch(`${GRAPH_BASE()}/${adAccountId}/adimages`, { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new HttpError(response.status >= 400 ? response.status : 502, body?.error?.message || "Meta image upload failed", body);
  }
  const images = body.images || {};
  const hash = images[Object.keys(images)[0]]?.hash;
  if (!hash) throw new HttpError(502, "Meta accepted the image but returned no usable hash");
  return hash;
}

// Meta ad creatives are immutable once created — there is no "edit this
// creative's caption/image" endpoint. "Editing" one always means: read the
// ad's current creative to preserve everything not being changed (the
// link, call-to-action, page), create a brand-new creative with the new
// caption and/or a freshly uploaded image, then point the ad at that new
// creative_id. The old creative is left exactly as it was (Meta keeps it
// around; ads history/reporting for past delivery still resolves to it).
export async function updateAdCreative({ companyId, channelId, adId, caption, imageFile }) {
  const channel = await requireMetaChannel({ companyId, channelId });
  const accessToken = channel.credentials.accessToken;

  const params = new URLSearchParams({ fields: "creative{object_story_spec}", access_token: accessToken });
  const adBody = await graphFetch(`${GRAPH_BASE()}/${adId}?${params.toString()}`);
  const currentSpec = adBody.creative?.object_story_spec;
  if (!currentSpec?.link_data) {
    throw new HttpError(400, "This ad's creative isn't a standard link/page-post format — editing it here isn't supported yet.");
  }

  let imageHash;
  if (imageFile) {
    imageHash = await uploadAdImage({
      adAccountId: channel.external.adAccountId,
      accessToken,
      buffer: imageFile.buffer,
      filename: imageFile.originalname,
      mimeType: imageFile.mimetype,
    });
  }

  const newSpec = {
    ...currentSpec,
    link_data: {
      ...currentSpec.link_data,
      ...(caption !== undefined && caption !== "" ? { message: caption } : {}),
      ...(imageHash ? { image_hash: imageHash, picture: undefined } : {}),
    },
  };

  const creative = await metaPost(
    `${channel.external.adAccountId}/adcreatives`,
    { name: `Updated via Wokbook — ${new Date().toISOString()}`, object_story_spec: newSpec },
    accessToken,
  );

  await metaPost(adId, { creative: { creative_id: creative.id } }, accessToken);

  return { success: true, creativeId: creative.id };
}
