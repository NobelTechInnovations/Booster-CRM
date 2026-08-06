import { isMongoConnected } from "../config/database.js";
import { Warehouse } from "../models/warehouse.model.js";
import { memory, id, clone, now } from "./memory-store.js";

export async function upsertWarehouseRecord({ companyId, channelId, provider, externalWarehouseId, data }) {
  const record = {
    companyId,
    channelId,
    provider,
    externalWarehouseId,
    name:          data.name || data.warehouse_name || `Warehouse ${externalWarehouseId}`,
    phone:         data.phone_number || data.phone,
    email:         data.email,
    gstNo:         data.gst_no,
    contactPerson: data.contact_person,
    address: {
      street:  data.address_attributes?.street_address || data.address,
      zip:     data.address_attributes?.zip || data.pin || data.pincode,
      city:    data.address_attributes?.city || data.city,
      state:   data.address_attributes?.state || data.state,
      country: data.address_attributes?.country || data.country || "India",
    },
    isActive:     true,
    lastSyncedAt: new Date(),
    raw:          data,
  };

  if (isMongoConnected()) {
    return Warehouse.findOneAndUpdate(
      { companyId, provider, externalWarehouseId },
      { $set: record },
      { new: true, upsert: true },
    ).lean();
  }

  const mapKey = `${companyId}:${provider}:${externalWarehouseId}`;
  const existing = memory.warehouses.get(mapKey);
  const stored = { _id: existing?._id || id(), ...record, createdAt: existing?.createdAt || now(), updatedAt: now() };
  memory.warehouses.set(mapKey, stored);
  return clone(stored);
}

export async function listWarehouses({ companyId, provider, channelId } = {}) {
  const filter = { companyId, isActive: true, ...(provider ? { provider } : {}), ...(channelId ? { channelId } : {}) };

  if (isMongoConnected()) {
    return Warehouse.find(filter).sort({ createdAt: -1 }).lean();
  }

  return [...memory.warehouses.values()]
    .filter((w) => {
      if (String(w.companyId) !== String(companyId)) return false;
      if (provider && w.provider !== provider) return false;
      if (channelId && String(w.channelId) !== String(channelId)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(clone);
}

export async function getWarehouseByExternalId({ companyId, provider, externalWarehouseId }) {
  if (isMongoConnected()) {
    return Warehouse.findOne({ companyId, provider, externalWarehouseId }).lean();
  }
  const mapKey = `${companyId}:${provider}:${externalWarehouseId}`;
  return clone(memory.warehouses.get(mapKey) || null);
}

export async function deactivateWarehouse({ companyId, provider, externalWarehouseId }) {
  if (isMongoConnected()) {
    return Warehouse.findOneAndUpdate(
      { companyId, provider, externalWarehouseId },
      { $set: { isActive: false } },
      { new: true },
    ).lean();
  }
  const mapKey = `${companyId}:${provider}:${externalWarehouseId}`;
  const w = memory.warehouses.get(mapKey);
  if (w) { w.isActive = false; w.updatedAt = now(); }
  return w ? clone(w) : null;
}
