import crypto from "node:crypto";
import mongoose from "mongoose";
import { isMongoConnected } from "../config/database.js";
import { WebhookEndpoint } from "../models/webhook-endpoint.model.js";
import { WebhookEvent } from "../models/webhook-event.model.js";
import { WebhookLead } from "../models/webhook-lead.model.js";
import { SyncedCustomer } from "../models/synced-customer.model.js";
import { extractLeadInfo } from "../modules/webhooks/webhook.service.js";
import { lookupIpGeo, guessLanguage } from "../utils/geo-lookup.js";
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

export async function recordWebhookEvent({ companyId, endpointId, provider, type, summary, payload, headers, verified, leadKey }) {
  const record = { companyId, endpointId, provider, type, summary, payload, headers, verified: Boolean(verified), receivedAt: new Date(), leadKey: leadKey || undefined };

  let event;
  if (isMongoConnected()) {
    const created = await WebhookEvent.create(record);
    await WebhookEndpoint.findByIdAndUpdate(endpointId, { $set: { lastEventAt: created.receivedAt }, $inc: { eventCount: 1 } });
    event = created.toObject();
  } else {
    event = { _id: id(), ...record, createdAt: now(), updatedAt: now() };
    memory.webhookEvents.set(event._id, event);
    const endpoint = memory.webhookEndpoints.get(endpointId);
    if (endpoint) {
      endpoint.lastEventAt = event.receivedAt;
      endpoint.eventCount = (endpoint.eventCount || 0) + 1;
    }
  }

  // Group into a lead — falls back to the event's own id when nothing in the
  // payload is identifiable (leadKey null), so every event still surfaces
  // somewhere rather than being silently unreachable from the leads list.
  await upsertWebhookLead({ companyId, endpointId, provider, leadKey: leadKey || String(event._id), type, summary, payload });

  return event;
}

// Upserted on every event for a given (endpointId, leadKey) — always reflects
// the latest stage without re-scanning every individual event. followUpStatus/
// followUps are only ever touched by addLeadFollowUp() below, never here, so
// a new event on an already-being-worked lead doesn't reset its follow-up state.
async function upsertWebhookLead({ companyId, endpointId, provider, leadKey, type, summary, payload }) {
  const info = extractLeadInfo(provider, payload);
  const now_ = new Date();

  const denormalized = {
    provider,
    latestType: type,
    latestSummary: summary,
    latestStage: info.stage || type,
    ...(info.name ? { customerName: info.name } : {}),
    ...(info.email ? { customerEmail: info.email } : {}),
    ...(info.phone ? { customerPhone: info.phone } : {}),
    ...(info.cartValue !== undefined ? { cartValue: info.cartValue } : {}),
    // productInterest can legitimately change across events for the same
    // cart (they added a different item), so it's always refreshed to the
    // latest — same as latestStage. ip/landingPageUrl too.
    ...(info.productInterest ? { productInterest: info.productInterest } : {}),
    ...(info.landingPageUrl ? { landingPageUrl: info.landingPageUrl } : {}),
    ...(info.ip ? { ipAddress: info.ip } : {}),
    lastEventAt: now_,
  };

  if (isMongoConnected()) {
    await WebhookLead.findOneAndUpdate(
      { companyId, endpointId, leadKey },
      { $set: denormalized, $inc: { eventCount: 1 }, $setOnInsert: { companyId, endpointId, leadKey, firstEventAt: now_, followUpStatus: "new" } },
      { upsert: true },
    );
    return;
  }

  const memKey = `${endpointId}:${leadKey}`;
  const existing = memory.webhookLeads.get(memKey);
  if (existing) {
    Object.assign(existing, denormalized, { eventCount: (existing.eventCount || 0) + 1, updatedAt: now() });
  } else {
    memory.webhookLeads.set(memKey, {
      _id: id(), companyId, endpointId, leadKey, ...denormalized,
      eventCount: 1, firstEventAt: now_, followUpStatus: "new", followUps: [],
      createdAt: now(), updatedAt: now(),
    });
  }
}

// ─── Leads (grouped events) ─────────────────────────────────────────────────

export async function listWebhookLeads({ companyId, endpointId, provider, limit = 2000 }) {
  const filter = {
    companyId: mixedIdFilter(companyId),
    ...(endpointId ? { endpointId: mixedIdFilter(endpointId) } : {}),
    ...(provider ? { provider } : {}),
  };

  if (isMongoConnected()) {
    return WebhookLead.find(filter).sort({ lastEventAt: -1 }).limit(limit).lean();
  }

  return [...memory.webhookLeads.values()]
    .filter((l) => {
      if (String(l.companyId) !== String(companyId)) return false;
      if (endpointId && String(l.endpointId) !== String(endpointId)) return false;
      if (provider && l.provider !== provider) return false;
      return true;
    })
    .sort((a, b) => new Date(b.lastEventAt) - new Date(a.lastEventAt))
    .slice(0, limit)
    .map(clone);
}

export async function getWebhookLead({ companyId, leadId }) {
  if (isMongoConnected()) {
    return WebhookLead.findOne({ _id: leadId, companyId: mixedIdFilter(companyId) }).lean();
  }
  for (const lead of memory.webhookLeads.values()) {
    if (String(lead._id) === String(leadId) && String(lead.companyId) === String(companyId)) return clone(lead);
  }
  return null;
}

// Resolves a lead's captured IP to an approximate city/region and a likely
// follow-up language — lazily, on request, never at webhook-ingest time (an
// external HTTP call on every inbound webhook would slow down the receiver
// and risk provider retries). An IP's location doesn't change, so once
// resolved it's cached on the lead forever — re-fetching would just burn the
// free geo API's rate limit for the same answer.
export async function resolveLeadGeo({ companyId, leadId }) {
  const lead = await getWebhookLead({ companyId, leadId });
  if (!lead) return null;
  if (lead.geoResolvedAt) return lead; // already cached
  if (!lead.ipAddress) return lead; // nothing to resolve

  const geo = await lookupIpGeo(lead.ipAddress);
  const update = {
    geoResolvedAt: new Date(),
    ...(geo ? {
      geoCity: geo.city,
      geoRegion: geo.region,
      geoCountry: geo.country,
      likelyLanguage: guessLanguage({ country: geo.country, regionCode: geo.regionCode }) || undefined,
    } : {}),
  };

  if (isMongoConnected()) {
    return WebhookLead.findOneAndUpdate({ _id: leadId, companyId: mixedIdFilter(companyId) }, { $set: update }, { new: true }).lean();
  }
  const memLead = [...memory.webhookLeads.values()].find((l) => String(l._id) === String(leadId) && String(l.companyId) === String(companyId));
  if (memLead) Object.assign(memLead, update);
  return memLead ? clone(memLead) : lead;
}

// Best-effort batch version for a leads table on screen — resolves whichever
// of the given leads aren't cached yet, skipping/ignoring individual
// failures (a bad IP or a rate-limit hit on one lead shouldn't block the
// rest). Callers should keep the batch small (the leads actually visible),
// not the entire leads table — see lookupIpGeo's rate-limit note.
export async function resolveLeadsGeoBulk({ companyId, leadIds }) {
  const results = await Promise.all(
    leadIds.map(async (leadId) => {
      try {
        return await resolveLeadGeo({ companyId, leadId });
      } catch (_err) {
        return null;
      }
    }),
  );
  return results.filter(Boolean);
}

// All raw events belonging to one lead's timeline — for the drawer.
export async function listEventsForLead({ companyId, endpointId, leadKey, limit = 100 }) {
  const filter = { companyId: mixedIdFilter(companyId), endpointId: mixedIdFilter(endpointId), leadKey };

  if (isMongoConnected()) {
    return WebhookEvent.find(filter).sort({ receivedAt: -1 }).limit(limit).lean();
  }

  return [...memory.webhookEvents.values()]
    .filter((e) => String(e.companyId) === String(companyId) && String(e.endpointId) === String(endpointId) && e.leadKey === leadKey)
    .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
    .slice(0, limit)
    .map(clone);
}

// Same shape/semantics as the customer follow-up log (channel.routes.js) —
// deliberately kept consistent so a lead and a customer read the same way.
export async function addLeadFollowUp({ companyId, leadId, note, outcome, nextFollowUpAt, followUpStatus, createdByName }) {
  const followUpEntry = {
    calledAt: new Date(),
    note: note || "",
    outcome: outcome || "called",
    nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : undefined,
    createdByName: createdByName || "Agent",
  };

  if (isMongoConnected()) {
    const update = { $push: { followUps: { $each: [followUpEntry], $position: 0 } }, $set: {} };
    if (followUpStatus) update.$set.followUpStatus = followUpStatus;
    if (nextFollowUpAt) update.$set.nextFollowUpAt = new Date(nextFollowUpAt);
    if (Object.keys(update.$set).length === 0) delete update.$set;

    const lead = await WebhookLead.findOneAndUpdate({ _id: leadId, companyId: mixedIdFilter(companyId) }, update, { new: true }).lean();

    // Auto-link to SyncedCustomer when converting a lead
    if (lead && followUpStatus === "converted" && lead.customerPhone && !lead.linkedCustomerId) {
      const customer = await SyncedCustomer.findOne({
        companyId: mixedIdFilter(companyId),
        phone: lead.customerPhone,
      }).lean();
      if (customer) {
        await WebhookLead.updateOne({ _id: leadId }, { $set: { linkedCustomerId: customer._id } });
        lead.linkedCustomerId = customer._id;
      }
    }

    return lead;
  }

  for (const lead of memory.webhookLeads.values()) {
    if (String(lead._id) === String(leadId) && String(lead.companyId) === String(companyId)) {
      lead.followUps = [followUpEntry, ...(lead.followUps || [])];
      if (followUpStatus) lead.followUpStatus = followUpStatus;
      if (nextFollowUpAt) lead.nextFollowUpAt = new Date(nextFollowUpAt);
      lead.updatedAt = now();

      // Auto-link in-memory when converting
      if (followUpStatus === "converted" && lead.customerPhone && !lead.linkedCustomerId) {
        for (const cust of (memory.syncedCustomers?.values() || [])) {
          if (String(cust.companyId) === String(companyId) && cust.phone === lead.customerPhone) {
            lead.linkedCustomerId = cust._id;
            break;
          }
        }
      }

      return clone(lead);
    }
  }
  return null;
}

// Mark a lead as seen (opened in the drawer). Once set, seenAt is never
// cleared — it's a one-way "has been reviewed" flag, not a toggle.
export async function markLeadSeen({ companyId, leadId }) {
  if (isMongoConnected()) {
    return WebhookLead.findOneAndUpdate(
      { _id: leadId, companyId: mixedIdFilter(companyId), seenAt: null },
      { $set: { seenAt: new Date() } },
      { new: true },
    ).lean();
  }
  for (const lead of memory.webhookLeads.values()) {
    if (String(lead._id) === String(leadId) && String(lead.companyId) === String(companyId) && !lead.seenAt) {
      lead.seenAt = now();
      return clone(lead);
    }
  }
  return null; // already seen — no update needed
}

// Link a lead to a synced customer by their DB id — called when a lead is
// converted or when a matching phone/email is found during customer sync.
export async function linkLeadToCustomer({ companyId, leadId, customerId }) {
  if (isMongoConnected()) {
    return WebhookLead.findOneAndUpdate(
      { _id: leadId, companyId: mixedIdFilter(companyId) },
      { $set: { linkedCustomerId: customerId } },
      { new: true },
    ).lean();
  }
  for (const lead of memory.webhookLeads.values()) {
    if (String(lead._id) === String(leadId) && String(lead.companyId) === String(companyId)) {
      lead.linkedCustomerId = customerId;
      return clone(lead);
    }
  }
  return null;
}

export async function listWebhookEvents({ companyId, endpointId, provider, limit = 2000 }) {
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
