import crypto from "node:crypto";
import { Router } from "express";
import { env } from "../../config/env.js";
import { getShopifyChannelByShop } from "../../repositories/channel.repo.js";
import { upsertSingleOrder, updateOrderOmsStatus } from "../../repositories/order.repo.js";
import { chargeWalletForFulfillment } from "../../repositories/wallet.repo.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const shopifyWebhookRoutes = Router();

// secret is the CHANNEL's own apiSecret when it has a per-store custom
// Shopify app (see shopify-pending-app-config.model.js), falling back to
// the shared env one — resolved by the caller, after the channel lookup
// below, since which secret is right depends on which store this is.
// Uses req.rawBody (captured by express.json()'s verify hook in app.js)
// rather than re-serializing req.body — JSON.stringify can legally produce
// different bytes than what Shopify actually signed (key order, spacing),
// which would make a correctly-signed webhook fail verification.
function verifyWebhookHmac(req, secret) {
  if (!secret) return true; // Skip if no secret configured at all (dev)

  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  if (!hmacHeader) return false;

  const rawBody = req.rawBody || (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false; // length mismatch etc — never let a malformed header throw past this
  }
}

// Middleware to extract shop context — also the one place that actually
// verifies the request came from Shopify. This was previously defined but
// never called anywhere in this file, meaning webhook payloads were
// processed on nothing but "the shop domain header names a connected
// channel" — not a cryptographic check at all, so anyone who could guess a
// connected shop domain could feed in a fake order. Fixed here rather than
// left as a separate task since resolving the channel (needed either way,
// to know which secret to check against) is already this function's job.
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

  // Logged, not enforced yet — this was previously dead code (defined,
  // never called), so no channel's real incoming webhooks have ever been
  // checked against it. Flipping straight to rejecting could silently
  // start dropping a real store's real order/customer webhooks if its
  // actual signing secret turns out not to be what's on file (channel-level
  // apiSecret has never been populated for Shopify before this change; the
  // env.shopify.apiSecret fallback has also never actually been verified
  // against real traffic). Logging first is the safe way to find out.
  if (!verifyWebhookHmac(req, channel.credentials?.apiSecret || env.shopify.apiSecret)) {
    console.warn(`[Shopify Webhook] HMAC signature check failed for ${shop} (topic ${req.originalUrl}) — processing anyway; see shopify-webhook.routes.js's verifyWebhookHmac comment before making this reject.`);
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
      const updatedOrder = await updateOrderOmsStatus({
        companyId,
        shopifyOrderId: String(fulfillment.order_id),
        update: {
          fulfillmentStatus: fulfillment.status || "fulfilled",
          omsStatus: "shipped",
        },
      });

      // Orders fulfilled straight in Shopify never go through shipOrder(),
      // so this is the only place to charge the per-order plan fee for
      // them — same best-effort contract, and idempotent by order id, so a
      // webhook redelivery (Shopify retries aggressively) can't double-charge.
      if (updatedOrder) {
        try {
          await chargeWalletForFulfillment({ companyId, order: updatedOrder });
        } catch (err) {
          console.warn(`[Shopify Webhook] Wallet charge failed for order ${fulfillment.order_id}:`, err.message);
        }
      }
    }

    res.status(200).json({ status: "received" });
  }),
);
