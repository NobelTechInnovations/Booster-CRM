import { Router } from "express";
import { env } from "../../config/env.js";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { listAdsChannels, getChannelForSync } from "../../repositories/channel.repo.js";
import { getAdsSummary, linkAdProduct, listAdInsights } from "../../repositories/ad-insight.repo.js";
import {
  buildMetaAuthorizeUrl,
  completeMetaConnection,
  listMetaAdAccountsForChannel,
  runAttribution,
  selectMetaAdAccount,
  syncAdInsights,
  getMetaAdSpendToday,
  getAdsDemographics,
} from "./meta.service.js";

export const adsRoutes = Router();

// ─── Meta OAuth ──────────────────────────────────────────────────────────────

adsRoutes.post(
  "/meta/connect",
  requireAuth,
  requirePermission("ads:manage"),
  asyncHandler(async (req, res) => {
    const installUrl = buildMetaAuthorizeUrl({ companyId: req.auth.companyId, userId: req.auth.sub });
    res.json({ provider: "meta", installUrl });
  }),
);

adsRoutes.get(
  "/meta/callback",
  asyncHandler(async (req, res) => {
    // This is a full-page browser redirect from Meta, not a fetch() call — if we throw here the
    // user lands on a raw JSON error page instead of back in the app. Always redirect into the
    // panel, carrying either the connected channel or a readable error message as query params.
    try {
      const { channel } = await completeMetaConnection(req.query);
      const successUrl = new URL("/panel/ads", env.frontendUrl);
      successUrl.searchParams.set("provider", "meta");
      successUrl.searchParams.set("status", "connected");
      successUrl.searchParams.set("channelId", String(channel._id || channel.id));

      res.redirect(successUrl.toString());
    } catch (error) {
      console.error("[Meta OAuth] Callback failed:", error.message, error.details || "");

      const failureUrl = new URL("/panel/ads", env.frontendUrl);
      failureUrl.searchParams.set("provider", "meta");
      failureUrl.searchParams.set("status", "error");
      failureUrl.searchParams.set("message", error.message || "Meta connection failed");

      res.redirect(failureUrl.toString());
    }
  }),
);

adsRoutes.get(
  "/channels",
  requireAuth,
  asyncHandler(async (req, res) => {
    const channels = await listAdsChannels(req.auth.companyId);
    res.json({ channels });
  }),
);

adsRoutes.get(
  "/meta/:channelId/ad-accounts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const adAccounts = await listMetaAdAccountsForChannel({ companyId: req.auth.companyId, channelId: req.params.channelId });
    res.json({ adAccounts });
  }),
);

adsRoutes.post(
  "/meta/:channelId/select-account",
  requireAuth,
  requirePermission("ads:manage"),
  asyncHandler(async (req, res) => {
    const channel = await selectMetaAdAccount({
      companyId: req.auth.companyId,
      channelId: req.params.channelId,
      adAccountId: req.body?.adAccountId,
      adAccountName: req.body?.adAccountName,
      adAccountCurrency: req.body?.adAccountCurrency,
    });
    res.json({ message: "Ad account selected", channel });
  }),
);

// ─── Sync & Attribution ──────────────────────────────────────────────────────

adsRoutes.post(
  "/:channelId/sync",
  requireAuth,
  requirePermission("ads:manage"),
  asyncHandler(async (req, res) => {
    const result = await syncAdInsights({
      companyId: req.auth.companyId,
      channelId: req.params.channelId,
      days: req.body?.days,
    });
    res.json({ message: `Synced ${result.syncedRows} ad-day rows from Meta`, ...result });
  }),
);

// Live "what's it at right now" check — does NOT write to AdInsight or the
// finance ledger. The official daily figure only ever moves via the 8am
// scheduled sync (see vercel.json), so this can be clicked as often as
// wanted without the reported total drifting depending on when someone looks.
adsRoutes.get(
  "/:channelId/spend-today",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await getMetaAdSpendToday({ companyId: req.auth.companyId, channelId: req.params.channelId });
    res.json(result);
  }),
);

// Age/gender delivery breakdown — Meta's own reported demographics for who
// saw/converted the ads, for targeting decisions. Live call, not synced/stored.
adsRoutes.get(
  "/:channelId/demographics",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await getAdsDemographics({
      companyId: req.auth.companyId,
      channelId: req.params.channelId,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(result);
  }),
);

adsRoutes.post(
  "/:channelId/recompute-attribution",
  requireAuth,
  requirePermission("ads:manage"),
  asyncHandler(async (req, res) => {
    const channel = await getChannelForSync({ channelId: req.params.channelId, companyId: req.auth.companyId });
    const result = await runAttribution({
      companyId: req.auth.companyId,
      channelId: req.params.channelId,
      // Scope to whichever ad account is currently selected — otherwise
      // this recomputes attribution across every account ever synced on
      // this channel, mixing accounts together the same way the summary
      // used to.
      adAccountId: channel?.external?.adAccountId,
      from: req.body?.from,
      to: req.body?.to,
    });
    res.json({ message: `Recomputed attribution for ${result.updated} ad-day rows`, ...result });
  }),
);

// ─── Insights ────────────────────────────────────────────────────────────────

// Resolves which ad account to scope insights/summary reads to: the caller
// can pass channelId explicitly (query param), otherwise this falls back to
// the company's first connected Meta channel — either way, the returned
// adAccountId is whatever's CURRENTLY selected on that channel, so a read
// right after switching accounts reflects the new account, not a blend of
// every account ever synced there.
async function resolveAdAccountScope({ companyId, channelId }) {
  const channel = channelId
    ? await getChannelForSync({ channelId, companyId })
    : (await listAdsChannels(companyId))[0];
  return { channelId: channel?._id, adAccountId: channel?.external?.adAccountId };
}

adsRoutes.get(
  "/insights",
  requireAuth,
  asyncHandler(async (req, res) => {
    const scope = await resolveAdAccountScope({ companyId: req.auth.companyId, channelId: req.query.channelId });
    const insights = await listAdInsights({
      companyId: req.auth.companyId,
      from: req.query.from,
      to: req.query.to,
      campaignId: req.query.campaignId,
      channelId: scope.channelId,
      adAccountId: scope.adAccountId,
    });
    res.json({ insights });
  }),
);

adsRoutes.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const scope = await resolveAdAccountScope({ companyId: req.auth.companyId, channelId: req.query.channelId });
    const summary = await getAdsSummary({
      companyId: req.auth.companyId,
      from: req.query.from,
      to: req.query.to,
      channelId: scope.channelId,
      adAccountId: scope.adAccountId,
    });
    res.json({ summary });
  }),
);

adsRoutes.post(
  "/insights/:insightId/link-product",
  requireAuth,
  requirePermission("ads:manage"),
  asyncHandler(async (req, res) => {
    const result = await linkAdProduct({
      companyId: req.auth.companyId,
      insightId: req.params.insightId,
      productTitle: req.body?.productTitle || "",
    });
    if (result.error) throw new HttpError(404, result.error);
    res.json({ message: "Ad linked to product", insight: result.insight });
  }),
);
