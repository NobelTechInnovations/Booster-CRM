import { isMongoConnected } from "../config/database.js";
import { Shipment } from "../models/shipment.model.js";
import { memory, id, clone, now } from "./memory-store.js";

export async function createShipmentRecord(fields) {
  const record = { isReturn: false, status: "created", codAmount: 0, ...fields };

  if (isMongoConnected()) {
    return Shipment.create(record);
  }

  const stored = { _id: id(), ...record, createdAt: now(), updatedAt: now() };
  memory.shipments.set(stored._id, stored);
  return clone(stored);
}

export async function listShipments({ companyId, provider, page = 1, limit = 200 } = {}) {
  const filter = { companyId, ...(provider ? { provider } : {}) };

  if (isMongoConnected()) {
    return Shipment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
  }

  return [...memory.shipments.values()]
    .filter((s) => {
      if (String(s.companyId) !== String(companyId)) return false;
      if (provider && s.provider !== provider) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(clone);
}

export async function getShipmentByAwb({ companyId, awbCode }) {
  if (isMongoConnected()) return Shipment.findOne({ companyId, awbCode }).lean();
  return clone([...memory.shipments.values()].find((s) => String(s.companyId) === String(companyId) && s.awbCode === awbCode) || null);
}

export async function updateShipmentsByAwb({ companyId, awbCodes, update }) {
  if (isMongoConnected()) {
    await Shipment.updateMany({ companyId, awbCode: { $in: awbCodes } }, { $set: update });
    return Shipment.find({ companyId, awbCode: { $in: awbCodes } }).lean();
  }

  const updated = [];
  for (const entry of memory.shipments.values()) {
    if (String(entry.companyId) === String(companyId) && awbCodes.includes(entry.awbCode)) {
      Object.assign(entry, update, { updatedAt: now() });
      updated.push(clone(entry));
    }
  }
  return updated;
}

export async function updateShipmentById({ shipmentId, companyId, update }) {
  if (isMongoConnected()) {
    return Shipment.findOneAndUpdate({ _id: shipmentId, companyId }, { $set: update }, { new: true }).lean();
  }
  const s = memory.shipments.get(shipmentId);
  if (!s || String(s.companyId) !== String(companyId)) return null;
  Object.assign(s, update, { updatedAt: now() });
  return clone(s);
}

export async function listActiveShipments(companyId) {
  // Active = AWB assigned, not yet delivered or cancelled
  const activeStatuses = ["awb_generated", "picked_up", "in_transit", "out_for_delivery"];

  if (isMongoConnected()) {
    return Shipment.find({ companyId, status: { $in: activeStatuses } })
      .sort({ createdAt: -1 })
      .lean();
  }

  return [...memory.shipments.values()]
    .filter((s) => String(s.companyId) === String(companyId) && activeStatuses.includes(s.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(clone);
}
