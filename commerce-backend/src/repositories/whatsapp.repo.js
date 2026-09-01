import mongoose from "mongoose";
import crypto from "node:crypto";
import { isMongoConnected } from "../config/database.js";
import { WhatsAppConversation } from "../models/whatsapp-conversation.model.js";
import { WhatsAppMessage } from "../models/whatsapp-message.model.js";
import { WhatsAppPendingSignup } from "../models/whatsapp-pending-signup.model.js";
import { SyncedCustomer } from "../models/synced-customer.model.js";
import { memory, id, clone, now } from "./memory-store.js";

// Same Mixed-id fix used everywhere else in this codebase — see the
// identical helper's comment in ad-insight.repo.js / social.repo.js.
function mixedIdFilter(idValue) {
  const str = String(idValue || "");
  return mongoose.Types.ObjectId.isValid(str) ? { $in: [str, new mongoose.Types.ObjectId(str)] } : str;
}

// waId arrives from Meta with no "+" and no formatting (e.g. "919876543210").
// SyncedCustomer.phone is whatever Shopify/Amazon reported, which is
// sometimes "+919876543210", sometimes "9876543210" — try both the exact
// waId and a "+"-prefixed version, same spirit as the phone-matching this
// session already applied for lead<->customer linking.
async function findCustomerByWaId({ companyId, waId }) {
  const candidates = [waId, `+${waId}`, waId.replace(/^91/, "")].filter(Boolean);
  if (isMongoConnected()) {
    return SyncedCustomer.findOne({ companyId: mixedIdFilter(companyId), phone: { $in: candidates } }).lean();
  }
  for (const cust of memory.customers?.values() || []) {
    if (String(cust.companyId) === String(companyId) && candidates.includes(cust.phone)) return clone(cust);
  }
  return null;
}

// ─── Conversations ───────────────────────────────────────────────────────────

export async function upsertConversation({ companyId, waId, customerName, lastMessageAt, lastMessagePreview, incrementUnread }) {
  if (isMongoConnected()) {
    const existing = await WhatsAppConversation.findOne({ companyId: mixedIdFilter(companyId), waId }).lean();
    let linkedCustomerId = existing?.linkedCustomerId;
    if (!linkedCustomerId) {
      const customer = await findCustomerByWaId({ companyId, waId });
      if (customer) linkedCustomerId = customer._id;
    }

    return WhatsAppConversation.findOneAndUpdate(
      { companyId: mixedIdFilter(companyId), waId },
      {
        $set: {
          companyId, waId,
          ...(customerName ? { customerName } : {}),
          ...(lastMessageAt ? { lastMessageAt } : {}),
          ...(lastMessagePreview !== undefined ? { lastMessagePreview } : {}),
          ...(linkedCustomerId ? { linkedCustomerId } : {}),
        },
        ...(incrementUnread ? { $inc: { unreadCount: 1 } } : {}),
      },
      { new: true, upsert: true },
    ).lean();
  }

  const key = `${companyId}:${waId}`;
  const existing = memory.whatsappConversations.get(key);
  let linkedCustomerId = existing?.linkedCustomerId;
  if (!linkedCustomerId) {
    const customer = await findCustomerByWaId({ companyId, waId });
    if (customer) linkedCustomerId = customer._id;
  }

  const conversation = {
    _id: existing?._id || id(),
    companyId, waId,
    customerName: customerName || existing?.customerName || "",
    lastMessageAt: lastMessageAt || existing?.lastMessageAt,
    lastMessagePreview: lastMessagePreview !== undefined ? lastMessagePreview : (existing?.lastMessagePreview || ""),
    unreadCount: (existing?.unreadCount || 0) + (incrementUnread ? 1 : 0),
    linkedCustomerId,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };
  memory.whatsappConversations.set(key, conversation);
  return clone(conversation);
}

export async function listConversations({ companyId }) {
  if (isMongoConnected()) {
    return WhatsAppConversation.find({ companyId: mixedIdFilter(companyId) }).sort({ lastMessageAt: -1 }).limit(500).lean();
  }
  return [...memory.whatsappConversations.values()]
    .filter((c) => String(c.companyId) === String(companyId))
    .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0))
    .map(clone);
}

export async function getConversation({ companyId, conversationId }) {
  if (isMongoConnected()) {
    return WhatsAppConversation.findOne({ _id: conversationId, companyId: mixedIdFilter(companyId) }).lean();
  }
  const found = [...memory.whatsappConversations.values()].find((c) => String(c._id) === String(conversationId) && String(c.companyId) === String(companyId));
  return found ? clone(found) : null;
}

export async function markConversationRead({ companyId, conversationId }) {
  if (isMongoConnected()) {
    return WhatsAppConversation.findOneAndUpdate(
      { _id: conversationId, companyId: mixedIdFilter(companyId) },
      { $set: { unreadCount: 0 } },
      { new: true },
    ).lean();
  }
  const found = [...memory.whatsappConversations.values()].find((c) => String(c._id) === String(conversationId) && String(c.companyId) === String(companyId));
  if (!found) return null;
  found.unreadCount = 0;
  found.updatedAt = now();
  return clone(found);
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function createMessage(record) {
  if (isMongoConnected()) {
    // Idempotent on waMessageId — a webhook redelivery for a message
    // already saved just no-ops instead of creating a duplicate row.
    return WhatsAppMessage.findOneAndUpdate(
      { companyId: mixedIdFilter(record.companyId), waMessageId: record.waMessageId },
      { $setOnInsert: record },
      { new: true, upsert: true },
    ).lean();
  }

  const key = `${record.companyId}:${record.waMessageId}`;
  if (memory.whatsappMessages.has(key)) return clone(memory.whatsappMessages.get(key));
  const stored = { _id: id(), ...record, createdAt: now(), updatedAt: now() };
  memory.whatsappMessages.set(key, stored);
  return clone(stored);
}

export async function listMessagesForConversation({ companyId, conversationId, limit = 100 }) {
  if (isMongoConnected()) {
    return WhatsAppMessage.find({ companyId: mixedIdFilter(companyId), conversationId }).sort({ timestamp: 1 }).limit(limit).lean();
  }
  return [...memory.whatsappMessages.values()]
    .filter((m) => String(m.companyId) === String(companyId) && String(m.conversationId) === String(conversationId))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-limit)
    .map(clone);
}

export async function updateMessageStatus({ companyId, waMessageId, status }) {
  if (isMongoConnected()) {
    return WhatsAppMessage.findOneAndUpdate(
      { companyId: mixedIdFilter(companyId), waMessageId },
      { $set: { status } },
      { new: true },
    ).lean();
  }
  for (const msg of memory.whatsappMessages.values()) {
    if (String(msg.companyId) === String(companyId) && msg.waMessageId === waMessageId) {
      msg.status = status;
      msg.updatedAt = now();
      return clone(msg);
    }
  }
  return null;
}

// ─── Pending signup (multi-number picker bridge) ────────────────────────────

export async function createPendingWhatsAppSignup({ companyId, userId, accessToken, candidates }) {
  const selectionToken = crypto.randomBytes(24).toString("base64url");

  if (isMongoConnected()) {
    await WhatsAppPendingSignup.create({ selectionToken, companyId, userId, accessToken, candidates });
    return selectionToken;
  }

  const expiresAt = Date.now() + 15 * 60 * 1000;
  memory.whatsappPendingSignups.set(selectionToken, { companyId, userId, accessToken, candidates, expiresAt });
  return selectionToken;
}

export async function getPendingWhatsAppSignup({ selectionToken, companyId }) {
  if (isMongoConnected()) {
    return WhatsAppPendingSignup.findOne({ selectionToken, companyId: mixedIdFilter(companyId) })
      .select("+accessToken")
      .lean();
  }
  const found = memory.whatsappPendingSignups.get(selectionToken);
  if (!found || String(found.companyId) !== String(companyId)) return null;
  if (found.expiresAt < Date.now()) {
    memory.whatsappPendingSignups.delete(selectionToken);
    return null;
  }
  return clone(found);
}

export async function deletePendingWhatsAppSignup(selectionToken) {
  if (isMongoConnected()) {
    await WhatsAppPendingSignup.deleteOne({ selectionToken });
    return;
  }
  memory.whatsappPendingSignups.delete(selectionToken);
}
