import crypto from "node:crypto";
import mongoose from "mongoose";
import { isMongoConnected } from "../config/database.js";
import { WebhookEndpoint } from "../models/webhook-endpoint.model.js";
import { WebhookEvent } from "../models/webhook-event.model.js";
import { memory, id, clone, now } from "./memory-store.js";

// Same Schema.Types.Mixed id-filter fix applied everywhere else in this repo
// layer (order.repo.js, ad-insight.repo.js, finance.repo.js) — companyId can
// be saved as a string or ObjectId depending on the write path.
function mixedIdFilter(idValue) {
  const str = String(idValue || "");
  return mongoose.Types.ObjectId.isValid(str) ? { $in: [str, new mongoose.Types.ObjectId(str)] } : str;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export async function listWebhookEndpoints(companyId) {
  if (isMongoConnected()) {
    return WebhookEndpoint.find({ companyId: mixedIdFilter(companyId) }).sort({ createdAt: -1 }).lean();
  }
  return [...memory.webhookEndpoints.values()]
    .filter((e) => String(e.companyId) === String(companyId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(clone);
}

export async function createWebhookEndpoint({ companyId, name, provider, type }) {
  const clean = {
    name: String(name || "").trim(),
    provider: String(provider || "").trim().toLowerCase(),
    type: ["payment", "cart-recovery", "shipping", "other"].includes(type) ? type : "other",
  };
  if (!clean.name || !clean.provider) return { error: "Name and provider are required" };

  const token = crypto.randomBytes(20).toString("hex");
  const secret = crypto.randomBytes(24).toString("hex");

  if (isMongoConnected()) {
    const endpoint = await WebhookEndpoint.create({ companyId, ...clean, token, secret, status: "active", eventCount: 0 });
    // Only moment the raw secret is ever returned — the field is select:false everywhere else.
    return { endpoint: { ...endpoint.toObject(), secret } };
  }

  const endpoint = { _id: id(), companyId, ...clean, token, secret, status: "active", eventCount: 0, lastEventAt: null, createdAt: now(), updatedAt: now() };
  memory.webhookEndpoints.set(endpoint._id, endpoint);
  return { endpoint: clone(endpoint) };
}

export async function updateWebhookEndpoint({ companyId, endpointId, payload }) {
  const clean = {};
  if (payload.name !== undefined) clean.name = String(payload.name).trim();
  if (payload.status !== undefined) clean.status = payload.status === "inactive" ? "inactive" : "active";
  if (payload.type !== undefined && ["payment", "cart-recovery", "shipping", "other"].includes(payload.type)) clean.type = payload.type;

  if (isMongoConnected()) {
    const endpoint = await WebhookEndpoint.findOneAndUpdate(
      { _id: endpointId, companyId: mixedIdFilter(companyId) },
      { $set: clean },
      { new: true },
    ).lean();
    if (!endpoint) return { error: "Webhook endpoint not found" };
    return { endpoint };
  }

  const endpoint = memory.webhookEndpoints.get(endpointId);
  if (!endpoint || String(endpoint.companyId) !== String(companyId)) return { error: "Webhook endpoint not found" };
  Object.assign(endpoint, clean, { updatedAt: now() });
  return { endpoint: clone(endpoint) };
}

export async function deleteWebhookEndpoint({ companyId, endpointId }) {
  if (isMongoConnected()) {
    const endpoint = await WebhookEndpoint.findOneAndDelete({ _id: endpointId, companyId: mixedIdFilter(companyId) }).lean();
    return { endpoint };
  }

  const endpoint = memory.webhookEndpoints.get(endpointId);
  if (!endpoint || String(endpoint.companyId) !== String(companyId)) return { endpoint: null };
  memory.webhookEndpoints.delete(endpointId);
  return { endpoint: clone(endpoint) };
}

// Public lookup used by the inbound receiver — keyed purely by the
// unguessable token, no auth/companyId available at that point.
export async function getEndpointByToken(token, { includeSecret = false } = {}) {
  if (isMongoConnected()) {
    const query = WebhookEndpoint.findOne({ token });
    if (includeSecret) query.select("+secret");
    return query.lean();
  }
  const endpoint = [...memory.webhookEndpoints.values()].find((e) => e.token === token);
  return endpoint ? clone(endpoint) : null;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export async function recordWebhookEvent({ companyId, endpointId, provider, type, summary, payload, headers, verified }) {
  const record = { companyId, endpointId, provider, type, summary, payload, headers, verified: Boolean(verified), receivedAt: new Date() };

  if (isMongoConnected()) {
    const event = await WebhookEvent.create(record);
    await WebhookEndpoint.findByIdAndUpdate(endpointId, { $set: { lastEventAt: event.receivedAt }, $inc: { eventCount: 1 } });
    return event.toObject();
  }

  const event = { _id: id(), ...record, createdAt: now(), updatedAt: now() };
  memory.webhookEvents.set(event._id, event);
  const endpoint = memory.webhookEndpoints.get(endpointId);
  if (endpoint) {
    endpoint.lastEventAt = event.receivedAt;
    endpoint.eventCount = (endpoint.eventCount || 0) + 1;
  }
  return clone(event);
}

export async function listWebhookEvents({ companyId, endpointId, provider, limit = 200 }) {
  const filter = {
    companyId: mixedIdFilter(companyId),
    ...(endpointId ? { endpointId: mixedIdFilter(endpointId) } : {}),
    ...(provider ? { provider } : {}),
  };

  if (isMongoConnected()) {
    return WebhookEvent.find(filter).sort({ receivedAt: -1 }).limit(limit).lean();
  }

  return [...memory.webhookEvents.values()]
    .filter((e) => {
      if (String(e.companyId) !== String(companyId)) return false;
      if (endpointId && String(e.endpointId) !== String(endpointId)) return false;
      if (provider && e.provider !== provider) return false;
      return true;
    })
    .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
    .slice(0, limit)
    .map(clone);
}

export async function getWebhookEvent({ companyId, eventId }) {
  if (isMongoConnected()) {
    return WebhookEvent.findOne({ _id: eventId, companyId: mixedIdFilter(companyId) }).lean();
  }
  const event = memory.webhookEvents.get(eventId);
  if (!event || String(event.companyId) !== String(companyId)) return null;
  return clone(event);
}
