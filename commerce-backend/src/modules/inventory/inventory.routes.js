import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { listSkuCosts, upsertSkuCost, deleteSkuCost } from "../../repositories/sku-cost.repo.js";
import {
  listAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  adjustAssetStock,
  listAssetMappings,
  saveAssetMapping,
  deleteAssetMapping,
} from "../../repositories/asset.repo.js";

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

// ─── Packaging Assets (jars, stickers, etc — physical stock you consume) ───

inventoryRoutes.get(
  "/assets",
  asyncHandler(async (req, res) => {
    const assets = await listAssets(req.auth.companyId);
    res.json({ assets });
  }),
);

inventoryRoutes.post(
  "/assets",
  requirePermission("inventory:manage"),
  asyncHandler(async (req, res) => {
    const result = await createAsset({ companyId: req.auth.companyId, payload: req.body });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ asset: result.asset });
  }),
);

inventoryRoutes.patch(
  "/assets/:assetId",
  requirePermission("inventory:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateAsset({ companyId: req.auth.companyId, assetId: req.params.assetId, payload: req.body });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ asset: result.asset });
  }),
);

inventoryRoutes.delete(
  "/assets/:assetId",
  requirePermission("inventory:manage"),
  asyncHandler(async (req, res) => {
    const result = await deleteAsset({ companyId: req.auth.companyId, assetId: req.params.assetId });
    res.json({ asset: result.asset });
  }),
);

// Manual restock / correction — e.g. a new batch of jars arrived, or a
// miscount found some damaged. Positive quantity = add stock, negative = remove.
inventoryRoutes.post(
  "/assets/:assetId/adjust",
  requirePermission("inventory:manage"),
  asyncHandler(async (req, res) => {
    const result = await adjustAssetStock({
      companyId: req.auth.companyId,
      assetId: req.params.assetId,
      delta: req.body?.delta,
      reason: req.body?.reason,
    });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ asset: result.asset });
  }),
);

// ─── Product -> Asset mappings (what a SKU consumes when it ships) ─────────

inventoryRoutes.get(
  "/assets/mappings",
  asyncHandler(async (req, res) => {
    const mappings = await listAssetMappings(req.auth.companyId);
    res.json({ mappings });
  }),
);

inventoryRoutes.post(
  "/assets/mappings",
  requirePermission("inventory:manage"),
  asyncHandler(async (req, res) => {
    const result = await saveAssetMapping({ companyId: req.auth.companyId, ...req.body });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ mapping: result.mapping });
  }),
);

inventoryRoutes.delete(
  "/assets/mappings/:sku",
  requirePermission("inventory:manage"),
  asyncHandler(async (req, res) => {
    const result = await deleteAssetMapping({ companyId: req.auth.companyId, sku: req.params.sku });
    res.json({ mapping: result.mapping });
  }),
);
