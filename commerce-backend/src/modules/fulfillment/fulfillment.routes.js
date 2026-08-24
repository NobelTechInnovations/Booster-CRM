import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getFulfillmentOrders, getFulfilledOrders, shipOrder, shipOrdersBulk, downloadLabelsBulk, cancelOrderFulfillment, cancelShipment, syncShipmentStatus, createManualOrder } from "./fulfillment.service.js";
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
      message: result.shopifyPushError
        ? `Order shipped via ${provider} (AWB: ${result.shipment.awbCode}), but Shopify wasn't marked fulfilled: ${result.shopifyPushError}`
        : `Order shipped via ${provider}. AWB: ${result.shipment.awbCode}`,
      ...result,
    });
  }),
);

// Bulk-ship many orders at once through the same provider + warehouse,
// courier auto-assigned per order — for assigning a batch to a shipment in
// one action instead of one order at a time.
fulfillmentRoutes.post(
  "/ship-bulk",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { orderIds, provider, warehouseId } = req.body || {};
    const result = await shipOrdersBulk({ companyId: req.auth.companyId, orderIds, providerName: provider, warehouseId });
    res.json(result);
  }),
);

// Merges the selected shipments' labels into one PDF and marks them
// downloaded — real bulk print, not opening N tabs.
fulfillmentRoutes.post(
  "/labels/bulk-download",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { shipmentIds } = req.body || {};
    const { pdfBytes, includedCount, skipped } = await downloadLabelsBulk({ companyId: req.auth.companyId, shipmentIds });
    if (skipped.length) res.setHeader("X-Labels-Skipped", JSON.stringify(skipped));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="labels-${includedCount}-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  }),
);

// Cancel an order's active shipment (courier + Shopify fulfillment) and
// move it back to unfulfilled so it can be shipped again.
fulfillmentRoutes.post(
  "/orders/:orderId/cancel-shipment",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const result = await cancelShipment({ companyId: req.auth.companyId, orderId });
    res.json(result);
  }),
);

// Pull live tracking status for one order's shipment right now (instead of
// waiting for the 15-minute background job) — catches shipments cancelled
// directly on the courier's own dashboard and syncs the order back to
// unfulfilled if so.
fulfillmentRoutes.post(
  "/orders/:orderId/sync-shipment-status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const result = await syncShipmentStatus({ companyId: req.auth.companyId, orderId });
    res.json(result);
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
