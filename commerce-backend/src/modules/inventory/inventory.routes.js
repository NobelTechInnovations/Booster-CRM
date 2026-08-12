import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { listSkuCosts, upsertSkuCost, deleteSkuCost } from "../../repositories/sku-cost.repo.js";

export const inventoryRoutes = Router();

inventoryRoutes.use(requireAuth);

// ─── SKU cost sheet (buying price, MRP, shipping cost, margin) ─────────────

inventoryRoutes.get(
  "/costs",
  asyncHandler(async (req, res) => {
    const costs = await listSkuCosts(req.auth.companyId);
    res.json({ costs });
  }),
);

inventoryRoutes.post(
  "/costs/:sku",
  asyncHandler(async (req, res) => {
    const result = await upsertSkuCost({
      companyId: req.auth.companyId,
      sku: req.params.sku,
      payload: req.body,
    });

    if (result.error) {
      throw new HttpError(400, result.error);
    }

    res.json({ skuCost: result.skuCost });
  }),
);

inventoryRoutes.delete(
  "/costs/:sku",
  asyncHandler(async (req, res) => {
    const result = await deleteSkuCost({ companyId: req.auth.companyId, sku: req.params.sku });
    res.json({ skuCost: result.skuCost });
  }),
);
