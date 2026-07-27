import { Router } from "express";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/auth.js";
import { disconnectChannel, getDashboardSummary, getStoreMode, listChannels, listCommerceRecords } from "../../repositories/store.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { buildShopifyInstallUrl, completeShopifyConnection, syncShopifyData, updateShopifyRecord } from "./shopify.service.js";

export const channelRoutes = Router();

const supportedChannels = [
  { provider: "shopify", name: "Shopify", status: "available", phase: "Phase 3" },
  { provider: "woocommerce", name: "WooCommerce", status: "planned", phase: "Phase 3" },
  { provider: "amazon", name: "Amazon", status: "planned", phase: "Phase 3" },
  { provider: "flipkart", name: "Flipkart", status: "planned", phase: "Phase 3" },
  { provider: "meesho", name: "Meesho", status: "planned", phase: "Later" },
  { provider: "glowroad", name: "GlowRoad", status: "planned", phase: "Later" },
  { provider: "jiomart", name: "JioMart", status: "planned", phase: "Later" },
  { provider: "myntra", name: "Myntra", status: "planned", phase: "Later" },
  { provider: "ajio", name: "Ajio", status: "planned", phase: "Later" },
  { provider: "etsy", name: "Etsy", status: "planned", phase: "Later" },
];

channelRoutes.get("/supported", (_req, res) => {
  res.json({ channels: supportedChannels });
});

channelRoutes.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const channels = await listChannels(req.auth.companyId);

    res.json({ channels, store: getStoreMode() });
  }),
);

channelRoutes.get(
  "/dashboard",
  requireAuth,
  asyncHandler(async (req, res) => {
    const dashboard = await getDashboardSummary(req.auth.companyId);

    res.json({ dashboard, store: getStoreMode() });
  }),
);

channelRoutes.get(
  "/records/:resource",
  requireAuth,
  asyncHandler(async (req, res) => {
    const records = await listCommerceRecords({
      companyId: req.auth.companyId,
      resource: req.params.resource,
    });

    if (!records) {
      throw new HttpError(400, "Unsupported synced record type");
    }

    res.json({ records, store: getStoreMode() });
  }),
);

channelRoutes.patch(
  "/records/:resource/:recordId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await updateShopifyRecord({
      companyId: req.auth.companyId,
      resource: req.params.resource,
      recordId: req.params.recordId,
      payload: req.body || {},
    });

    res.json({
      message: "Shopify record updated",
      ...result,
    });
  }),
);

channelRoutes.post(
  "/shopify/connect",
  requireAuth,
  asyncHandler(async (req, res) => {
    const installUrl = buildShopifyInstallUrl({
      shop: req.body.shop || "",
      companyId: req.auth.companyId,
      userId: req.auth.sub,
    });

    res.json({ provider: "shopify", installUrl });
  }),
);

channelRoutes.get(
  "/shopify/callback",
  asyncHandler(async (req, res) => {
    const channel = await completeShopifyConnection(req.query);
    const successUrl = new URL("/panel", env.frontendUrl);
    successUrl.searchParams.set("view", "Channels");
    successUrl.searchParams.set("provider", "shopify");
    successUrl.searchParams.set("status", "connected");
    successUrl.searchParams.set("channelId", String(channel._id));

    res.redirect(successUrl.toString());
  }),
);

channelRoutes.post(
  "/:channelId/sync",
  requireAuth,
  asyncHandler(async (req, res) => {
    const channel = await syncShopifyData({
      channelId: req.params.channelId,
      companyId: req.auth.companyId,
    });

    if (!channel) {
      throw new HttpError(404, "Channel not found");
    }

    res.json({
      message: "Shopify data synced",
      channel: {
        id: channel.id || channel._id,
        provider: channel.provider,
        name: channel.name,
        shop: channel.shop,
        status: channel.status,
        sync: channel.sync,
        metrics: channel.metrics,
      },
    });
  }),
);

channelRoutes.delete(
  "/:channelId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const channel = await disconnectChannel({
      channelId: req.params.channelId,
      companyId: req.auth.companyId,
    });

    if (!channel) {
      throw new HttpError(404, "Channel not found");
    }

    res.json({ channel });
  }),
);
