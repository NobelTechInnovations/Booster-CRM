import mongoose from "mongoose";
import { isMongoConnected } from "../config/database.js";
import { AdInsight } from "../models/ad-insight.model.js";
import { memory, id, clone, now, toNumber } from "./memory-store.js";

function parseDateRange({ from, to }) {
  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = from ? new Date(from) : new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// Meta invoices ad spend plus 18% GST in India — the number Meta's own dashboard
// shows is pre-GST "spend", so every cost/profit calculation that treats ad spend
// as real cash outflow needs to gross it up by this rate.
export const AD_GST_RATE = 0.18;

// companyId/channelId are stored as Schema.Types.Mixed, so the same logical id
// can end up saved as either a plain string or an ObjectId depending on what
// the caller passed at write time. An exact-match filter on a Mixed field only
// matches one of those BSON types, which silently created duplicate AdInsight
// rows (and inflated spend totals) every time a value was written as the other
// type — mirrors the identical fix already applied to SyncedOrder's recordFilter.
function mixedIdFilter(idValue) {
  const str = String(idValue || "");
  return mongoose.Types.ObjectId.isValid(str) ? { $in: [str, new mongoose.Types.ObjectId(str)] } : str;
}

// ─── Upsert (Meta sync writes here) ─────────────────────────────────────────

export async function upsertAdInsights(records) {
  if (!records.length) return [];

  if (isMongoConnected()) {
    await AdInsight.bulkWrite(
      records.map((record) => ({
        updateOne: {
          filter: {
            companyId: mixedIdFilter(record.companyId),
            channelId: mixedIdFilter(record.channelId),
            adId: record.adId,
            date: record.date,
          },
          update: { $set: record },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return AdInsight.find({
      companyId: mixedIdFilter(records[0].companyId),
      channelId: mixedIdFilter(records[0].channelId),
      adId: { $in: records.map((r) => r.adId) },
    }).lean();
  }

  const saved = [];
  for (const record of records) {
    // Key deliberately does NOT include adAccountId — matches the unique
    // Mongo index above (companyId/channelId/adId/date only). Meta ad IDs
    // are globally unique per the platform's own docs, so the same adId
    // legitimately belonging to two different ad accounts under one
    // channel shouldn't happen; the record's own adAccountId field (set
    // below via `...record`) is still what every read filters on.
    const key = `${record.companyId}:${record.channelId}:${record.adId}:${dayKey(record.date)}`;
    const existing = memory.adInsights.get(key);
    const stored = { _id: existing?._id || id(), ...existing, ...record, updatedAt: now(), createdAt: existing?.createdAt || now() };
    memory.adInsights.set(key, stored);
    saved.push(clone(stored));
  }
  return saved;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listAdInsights({ companyId, from, to, campaignId, channelId, adAccountId }) {
  const { start, end } = parseDateRange({ from, to });
  const filter = {
    companyId: mixedIdFilter(companyId),
    date: { $gte: start, $lte: end },
    ...(campaignId ? { campaignId } : {}),
    ...(channelId ? { channelId: mixedIdFilter(channelId) } : {}),
    // Isolates the currently-selected ad account's rows from every other
    // account ever synced on this channel — without this, switching ad
    // accounts just blends both accounts' numbers together instead of
    // showing the newly-selected one's own data.
    ...(adAccountId ? { adAccountId } : {}),
  };

  if (isMongoConnected()) {
    return AdInsight.find(filter).sort({ date: -1 }).limit(5000).lean();
  }

  return [...memory.adInsights.values()]
    .filter((row) => {
      if (String(row.companyId) !== String(companyId)) return false;
      if (campaignId && row.campaignId !== campaignId) return false;
      if (channelId && String(row.channelId) !== String(channelId)) return false;
      if (adAccountId && row.adAccountId !== adAccountId) return false;
      const d = new Date(row.date);
      return d >= start && d <= end;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(clone);
}

export async function getAdSpendTotal({ companyId, from, to, channelId, adAccountId }) {
  const rows = await listAdInsights({ companyId, from, to, channelId, adAccountId });
  const spend = rows.reduce((sum, row) => sum + toNumber(row.spend), 0);
  const gstAmount = spend * AD_GST_RATE;
  return {
    spend,
    gstAmount,
    spendWithGst: spend + gstAmount,
    attributedRevenue: rows.reduce((sum, row) => sum + toNumber(row.attributedRevenue), 0),
    attributedOrders: rows.reduce((sum, row) => sum + toNumber(row.attributedOrders), 0),
  };
}

export async function getAdsSummary({ companyId, from, to, channelId, adAccountId }) {
  const rows = await listAdInsights({ companyId, from, to, channelId, adAccountId });
  const currency = rows.find((row) => row.currency)?.currency || "INR";

  const spend = rows.reduce((sum, row) => sum + toNumber(row.spend), 0);
  const impressions = rows.reduce((sum, row) => sum + toNumber(row.impressions), 0);
  // Reach is a per-day unique count from Meta — summing across days over-counts people reached
  // more than once, so this is a "reach-days" style approximation, not deduped account reach.
  const reach = rows.reduce((sum, row) => sum + toNumber(row.reach), 0);
  const clicks = rows.reduce((sum, row) => sum + toNumber(row.clicks), 0);
  const linkClicks = rows.reduce((sum, row) => sum + toNumber(row.linkClicks), 0);
  const attributedRevenue = rows.reduce((sum, row) => sum + toNumber(row.attributedRevenue), 0);
  const attributedOrders = rows.reduce((sum, row) => sum + toNumber(row.attributedOrders), 0);

  const roas = spend ? attributedRevenue / spend : 0;
  const cpa = attributedOrders ? spend / attributedOrders : 0;
  const ctr = impressions ? (clicks / impressions) * 100 : 0;
  const cpc = clicks ? spend / clicks : 0;
  const cpm = impressions ? (spend / impressions) * 1000 : 0;
  const costPerLinkClick = linkClicks ? spend / linkClicks : 0;
  const frequency = reach ? impressions / reach : 0;

  const trendMap = new Map();
  const campaignMap = new Map();
  const adMap = new Map();

  for (const row of rows) {
    const dKey = dayKey(row.date);
    const trendEntry = trendMap.get(dKey) || { date: dKey, spend: 0, revenue: 0, orders: 0 };
    trendEntry.spend += toNumber(row.spend);
    trendEntry.revenue += toNumber(row.attributedRevenue);
    trendEntry.orders += toNumber(row.attributedOrders);
    trendMap.set(dKey, trendEntry);

    const cKey = row.campaignId || row.campaignName || "unknown";
    const campaignEntry = campaignMap.get(cKey) || {
      campaignId: row.campaignId,
      campaignName: row.campaignName || "Unnamed campaign",
      spend: 0,
      revenue: 0,
      orders: 0,
    };
    campaignEntry.spend += toNumber(row.spend);
    campaignEntry.revenue += toNumber(row.attributedRevenue);
    campaignEntry.orders += toNumber(row.attributedOrders);
    campaignMap.set(cKey, campaignEntry);

    const aKey = row.adId;
    const adEntry = adMap.get(aKey) || {
      id: row._id,
      adId: row.adId,
      adName: row.adName || "Unnamed ad",
      campaignName: row.campaignName || "",
      linkedProductTitle: row.linkedProductTitle || "",
      spend: 0,
      revenue: 0,
      orders: 0,
      impressions: 0,
      clicks: 0,
    };
    adEntry.spend += toNumber(row.spend);
    adEntry.revenue += toNumber(row.attributedRevenue);
    adEntry.orders += toNumber(row.attributedOrders);
    adEntry.impressions += toNumber(row.impressions);
    adEntry.clicks += toNumber(row.clicks);
    if (row.linkedProductTitle) adEntry.linkedProductTitle = row.linkedProductTitle;
    adEntry.id = row._id;
    adMap.set(aKey, adEntry);
  }

  const withRoas = (entry) => ({ ...entry, roas: entry.spend ? Math.round((entry.revenue / entry.spend) * 100) / 100 : 0 });

  const gstAmount = spend * AD_GST_RATE;

  return {
    totals: {
      currency,
      spend: Math.round(spend),
      // Meta invoices spend + 18% GST in India; "spend" above is what Meta's own
      // dashboard shows, these two add the real cash cost on top of it.
      gstAmount: Math.round(gstAmount),
      spendWithGst: Math.round(spend + gstAmount),
      impressions,
      reach,
      frequency: Math.round(frequency * 100) / 100,
      clicks,
      linkClicks,
      ctr: Math.round(ctr * 100) / 100,
      cpc: Math.round(cpc * 100) / 100,
      cpm: Math.round(cpm * 100) / 100,
      costPerLinkClick: Math.round(costPerLinkClick * 100) / 100,
      attributedRevenue: Math.round(attributedRevenue),
      attributedOrders,
      roas: Math.round(roas * 100) / 100,
      cpa: Math.round(cpa),
    },
    trend: [...trendMap.values()]
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .map((entry) => ({ ...entry, spend: Math.round(entry.spend), revenue: Math.round(entry.revenue) })),
    campaigns: [...campaignMap.values()].map(withRoas).sort((a, b) => b.spend - a.spend),
    ads: [...adMap.values()].map(withRoas).sort((a, b) => b.spend - a.spend),
  };
}

export async function linkAdProduct({ companyId, insightId, productTitle }) {
  if (isMongoConnected()) {
    const insight = await AdInsight.findOneAndUpdate(
      { _id: insightId, companyId: mixedIdFilter(companyId) },
      { $set: { linkedProductTitle: productTitle } },
      { new: true },
    ).lean();
    return { insight };
  }

  for (const row of memory.adInsights.values()) {
    if (String(row._id) === String(insightId) && String(row.companyId) === String(companyId)) {
      row.linkedProductTitle = productTitle;
      row.updatedAt = now();
      return { insight: clone(row) };
    }
  }
  return { error: "Ad insight not found" };
}

export async function setAttribution({ companyId, channelId, adId, date, attributedRevenue, attributedOrders }) {
  const update = { attributedRevenue, attributedOrders, lastAttributedAt: new Date() };

  if (isMongoConnected()) {
    return AdInsight.findOneAndUpdate(
      { companyId: mixedIdFilter(companyId), channelId: mixedIdFilter(channelId), adId, date },
      { $set: update },
      { new: true },
    ).lean();
  }

  const key = `${companyId}:${channelId}:${adId}:${dayKey(date)}`;
  const row = memory.adInsights.get(key);
  if (!row) return null;
  Object.assign(row, update, { updatedAt: now() });
  return clone(row);
}
