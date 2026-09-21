import mongoose from "mongoose";
import { isMongoConnected } from "../config/database.js";
import { AuditLog } from "../models/audit-log.model.js";
import { memory, id, clone } from "./memory-store.js";

// Writing an audit entry must never be able to break the thing it's
// auditing. Same contract every notification email in this app already
// follows: best effort, swallow and log on failure, never throw past the
// caller. A workspace losing one audit line is a much smaller problem than
// a workspace unable to cancel an order because the audit write failed.
export async function logAudit({
  companyId,
  actor,
  app = "core",
  action,
  entity = "",
  entityId = "",
  summary = "",
  before = null,
  after = null,
  ip = "",
} = {}) {
  try {
    if (!companyId || !action) return null;

    const entry = {
      companyId,
      actorId: actor?.id || actor?._id || null,
      actorName: actor?.name || "System",
      actorEmail: actor?.email || "",
      app,
      action,
      entity,
      entityId: entityId ? String(entityId) : "",
      summary,
      before,
      after,
      ip,
      at: new Date(),
    };

    if (isMongoConnected()) {
      const saved = await AuditLog.create(entry);
      return saved.toObject();
    }

    const record = { ...entry, _id: id() };
    memory.auditLogs = memory.auditLogs || new Map();
    memory.auditLogs.set(record._id, record);
    return clone(record);
  } catch (error) {
    console.error("[Audit] Failed to write entry:", error.message);
    return null;
  }
}

// Pulls the actor straight off an authenticated request, so call sites
// read as logAudit({ ...auditActor(req), action: "app.install" }) rather
// than re-deriving the same four fields everywhere.
export function auditActor(req) {
  return {
    companyId: req?.auth?.companyId,
    actor: {
      id: req?.auth?.sub,
      name: req?.auth?.name || req?.auth?.email || "Unknown user",
      email: req?.auth?.email || "",
    },
    ip: req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req?.ip || "",
  };
}

export async function listAuditLogs({ companyId, app, entity, entityId, limit = 100, before }) {
  const cap = Math.min(Number(limit) || 100, 500);

  if (isMongoConnected()) {
    const filter = { companyId };
    if (app) filter.app = app;
    if (entity) filter.entity = entity;
    if (entityId) filter.entityId = String(entityId);
    if (before) filter.at = { $lt: new Date(before) };
    return AuditLog.find(filter).sort({ at: -1 }).limit(cap).lean();
  }

  return [...(memory.auditLogs?.values() || [])]
    .filter((row) => {
      if (String(row.companyId) !== String(companyId)) return false;
      if (app && row.app !== app) return false;
      if (entity && row.entity !== entity) return false;
      if (entityId && String(row.entityId) !== String(entityId)) return false;
      if (before && new Date(row.at) >= new Date(before)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, cap)
    .map(clone);
}
