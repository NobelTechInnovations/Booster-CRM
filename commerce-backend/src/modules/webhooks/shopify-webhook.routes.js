import crypto from "node:crypto";
import { Router } from "express";
import { env } from "../../config/env.js";
import { getShopifyChannelByShop } from "../../repositories/channel.repo.js";
import { upsertSingleOrder, updateOrderOmsStatus } from "../../repositories/order.repo.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const shopifyWebhookRoutes = Router();

function verifyWebhookHmac(req) {
  if (!env.shopify.apiSecret) return true; // Skip if no secret set in dev

  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  if (!hmacHeader) return false;

  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  const digest = crypto.createHmac("sha256", env.shopify.apiSecret).update(rawBody, "utf8").digest("base64");

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

// Middleware to extract shop context
async function getWebhookContext(req, res, next) {
  const shop = req.headers["x-shopify-shop-domain"];
  if (!shop) {
    return res.status(400).json({ message: "Missing X-Shopify-Shop-Domain header" });
  }

  const channel = await getShopifyChannelByShop(shop);
  if (!channel) {
    // Return 200 so Shopify stops retrying if store disconnected
    return res.status(200).json({ message: "Channel not connected in CommerceOS" });
  }

  req.webhookContext = {
    companyId: channel.companyId,
    channelId: channel._id || channel.id,
    shop: channel.shop,
  };

  next();
}

shopifyWebhookRoutes.post(
  "/orders/create",
  getWebhookContext,
  asyncHandler(async (req, res) => {
    const { companyId, channelId, shop } = req.webhookContext;
    const orderData = req.body;

    const savedOrder = await upsertSingleOrder({
      companyId,
      channelId,
      provider: "shopify",
      shop,
      order: orderData,
    });

    console.log(`[Shopify Webhook] Order created: ${savedOrder.name} (${savedOrder.externalId}) for company ${companyId}`);
    res.status(200).json({ status: "received", orderId: savedOrder.externalId });
  }),
);

shopifyWebhookRoutes.post(
  "/orders/updated",
  getWebhookContext,
  asyncHandler(async (req, res) => {
    const { companyId, channelId, shop } = req.webhookContext;
    const orderData = req.body;

    const savedOrder = await upsertSingleOrder({
      companyId,
      channelId,
      provider: "shopify",
      shop,
      order: orderData,
    });

    console.log(`[Shopify Webhook] Order updated: ${savedOrder.name} for company ${companyId}`);
    res.status(200).json({ status: "received" });
  }),
);

shopifyWebhookRoutes.post(
  "/orders/cancelled",
  getWebhookContext,
  asyncHandler(async (req, res) => {
    const { companyId } = req.webhookContext;
    const orderData = req.body;

    await updateOrderOmsStatus({
      companyId,
      shopifyOrderId: String(orderData.id),
      update: {
        cancelledAt: orderData.cancelled_at ? new Date(orderData.cancelled_at) : new Date(),
        omsStatus: "cancelled",
      },
    });

    console.log(`[Shopify Webhook] Order cancelled: ${orderData.name} for company ${companyId}`);
    res.status(200).json({ status: "received" });
  }),
);

shopifyWebhookRoutes.post(
  "/fulfillments/create",
  getWebhookContext,
  asyncHandler(async (req, res) => {
    const { companyId } = req.webhookContext;
    const fulfillment = req.body;

    if (fulfillment.order_id) {
      await updateOrderOmsStatus({
        companyId,
        shopifyOrderId: String(fulfillment.order_id),
        update: {
          fulfillmentStatus: fulfillment.status || "fulfilled",
          omsStatus: "shipped",
        },
      });
    }

    res.status(200).json({ status: "received" });
  }),
);
