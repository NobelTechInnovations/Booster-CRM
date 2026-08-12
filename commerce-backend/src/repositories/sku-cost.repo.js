import { isMongoConnected } from "../config/database.js";
import { SkuCost } from "../models/sku-cost.model.js";
import { memory, id, clone, now, toNumber } from "./memory-store.js";

function cleanPayload(payload = {}) {
  return {
    productTitle: String(payload.productTitle || "").trim(),
    variantTitle: String(payload.variantTitle || "").trim(),
    buyingPrice:  toNumber(payload.buyingPrice),
    mrp:          toNumber(payload.mrp),
    weightGrams:  toNumber(payload.weightGrams),
    notes:        String(payload.notes || "").trim(),
  };
}

export async function listSkuCosts(companyId) {
  if (isMongoConnected()) {
    return SkuCost.find({ companyId }).lean();
  }
  return [...memory.skuCosts.values()].filter((c) => String(c.companyId) === String(companyId)).map(clone);
}

export async function upsertSkuCost({ companyId, sku, payload }) {
  const cleanSku = String(sku || "").trim();
  if (!cleanSku) return { error: "SKU is required" };

  const clean = cleanPayload(payload);

  if (isMongoConnected()) {
    const record = await SkuCost.findOneAndUpdate(
      { companyId, sku: cleanSku },
      { $set: clean },
      { new: true, upsert: true },
    ).lean();
    return { skuCost: record };
  }

  const key = `${companyId}:${cleanSku}`;
  const existing = memory.skuCosts.get(key);
  const record = existing
    ? Object.assign(existing, clean, { updatedAt: now() })
    : { _id: id(), companyId, sku: cleanSku, ...clean, createdAt: now(), updatedAt: now() };
  memory.skuCosts.set(key, record);
  return { skuCost: clone(record) };
}

export async function deleteSkuCost({ companyId, sku }) {
  const cleanSku = String(sku || "").trim();

  if (isMongoConnected()) {
    const record = await SkuCost.findOneAndDelete({ companyId, sku: cleanSku }).lean();
    return { skuCost: record };
  }

  const key = `${companyId}:${cleanSku}`;
  const record = memory.skuCosts.get(key);
  memory.skuCosts.delete(key);
  return { skuCost: record ? clone(record) : null };
}
