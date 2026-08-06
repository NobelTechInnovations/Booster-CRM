import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getShippingProvider, listSupportedShippingProviders } from "./shipping-registry.js";
import { listWarehouses } from "../../repositories/warehouse.repo.js";
import { listShipments } from "../../repositories/shipment.repo.js";
import { listShippingChannels } from "../../repositories/channel.repo.js";

export const shippingRoutes = Router();

// List all supported shipping providers
shippingRoutes.get("/providers", (_req, res) => {
  res.json({ providers: listSupportedShippingProviders() });
});

// List all connected shipping channels for company
shippingRoutes.get(
  "/channels",
  requireAuth,
  asyncHandler(async (req, res) => {
    const channels = await listShippingChannels(req.auth.companyId);
    res.json({ channels });
  }),
);

// Connect a shipping provider (generic endpoint)
shippingRoutes.post(
  "/:provider/connect",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getShippingProvider(req.params.provider, { companyId: req.auth.companyId });
    const channel = await provider.connect({
      userId: req.auth.sub,
      ...req.body,
    });


    res.json({
      message: `${req.params.provider} connected successfully`,
      channel: {
        id: channel._id || channel.id,
        provider: channel.provider,
        name: channel.name,
        status: channel.status,
      },
    });
  }),
);

// Sync warehouses from shipping provider
shippingRoutes.post(
  "/:provider/warehouses/sync",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getShippingProvider(req.params.provider, { companyId: req.auth.companyId });
    const warehouses = await provider.syncWarehouses();
    res.json({ message: "Warehouses synchronized", warehouses });
  }),
);

// Get warehouses for company (optional provider filter)
shippingRoutes.get(
  "/warehouses",
  requireAuth,
  asyncHandler(async (req, res) => {
    const providerFilter = req.query.provider ? String(req.query.provider) : undefined;
    const warehouses = await listWarehouses({ companyId: req.auth.companyId, provider: providerFilter });
    res.json({ warehouses });
  }),
);

// Create new warehouse on shipping provider
shippingRoutes.post(
  "/:provider/warehouses",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getShippingProvider(req.params.provider, { companyId: req.auth.companyId });
    const warehouse = await provider.createWarehouse(req.body || {});
    res.json({ message: "Warehouse created", warehouse });
  }),
);

// Check serviceability
shippingRoutes.post(
  "/:provider/serviceability",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getShippingProvider(req.params.provider, { companyId: req.auth.companyId });
    const result = await provider.checkServiceability(req.body || {});
    res.json(result);
  }),
);

// Create forward shipment directly
shippingRoutes.post(
  "/:provider/orders/forward",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getShippingProvider(req.params.provider, { companyId: req.auth.companyId });
    const shipment = await provider.createForwardOrder(req.body || {});
    res.json({ message: "Forward shipment created", shipment });
  }),
);

// Create reverse shipment directly
shippingRoutes.post(
  "/:provider/orders/reverse",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getShippingProvider(req.params.provider, { companyId: req.auth.companyId });
    const shipment = await provider.createReturnOrder(req.body || {});
    res.json({ message: "Reverse pickup shipment created", shipment });
  }),
);

// Cancel shipment(s)
shippingRoutes.post(
  "/:provider/orders/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getShippingProvider(req.params.provider, { companyId: req.auth.companyId });
    const result = await provider.cancelOrder(req.body?.awbs || []);
    res.json(result);
  }),
);

// Track shipment(s)
shippingRoutes.post(
  "/:provider/orders/track",
  requireAuth,
  asyncHandler(async (req, res) => {
    const provider = getShippingProvider(req.params.provider, { companyId: req.auth.companyId });
    const result = await provider.trackOrders(req.body?.awbs || []);
    res.json(result);
  }),
);

// List all shipments
shippingRoutes.get(
  "/shipments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const providerFilter = req.query.provider ? String(req.query.provider) : undefined;
    const shipments = await listShipments({ companyId: req.auth.companyId, provider: providerFilter });
    res.json({ shipments });
  }),
);
