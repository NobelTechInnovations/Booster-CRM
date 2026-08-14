import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getFulfillmentOrders, getFulfilledOrders, shipOrder, cancelOrderFulfillment, createManualOrder } from "./fulfillment.service.js";
import { listActiveShipments, listShipments } from "../../repositories/shipment.repo.js";

export const fulfillmentRoutes = Router();

// Get orders ready for fulfillment
fulfillmentRoutes.get(
  "/orders",
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 100);

    const result = await getFulfillmentOrders(req.auth.companyId, { page, limit });
    res.json(result);
  }),
);

// Get already-fulfilled orders (fulfilled via Shopify or shipped through our system)
fulfillmentRoutes.get(
  "/orders/fulfilled",
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 200);
    const result = await getFulfilledOrders(req.auth.companyId, { page, limit });
    res.json(result);
  }),
);

// Create an order directly in the panel (not synced from Shopify/Amazon) —
// lands in the same fulfillment queue below, ready to ship like any other order.
fulfillmentRoutes.post(
  "/orders/local",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { customer, shippingAddress, lineItems, isCOD, note } = req.body || {};
    const order = await createManualOrder({ companyId: req.auth.companyId, customer, shippingAddress, lineItems, isCOD, note });
    res.json({ message: "Order created", order });
  }),
);

// Cancel an unfulfilled order
fulfillmentRoutes.post(
  "/orders/:orderId/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const { reason } = req.body || {};
    const result = await cancelOrderFulfillment({ companyId: req.auth.companyId, orderId, reason });
    res.json(result);
  }),
);

// Fulfill / Ship a Shopify order via selected shipping provider & warehouse
fulfillmentRoutes.post(
  "/ship",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { orderId, provider, warehouseId, courierId, options } = req.body || {};

    const result = await shipOrder({
      companyId: req.auth.companyId,
      orderId,
      providerName: provider,
      warehouseId,
      courierId,
      options,
    });

    res.json({
      message: `Order shipped via ${provider}. AWB: ${result.shipment.awbCode}`,
      ...result,
    });
  }),
);

// List shipments history
fulfillmentRoutes.get(
  "/shipments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const shipments = await listShipments({ companyId: req.auth.companyId });
    res.json({ shipments });
  }),
);

// List active in-transit shipments
fulfillmentRoutes.get(
  "/shipments/active",
  requireAuth,
  asyncHandler(async (req, res) => {
    const shipments = await listActiveShipments(req.auth.companyId);
    res.json({ shipments });
  }),
);
