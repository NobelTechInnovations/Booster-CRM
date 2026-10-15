import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { getOyklaneChannelForWebhook } from "../../repositories/channel.repo.js";
import { saveSyncedOyklaneData, upsertSingleOrder } from "../../repositories/order.repo.js";
import { verifyOyklaneWebhook } from "../channels/oyklane.service.js";

// POST /api/webhooks/oyklane/:channelId — the URL shown after connecting,
// pasted into Oyklane ▸ Settings ▸ API & webhooks. The channel id only says
// which secret to check; the signature is what authenticates the delivery.
export const oyklaneWebhookRoutes = Router();

oyklaneWebhookRoutes.post(
  "/:channelId",
  asyncHandler(async (req, res) => {
    const channel = await getOyklaneChannelForWebhook(req.params.channelId);
    // Same response for unknown channel and bad signature, so the endpoint
    // can't be used to probe which channel ids exist.
    if (!channel || !verifyOyklaneWebhook({ secret: channel.credentials?.apiSecret, rawBody: req.rawBody || "", headers: req.headers })) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const event = String(req.headers["x-oyklane-event"] || req.body?.event || "");
    const data = req.body?.data || req.body || {};
    const base = { companyId: channel.companyId, channelId: channel._id, shop: channel.shop };

    // Every write below is an idempotent upsert keyed on the Oyklane id, so a
    // retried delivery (same x-oyklane-delivery) is harmless.
    if (event.startsWith("order.") && data.id) {
      await upsertSingleOrder({ ...base, provider: "oyklane", order: data });
    } else if (event === "product.deleted" && data.id) {
      // Kept, not removed — order history still points at it.
      await saveSyncedOyklaneData({ ...base, products: [{ title: data.title || String(data.id), ...data, status: "deleted" }] });
    } else if (event.startsWith("product.") && data.id) {
      await saveSyncedOyklaneData({ ...base, products: [data] });
    } else if (event.startsWith("customer.") && data.id) {
      await saveSyncedOyklaneData({ ...base, customers: [data] });
    }

    res.json({ received: true });
  }),
);
