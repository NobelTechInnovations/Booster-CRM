import { Router } from "express";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  disconnectChannel,
  getChannelForSync,
  getStoreMode,
  listChannels,
  setChannelActive,
  updateChannelAppCredentials,
  upsertEmailChannel,
  getConnectedEmailChannel,
  withoutCredentials,
} from "../../repositories/channel.repo.js";
import { sendCompanySmtpEmail } from "../../utils/smtp-mailer.js";
import {
  listCommerceRecords,
  listProductMappingOptions,
  listProductMappings,
  saveProductMapping,
  getSavedCommerceData,
  getDashboardSummary,
  getOrderById,
  deleteDraftOrder,
} from "../../repositories/order.repo.js";
import { updateAmazonConfig, updateShopifyConfig } from "../../repositories/company.repo.js";
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
import {
  buildShopifyInstallUrl,
  completeShopifyConnection,
  syncShopifyData,
  updateShopifyRecord,
  createShopifyOrderDirect,
  createShopifyCustomerDirect,
  normalizeShop,
} from "./shopify.service.js";
import { isMongoConnected } from "../../config/database.js";
import { SyncedCustomer } from "../../models/synced-customer.model.js";
import { upsertSingleOrder } from "../../repositories/order.repo.js";
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
    const dashboard = await getDashboardSummary(req.auth.companyId, { period: req.query.period });

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

// ─── Customer Follow-Up CRM Routes ────────────────────────────────────────────

// Add a follow-up log entry for a customer
channelRoutes.post(
  "/customers/:customerId/follow-up",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { companyId, displayName } = req.auth;
    const { customerId } = req.params;
    const {
      calledAt,
      note = "",
      outcome = "called",
      nextFollowUpAt,
      followUpStatus,
      // Optional shopify detail updates
      firstName, lastName, email, phone,
      address,
    } = req.body || {};

    if (!isMongoConnected()) {
      throw new HttpError(503, "Follow-up CRM requires a MongoDB connection.");
    }

    const customer = await SyncedCustomer.findOne({ _id: customerId, companyId }).lean();
    if (!customer) throw new HttpError(404, "Customer not found");

    const followUpEntry = {
      calledAt: calledAt ? new Date(calledAt) : new Date(),
      note,
      outcome,
      nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : undefined,
      createdByName: displayName || req.auth.email || "Agent",
    };

    const updateFields = {
      $push: { followUps: { $each: [followUpEntry], $position: 0 } },
      $set: {},
    };

    if (note) updateFields.$set.note = note;
    if (followUpStatus) updateFields.$set.followUpStatus = followUpStatus;
    if (nextFollowUpAt) updateFields.$set.nextFollowUpAt = new Date(nextFollowUpAt);
    if (firstName !== undefined) updateFields.$set.firstName = firstName;
    if (lastName !== undefined) updateFields.$set.lastName = lastName;
    if (email !== undefined) updateFields.$set.email = email;
    if (phone !== undefined) updateFields.$set.phone = phone;
    if (address) updateFields.$set.defaultAddress = address;

    // Derive display name from first+last if updated
    if (firstName !== undefined || lastName !== undefined) {
      const fn = firstName !== undefined ? firstName : customer.firstName;
      const ln = lastName !== undefined ? lastName : customer.lastName;
      updateFields.$set.name = [fn, ln].filter(Boolean).join(" ") || customer.name;
    }

    if (Object.keys(updateFields.$set).length === 0) delete updateFields.$set;

    const updated = await SyncedCustomer.findOneAndUpdate(
      { _id: customerId, companyId },
      updateFields,
      { new: true },
    ).lean();

    // Push the note change to Shopify (best-effort — do not fail the request if Shopify is unreachable)
    if (note) {
      updateShopifyRecord({
        companyId,
        resource: "customers",
        recordId: String(updated.externalId),
        payload: { note },
      }).catch((err) => console.warn("[FollowUp] Shopify note sync failed:", err.message));
    }

    res.json({ message: "Follow-up logged", customer: updated });
  }),
);

// Get customers with follow-ups due within the next 1 hour (or overdue)
channelRoutes.get(
  "/customers/upcoming-followups",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { companyId } = req.auth;

    if (!isMongoConnected()) {
      return res.json({ customers: [] });
    }

    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    const customers = await SyncedCustomer.find({
      companyId,
      nextFollowUpAt: { $lte: oneHourFromNow },
      followUpStatus: { $in: ["new", "follow_up_scheduled"] },
    })
      .sort({ nextFollowUpAt: 1 })
      .limit(20)
      .lean();

    res.json({ customers, now: now.toISOString() });
  }),
);

// Create a Shopify order directly from the CRM and add to fulfillment queue
channelRoutes.post(
  "/customers/:customerId/create-order",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { companyId } = req.auth;
    const { customerId } = req.params;
    const { lineItems = [], shippingAddress, billingAddress, note, tags, isCOD = true, shippingCost, discount } = req.body || {};

    if (!lineItems.length) {
      throw new HttpError(400, "At least one line item is required");
    }

    const { order: shopifyOrder, channel } = await createShopifyOrderDirect({
      companyId,
      customerId,
      lineItems,
      shippingAddress,
      // No separate billing address field exists in the Create Order UI
      // today — createShopifyOrderDirect itself falls back to
      // shippingAddress when this is undefined, so billing_address is
      // still always sent to Shopify either way.
      billingAddress,
      note,
      tags,
      isCOD,
      shippingCost: Number(shippingCost) || 0,
      discount: Number(discount) || 0,
    });

    // Save the new order in MongoDB so it appears in the fulfillment panel
    const savedOrder = await upsertSingleOrder({
      companyId,
      channelId: channel._id,
      provider: "shopify",
      shop: channel.shop,
      order: shopifyOrder,
    });

    // Mark customer as converted if not already
    if (isMongoConnected()) {
      await SyncedCustomer.updateOne(
        { _id: customerId, companyId, followUpStatus: { $ne: "converted" } },
        { $set: { followUpStatus: "converted", nextFollowUpAt: null } },
      );
    }

    res.json({
      message: "Order created on Shopify and added to fulfillment queue",
      shopifyOrderId: shopifyOrder.id,
      shopifyOrderName: shopifyOrder.name,
      savedOrder,
    });
  }),
);

// Push a draft order (see synced-order.model.js's isDraft) for real onto
// Shopify — the only thing that ever turns a draft into an actual order.
// Resolves an existing customer by phone/email first so repeat drafts for
// the same person don't create duplicate Shopify customers; only creates a
// new one when nothing matches. Requires a connected Shopify channel with
// write scopes, same as every other direct-create flow in this file — a
// draft can be saved with no store connected at all, but finalizing it
// can't skip that requirement, since there's nowhere to sync it to.
channelRoutes.post(
  "/orders/:orderId/finalize-draft",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { companyId, sub: userId } = req.auth;
    const { orderId } = req.params;

    const draft = await getOrderById({ companyId, orderId });
    if (!draft) throw new HttpError(404, "Order not found");
    if (!draft.isDraft) throw new HttpError(400, "This order is not a draft");
    if (!draft.lineItems?.length) throw new HttpError(400, "Draft has no line items");
    if (!draft.shippingAddress?.zip) throw new HttpError(400, "Add a shipping address with a PIN code before finalizing");

    let customer = null;
    if (isMongoConnected() && (draft.phone || draft.email)) {
      customer = await SyncedCustomer.findOne({
        companyId,
        $or: [
          ...(draft.phone ? [{ phone: draft.phone }] : []),
          ...(draft.email ? [{ email: draft.email }] : []),
        ],
      }).lean();
    }

    if (!customer) {
      const [firstName, ...rest] = String(draft.customerName || "Customer").trim().split(/\s+/);
      const created = await createShopifyCustomerDirect({
        companyId,
        userId,
        firstName,
        lastName: rest.join(" "),
        email: draft.email || undefined,
        phone: draft.phone || undefined,
        address: draft.shippingAddress,
      });
      customer = created.customer;
    }

    const { order: shopifyOrder, channel } = await createShopifyOrderDirect({
      companyId,
      customerId: customer._id || customer.id,
      lineItems: draft.lineItems,
      shippingAddress: draft.shippingAddress,
      // Drafts don't collect a separate billing address — createShopifyOrderDirect
      // falls back to shippingAddress for billing_address, so Shopify still
      // gets both fields populated.
      note: draft.note,
      tags: draft.isCOD ? "COD, Draft-Finalized" : "Prepaid, Draft-Finalized",
      isCOD: draft.isCOD,
    });

    const savedOrder = await upsertSingleOrder({
      companyId,
      channelId: channel._id,
      provider: "shopify",
      shop: channel.shop,
      order: shopifyOrder,
    });

    // The draft's job is done — delete it so it doesn't sit alongside its
    // now-real Shopify counterpart as a duplicate in the Orders list.
    await deleteDraftOrder({ companyId, orderId: draft._id });

    res.json({
      message: `Draft synced to Shopify as ${shopifyOrder.name}`,
      shopifyOrderId: shopifyOrder.id,
      shopifyOrderName: shopifyOrder.name,
      savedOrder,
    });
  }),
);

// Create a new customer directly in Shopify — mirrors Shopify's own "New
// customer" form. Created for real in Shopify first, then synced back so it
// shows up in our own Customers list exactly like any other synced customer —
// ready for follow-up (customer-followup-modal) and direct order creation
// (create-order-modal) immediately, no separate "is this a real customer yet" state.
channelRoutes.post(
  "/customers",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { companyId, sub: userId } = req.auth;
    const { firstName, lastName, email, phone, tags, note, acceptsMarketing, address } = req.body || {};

    const { customer } = await createShopifyCustomerDirect({
      companyId,
      userId,
      firstName,
      lastName,
      email,
      phone,
      tags,
      note,
      acceptsMarketing,
      address,
    });

    res.json({ message: "Customer created on Shopify", customer });
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
    const installUrl = await buildShopifyInstallUrl({
      shop: req.body.shop || "",
      companyId: req.auth.companyId,
      userId: req.auth.sub,
    });

    res.json({ provider: "shopify", installUrl });
  }),
);

channelRoutes.put(
  "/shopify/setup",
  requireAuth,
  asyncHandler(async (req, res) => {
    // shop is optional — present only when this is a per-store custom app
    // (a company connecting more than one Shopify store); normalized here
    // so it matches exactly what buildShopifyInstallUrl/
    // completeShopifyConnection look the pending config up by.
    const result = await updateShopifyConfig({
      companyId: req.auth.companyId,
      payload: {
        ...req.body,
        shop: req.body?.shop ? normalizeShop(req.body.shop) : undefined,
      },
    });

    if (result.error) {
      throw new HttpError(400, result.error);
    }

    res.json({ message: "Shopify app credentials saved", config: result.config });
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
    } else if (["velocity", "shiprocket", "shipway", "shipmozo"].includes(channelForSync.provider)) {
      try {
        const provider = getShippingProvider(channelForSync.provider, { companyId: req.auth.companyId });
        await provider.syncWarehouses();
      } catch (err) {
        console.warn(`[Sync] Shipping provider ${channelForSync.provider} warehouse sync notice:`, err.message);
      }
      channel = channelForSync;
    } else {
      throw new HttpError(400, "This channel provider cannot sync yet");
    }

    if (!channel) {
      throw new HttpError(404, "Channel not found");
    }

    res.json({
      message: `${channel.name || channel.provider} data synced`,
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

// Pause/resume auto-sync without touching credentials — see
// setChannelActive's own comment for exactly how this differs from
// disconnect above.
channelRoutes.patch(
  "/:channelId/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const active = Boolean(req.body?.active);
    const result = await setChannelActive({
      channelId: req.params.channelId,
      companyId: req.auth.companyId,
      active,
    });

    if (!result) throw new HttpError(404, "Channel not found");
    if (result.error) throw new HttpError(400, result.error);

    res.json({ channel: result });
  }),
);

// Re-attach a Shopify app's Client ID/Secret to an already-connected
// channel, no reconnect needed — see updateChannelAppCredentials's own
// comment for why this is safe (the access token doesn't depend on it).
channelRoutes.patch(
  "/:channelId/app-credentials",
  requireAuth,
  asyncHandler(async (req, res) => {
    const apiKey = String(req.body?.apiKey || "").trim();
    const apiSecret = String(req.body?.apiSecret || "").trim();
    if (!apiKey || !apiSecret) {
      throw new HttpError(400, "apiKey and apiSecret are required");
    }

    const channel = await updateChannelAppCredentials({
      channelId: req.params.channelId,
      companyId: req.auth.companyId,
      apiKey,
      apiSecret,
    });

    if (!channel) throw new HttpError(404, "Channel not found");
    res.json({ channel });
  }),
);

// ─── Email (SMTP) ────────────────────────────────────────────────────────────
// A generic SMTP connect — one form for Gmail (app password), Outlook, Zoho,
// or any other provider a company already has, rather than a per-provider
// OAuth integration. Powers the email automation system (see
// modules/automation/automation-dispatcher.js).

channelRoutes.post(
  "/email/connect",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { host, port, secure, username, password, fromEmail, fromName } = req.body || {};
    if (!host || !port || !username) {
      throw new HttpError(400, "Host, port, and username are required");
    }
    // password is optional on an update — blank means "keep the current
    // one" (see upsertEmailChannel); a genuinely new connection still
    // needs a real password, enforced there since only it knows whether
    // a channel already exists to fall back to.

    let channel;
    try {
      channel = await upsertEmailChannel({
        companyId: req.auth.companyId,
        userId: req.auth.sub,
        host, port, secure: Boolean(secure), username, password,
        fromEmail, fromName,
      });
    } catch (err) {
      throw new HttpError(400, `Could not connect to this SMTP server: ${err.message}`);
    }

    res.json({ message: "Email connected", channel: withoutCredentials(channel) });
  }),
);

channelRoutes.post(
  "/email/test",
  requireAuth,
  asyncHandler(async (req, res) => {
    const channel = await getConnectedEmailChannel(req.auth.companyId);
    if (!channel) throw new HttpError(400, "Connect an email channel first");
    if (!req.auth.email) throw new HttpError(400, "No email address on your account to send a test to");

    const result = await sendCompanySmtpEmail({
      channel,
      to: req.auth.email,
      subject: "Test email from your Wokbook automation setup",
      html: "<p>This confirms your connected SMTP is working — automated order emails will send from this same address.</p>",
    });
    if (!result.success) throw new HttpError(400, `Test email failed: ${result.error}`);

    res.json({ message: `Test email sent to ${req.auth.email}` });
  }),
);
