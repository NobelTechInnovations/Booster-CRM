import { Router } from "express";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/auth.js";
import { disconnectChannel, getStoreMode, listChannels, queueChannelSync } from "../../repositories/store.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { buildShopifyInstallUrl, completeShopifyConnection } from "./shopify.service.js";

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
    const successUrl = new URL("/channels", env.frontendUrl);
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
    const channel = await queueChannelSync({
      channelId: req.params.channelId,
      companyId: req.auth.companyId,
    });

    if (!channel) {
      throw new HttpError(404, "Channel not found");
    }

    channel.sync = {
      products: "queued",
      orders: "queued",
      inventory: "queued",
      customers: "queued",
      lastSyncAt: new Date(),
      lastError: undefined,
    };

    await channel.save();

    res.json({
      message: "Shopify sync queued",
      channel: {
        id: channel._id,
        provider: channel.provider,
        shop: channel.shop,
        status: channel.status,
        sync: channel.sync,
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
