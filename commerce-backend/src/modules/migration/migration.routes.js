import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { copyStoreData, pushMigratedCustomersToShopify } from "./migration.service.js";

// Store-to-store migration (see migration.service.js) — copying historical
// order/customer data from one connected Shopify channel to another,
// entirely inside our own database. Gated behind channels:manage (the same
// permission key channel connect/sync already implies for Owner/Admin) —
// consequential, batch data-mutating actions, not a read.
export const migrationRoutes = Router();

migrationRoutes.post(
  "/copy",
  requireAuth,
  requirePermission("channels:manage"),
  asyncHandler(async (req, res) => {
    const { sourceChannelId, targetChannelId, includeCustomers, includeOrders } = req.body || {};
    if (!sourceChannelId || !targetChannelId) {
      return res.status(400).json({ message: "sourceChannelId and targetChannelId are required" });
    }
    if (includeCustomers === false && includeOrders === false) {
      return res.status(400).json({ message: "Select at least one of customers or orders to copy" });
    }
    const result = await copyStoreData({
      companyId: req.auth.companyId,
      sourceChannelId,
      targetChannelId,
      includeCustomers: includeCustomers !== false,
      includeOrders: includeOrders !== false,
    });
    res.json(result);
  }),
);

migrationRoutes.post(
  "/push-customers",
  requireAuth,
  requirePermission("channels:manage"),
  asyncHandler(async (req, res) => {
    const { targetChannelId } = req.body || {};
    if (!targetChannelId) {
      return res.status(400).json({ message: "targetChannelId is required" });
    }
    const result = await pushMigratedCustomersToShopify({ companyId: req.auth.companyId, targetChannelId });
    res.json(result);
  }),
);
