import { isMongoConnected } from "../config/database.js";
import { Asset } from "../models/asset.model.js";
import { AssetMapping } from "../models/asset-mapping.model.js";
import { SyncedOrder } from "../models/synced-order.model.js";
import { memory, id, clone, now, toNumber } from "./memory-store.js";

// ─── Assets (physical stock: jars, stickers, etc) ───────────────────────────

function cleanAssetPayload(payload = {}) {
  return {
    name: String(payload.name || "").trim(),
    category: ["jar", "sticker", "other"].includes(payload.category) ? payload.category : "other",
    variant: String(payload.variant || "").trim(),
    unit: String(payload.unit || "pcs").trim() || "pcs",
    lowStockThreshold: toNumber(payload.lowStockThreshold ?? 20),
    notes: String(payload.notes || "").trim(),
  };
}

export async function listAssets(companyId) {
  if (isMongoConnected()) {
    return Asset.find({ companyId }).sort({ category: 1, name: 1 }).lean();
  }
  return [...memory.assets.values()]
    .filter((a) => String(a.companyId) === String(companyId))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(clone);
}

export async function createAsset({ companyId, payload }) {
  const clean = cleanAssetPayload(payload);
  if (!clean.name) return { error: "Asset name is required" };
  const currentStock = toNumber(payload.currentStock ?? 0);

  if (isMongoConnected()) {
    const asset = await Asset.create({ companyId, ...clean, currentStock });
    return { asset: asset.toObject() };
  }

  const asset = { _id: id(), companyId, ...clean, currentStock, createdAt: now(), updatedAt: now() };
  memory.assets.set(asset._id, asset);
  return { asset: clone(asset) };
}

export async function updateAsset({ companyId, assetId, payload }) {
  const clean = cleanAssetPayload(payload);
  if (!clean.name) return { error: "Asset name is required" };

  if (isMongoConnected()) {
    const asset = await Asset.findOneAndUpdate({ _id: assetId, companyId }, { $set: clean }, { new: true }).lean();
    if (!asset) return { error: "Asset not found" };
    return { asset };
  }

  const asset = memory.assets.get(assetId);
  if (!asset || String(asset.companyId) !== String(companyId)) return { error: "Asset not found" };
  Object.assign(asset, clean, { updatedAt: now() });
  return { asset: clone(asset) };
}

export async function deleteAsset({ companyId, assetId }) {
  if (isMongoConnected()) {
    const asset = await Asset.findOneAndDelete({ _id: assetId, companyId }).lean();
    return { asset };
  }
  const asset = memory.assets.get(assetId);
  if (asset && String(asset.companyId) === String(companyId)) memory.assets.delete(assetId);
  return { asset: asset ? clone(asset) : null };
}

// Manual stock change — restocking a batch of jars/stickers, or correcting a
// miscount. `delta` can be negative (e.g. found some damaged/unusable).
export async function adjustAssetStock({ companyId, assetId, delta, reason }) {
  const change = toNumber(delta);
  if (!change) return { error: "A non-zero quantity is required" };

  if (isMongoConnected()) {
    const asset = await Asset.findOneAndUpdate(
      { _id: assetId, companyId },
      { $inc: { currentStock: change }, ...(reason ? { $set: { notes: String(reason).trim() } } : {}) },
      { new: true },
    ).lean();
    if (!asset) return { error: "Asset not found" };
    return { asset };
  }

  const asset = memory.assets.get(assetId);
  if (!asset || String(asset.companyId) !== String(companyId)) return { error: "Asset not found" };
  asset.currentStock = toNumber(asset.currentStock) + change;
  if (reason) asset.notes = String(reason).trim();
  asset.updatedAt = now();
  return { asset: clone(asset) };
}

// ─── Product → Asset mappings (what a SKU consumes when it ships) ──────────

export async function listAssetMappings(companyId) {
  if (isMongoConnected()) {
    return AssetMapping.find({ companyId }).lean();
  }
  return [...memory.assetMappings.values()].filter((m) => String(m.companyId) === String(companyId)).map(clone);
}

export async function saveAssetMapping({ companyId, sku, productTitle, variantTitle, consumes }) {
  const cleanSku = String(sku || "").trim();
  if (!cleanSku) return { error: "SKU is required" };

  const cleanConsumes = (Array.isArray(consumes) ? consumes : [])
    .filter((c) => c?.assetId)
    .map((c) => ({ assetId: c.assetId, quantity: Math.max(0, toNumber(c.quantity ?? 1)) }));

  const clean = {
    productTitle: String(productTitle || "").trim(),
    variantTitle: String(variantTitle || "").trim(),
    consumes: cleanConsumes,
  };

  if (isMongoConnected()) {
    const mapping = await AssetMapping.findOneAndUpdate(
      { companyId, sku: cleanSku },
      { $set: clean },
      { new: true, upsert: true },
    ).lean();
    return { mapping };
  }

  const key = `${companyId}:${cleanSku}`;
  const existing = memory.assetMappings.get(key);
  const mapping = existing
    ? Object.assign(existing, clean, { updatedAt: now() })
    : { _id: id(), companyId, sku: cleanSku, ...clean, createdAt: now(), updatedAt: now() };
  memory.assetMappings.set(key, mapping);
  return { mapping: clone(mapping) };
}

export async function deleteAssetMapping({ companyId, sku }) {
  const cleanSku = String(sku || "").trim();
  if (isMongoConnected()) {
    const mapping = await AssetMapping.findOneAndDelete({ companyId, sku: cleanSku }).lean();
    return { mapping };
  }
  const key = `${companyId}:${cleanSku}`;
  const mapping = memory.assetMappings.get(key);
  memory.assetMappings.delete(key);
  return { mapping: mapping ? clone(mapping) : null };
}

// ─── Auto-deduction on fulfillment ──────────────────────────────────────────

// Called once per order, right after we actually ship it (see
// fulfillment.service.js's shipOrder()) — never retroactively for orders
// that existed before this feature, since it only ever runs as a side
// effect of the ship action itself. Best-effort: a missing mapping for some
// SKU just means that line item's assets aren't tracked yet, not an error
// that should block the real shipment. Idempotent via assetsDeducted.
export async function deductAssetsForOrder({ companyId, order }) {
  if (order.assetsDeducted) return { deducted: false, reason: "already-deducted" };

  const mappings = await listAssetMappings(companyId);
  const bySku = new Map(mappings.map((m) => [m.sku, m]));

  const deductions = []; // { assetId, quantity }
  for (const item of order.lineItems || []) {
    if (!item.sku) continue;
    const mapping = bySku.get(item.sku);
    if (!mapping) continue;
    const qty = toNumber(item.quantity) || 1;
    for (const c of mapping.consumes || []) {
      deductions.push({ assetId: String(c.assetId), quantity: toNumber(c.quantity) * qty });
    }
  }

  // Merge duplicate asset ids (e.g. two line items both consuming the same jar size).
  const merged = new Map();
  for (const d of deductions) {
    merged.set(d.assetId, (merged.get(d.assetId) || 0) + d.quantity);
  }

  for (const [assetId, quantity] of merged.entries()) {
    if (!quantity) continue;
    await adjustAssetStock({ companyId, assetId, delta: -quantity });
  }

  if (isMongoConnected()) {
    await SyncedOrder.updateOne({ _id: order._id || order.id }, { $set: { assetsDeducted: true } });
  } else {
    const stored = memory.orders.get(order._id || order.id);
    if (stored) stored.assetsDeducted = true;
  }

  return { deducted: true, assetsAffected: merged.size };
}
