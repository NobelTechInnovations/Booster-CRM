import { Router } from "express";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  disconnectChannel,
  getChannelForSync,
  getStoreMode,
  listChannels,
} from "../../repositories/channel.repo.js";
import {
  listCommerceRecords,
  listProductMappingOptions,
  listProductMappings,
  saveProductMapping,
  getSavedCommerceData,
  getDashboardSummary,
} from "../../repositories/order.repo.js";
import { updateAmazonConfig } from "../../repositories/company.repo.js";
import { getShippingProvider } from "../shipping/shipping-registry.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import {
  buildAmazonAuthorizeUrl,
  connectAmazonPrivateApp,
  buildAmazonLoginRedirectUrl,
  completeAmazonConnection,
  createAmazonPendingState,
  syncAmazonData,
} from "./amazon.service.js";
import { buildShopifyInstallUrl, completeShopifyConnection, syncShopifyData, updateShopifyRecord } from "./shopify.service.js";
import {
  cancelVelocityOrder,
  checkVelocityServiceability,
  connectVelocity,
  createVelocityForwardOrder,
  createVelocityReverseOrder,
  createVelocityWarehouse,
  fetchShipments,
  fetchWarehouses,
  getVelocityReports,
  trackVelocityOrder,
} from "./velocity.service.js";

export const channelRoutes = Router();

function readCookie(req, name) {
  const cookieHeader = String(req.headers.cookie || "");
  const cookies = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of cookies) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = entry.slice(0, separatorIndex);
    const value = entry.slice(separatorIndex + 1);
    if (key === name) {
      return decodeURIComponent(value);
    }
  }

  return "";
}

function setCookie(res, name, value, { maxAge = 600 } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/api/channels/amazon",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  if (env.nodeEnv === "production") {
    parts.push("Secure");
  }

  res.setHeader("Set-Cookie", parts.join("; "));
}

const supportedChannels = [
  { provider: "shopify", name: "Shopify", status: "available", phase: "Phase 3" },
  { provider: "woocommerce", name: "WooCommerce", status: "planned", phase: "Phase 3" },
  { provider: "amazon", name: "Amazon", status: "available", phase: "Phase 3" },
  { provider: "velocity", name: "Velocity Shipping", status: "available", phase: "Phase 10" },
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

channelRoutes.get(
  "/product-mappings/options",
  requireAuth,
  asyncHandler(async (req, res) => {
    const options = await listProductMappingOptions(req.auth.companyId);

    res.json({ options, store: getStoreMode() });
  }),
);

channelRoutes.get(
  "/product-mappings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const mappings = await listProductMappings(req.auth.companyId);

    res.json({ mappings, store: getStoreMode() });
  }),
);

channelRoutes.post(
  "/product-mappings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await saveProductMapping({
      companyId: req.auth.companyId,
      masterName: req.body?.masterName,
      mappings: req.body?.mappings,
    });

    if (result.error) {
      throw new HttpError(400, result.error);
    }

    res.json({ message: "Product mapping saved", mapping: result.mapping });
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

channelRoutes.put(
  "/amazon/setup",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await updateAmazonConfig({
      companyId: req.auth.companyId,
      payload: req.body || {},
    });

    if (result.error) {
      throw new HttpError(400, result.error);
    }

    res.json({ message: "Amazon setup saved", config: result.config });
  }),
);

channelRoutes.post(
  "/amazon/connect",
  requireAuth,
  asyncHandler(async (req, res) => {
    const pendingState = createAmazonPendingState({
      companyId: req.auth.companyId,
      userId: req.auth.sub,
      marketplaceId: req.body?.marketplaceId,
      draftMode: req.body?.draftMode,
    });
    const installUrl = await buildAmazonAuthorizeUrl({
      companyId: req.auth.companyId,
      userId: req.auth.sub,
    });

    setCookie(res, "amazon_connect_state", pendingState);
    res.json({ provider: "amazon", installUrl });
  }),
);

channelRoutes.post(
  "/amazon/connect-private",
  requireAuth,
  asyncHandler(async (req, res) => {
    const channel = await connectAmazonPrivateApp({
      companyId: req.auth.companyId,
      userId: req.auth.sub,
      refreshToken: req.body?.refreshToken,
      sellerId: req.body?.sellerId,
    });

    res.json({
      message: "Amazon private app connected",
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

channelRoutes.get(
  "/amazon/login",
  asyncHandler(async (req, res) => {
    const pendingState = readCookie(req, "amazon_connect_state");
    const redirectUrl = buildAmazonLoginRedirectUrl(req.query, pendingState);

    setCookie(res, "amazon_connect_state", "", { maxAge: 0 });
    res.redirect(redirectUrl);
  }),
);

channelRoutes.get(
  "/amazon/callback",
  asyncHandler(async (req, res) => {
    const channel = await completeAmazonConnection(req.query);
    const successUrl = new URL("/panel", env.frontendUrl);
    successUrl.searchParams.set("view", "Channels");
    successUrl.searchParams.set("provider", "amazon");
    successUrl.searchParams.set("status", "connected");
    successUrl.searchParams.set("channelId", String(channel._id));

    res.redirect(successUrl.toString());
  }),
);

channelRoutes.post(
  "/velocity/connect",
  requireAuth,
  asyncHandler(async (req, res) => {
    const channel = await connectVelocity({
      companyId: req.auth.companyId,
      userId: req.auth.sub,
      username: req.body?.username,
      password: req.body?.password,
    });

    res.json({
      message: "Velocity Shipping connected",
      channel: {
        id: channel._id,
        provider: channel.provider,
        name: channel.name,
        status: channel.status,
      },
    });
  }),
);

channelRoutes.post(
  "/velocity/warehouses",
  requireAuth,
  asyncHandler(async (req, res) => {
    const warehouse = await createVelocityWarehouse({
      companyId: req.auth.companyId,
      payload: req.body || {},
    });

    res.json({ message: "Warehouse created", warehouse });
  }),
);

channelRoutes.get(
  "/velocity/warehouses",
  requireAuth,
  asyncHandler(async (req, res) => {
    const warehouses = await fetchWarehouses(req.auth.companyId);

    res.json({ warehouses });
  }),
);

channelRoutes.post(
  "/velocity/serviceability",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await checkVelocityServiceability({
      companyId: req.auth.companyId,
      payload: req.body || {},
    });

    res.json(result);
  }),
);

channelRoutes.post(
  "/velocity/orders/forward",
  requireAuth,
  asyncHandler(async (req, res) => {
    const shipment = await createVelocityForwardOrder({
      companyId: req.auth.companyId,
      payload: req.body || {},
    });

    res.json({ message: "Forward shipment created", shipment });
  }),
);

channelRoutes.post(
  "/velocity/orders/reverse",
  requireAuth,
  asyncHandler(async (req, res) => {
    const shipment = await createVelocityReverseOrder({
      companyId: req.auth.companyId,
      payload: req.body || {},
    });

    res.json({ message: "Reverse pickup shipment created", shipment });
  }),
);

channelRoutes.post(
  "/velocity/orders/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await cancelVelocityOrder({
      companyId: req.auth.companyId,
      awbs: req.body?.awbs || [],
    });

    res.json(result);
  }),
);

channelRoutes.post(
  "/velocity/orders/track",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await trackVelocityOrder({
      companyId: req.auth.companyId,
      awbs: req.body?.awbs || [],
    });

    res.json(result);
  }),
);

channelRoutes.post(
  "/velocity/reports",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await getVelocityReports({
      companyId: req.auth.companyId,
      payload: req.body || {},
    });

    res.json(result);
  }),
);

channelRoutes.get(
  "/velocity/shipments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const shipments = await fetchShipments(req.auth.companyId);

    res.json({ shipments });
  }),
);

channelRoutes.post(
  "/:channelId/sync",
  requireAuth,
  asyncHandler(async (req, res) => {
    const channelForSync = await getChannelForSync({
      channelId: req.params.channelId,
      companyId: req.auth.companyId,
    });

    if (!channelForSync) {
      throw new HttpError(404, "Channel not found");
    }

    let channel;
    if (channelForSync.provider === "shopify") {
      channel = await syncShopifyData({
        channelId: req.params.channelId,
        companyId: req.auth.companyId,
      });
    } else if (channelForSync.provider === "amazon") {
      channel = await syncAmazonData({
        channelId: req.params.channelId,
        companyId: req.auth.companyId,
      });
    } else {
      throw new HttpError(400, "This channel provider cannot sync yet");
    }

    if (!channel) {
      throw new HttpError(404, "Channel not found");
    }

    res.json({
      message: `${channel.provider === "amazon" ? "Amazon" : "Shopify"} data synced`,
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
