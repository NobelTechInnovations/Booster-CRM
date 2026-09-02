import mongoose from "mongoose";
import { isMongoConnected } from "../config/database.js";
import { SmartWhatsAppSession } from "../models/smart-whatsapp-session.model.js";
import { SmartWhatsAppConversation } from "../models/smart-whatsapp-conversation.model.js";
import { SmartWhatsAppMessage } from "../models/smart-whatsapp-message.model.js";
import { SyncedCustomer } from "../models/synced-customer.model.js";
import { memory, id, clone, now } from "./memory-store.js";

// Same Mixed-id fix used everywhere else in this codebase.
function mixedIdFilter(idValue) {
  const str = String(idValue || "");
  return mongoose.Types.ObjectId.isValid(str) ? { $in: [str, new mongoose.Types.ObjectId(str)] } : str;
}

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

// ─── Session ─────────────────────────────────────────────────────────────────

export async function upsertSmartWhatsAppSession({ companyId, status, phoneNumber }) {
  const set = { companyId, ...(status ? { status } : {}), ...(phoneNumber !== undefined ? { phoneNumber } : {}) };
  if (status === "open") set.lastConnectedAt = new Date();

  if (isMongoConnected()) {
    return SmartWhatsAppSession.findOneAndUpdate(
      { companyId: mixedIdFilter(companyId) },
      { $set: set },
      { new: true, upsert: true },
    ).lean();
  }

  const key = String(companyId);
  const existing = memory.smartWhatsappSessions.get(key);
  const session = { _id: existing?._id || id(), companyId, status: "disconnected", phoneNumber: "", ...existing, ...set, updatedAt: now() };
  memory.smartWhatsappSessions.set(key, session);
  return clone(session);
}

export async function getSmartWhatsAppSession(companyId) {
  if (isMongoConnected()) {
    return SmartWhatsAppSession.findOne({ companyId: mixedIdFilter(companyId) }).lean();
  }
  const found = memory.smartWhatsappSessions.get(String(companyId));
  return found ? clone(found) : null;
}

// ─── Conversations ───────────────────────────────────────────────────────────

export async function upsertSmartConversation({ companyId, waId, customerName, lastMessageAt, lastMessagePreview, incrementUnread, jidServer }) {
  // History-sync backfill (see smart-whatsapp-service's messaging-history.set
  // handler) can call this many times for one conversation in whatever order
  // WhatsApp delivers them, not necessarily newest-last — never let an older
  // message's preview clobber a newer one that's already stored.
  function isNewer(existingAt) {
    if (!lastMessageAt) return false;
    if (!existingAt) return true;
    return new Date(lastMessageAt) >= new Date(existingAt);
  }

  if (isMongoConnected()) {
    const existing = await SmartWhatsAppConversation.findOne({ companyId: mixedIdFilter(companyId), waId }).lean();
    let linkedCustomerId = existing?.linkedCustomerId;
    if (!linkedCustomerId) {
      const customer = await findCustomerByWaId({ companyId, waId });
      if (customer) linkedCustomerId = customer._id;
    }
    const updateLastMessage = isNewer(existing?.lastMessageAt);

    return SmartWhatsAppConversation.findOneAndUpdate(
      { companyId: mixedIdFilter(companyId), waId },
      {
        $set: {
          companyId, waId,
          ...(customerName ? { customerName } : {}),
          ...(updateLastMessage && lastMessageAt ? { lastMessageAt } : {}),
          ...(updateLastMessage && lastMessagePreview !== undefined ? { lastMessagePreview } : {}),
          ...(linkedCustomerId ? { linkedCustomerId } : {}),
          // Only ever set from an actual inbound message (see
          // session-manager.js) — an outbound-only call (starting a fresh
          // conversation, or a routine send) never passes this, and must
          // never reset an already-known lid conversation back to the
          // s.whatsapp.net default.
          ...(jidServer ? { jidServer } : {}),
        },
        ...(incrementUnread ? { $inc: { unreadCount: 1 } } : {}),
      },
      { new: true, upsert: true },
    ).lean();
  }

  const key = `${companyId}:${waId}`;
  const existing = memory.smartWhatsappConversations.get(key);
  let linkedCustomerId = existing?.linkedCustomerId;
  if (!linkedCustomerId) {
    const customer = await findCustomerByWaId({ companyId, waId });
    if (customer) linkedCustomerId = customer._id;
  }
  const updateLastMessage = isNewer(existing?.lastMessageAt);

  const conversation = {
    _id: existing?._id || id(),
    companyId, waId,
    customerName: customerName || existing?.customerName || "",
    lastMessageAt: updateLastMessage ? lastMessageAt : (existing?.lastMessageAt || lastMessageAt),
    lastMessagePreview: updateLastMessage && lastMessagePreview !== undefined ? lastMessagePreview : (existing?.lastMessagePreview || ""),
    unreadCount: (existing?.unreadCount || 0) + (incrementUnread ? 1 : 0),
    linkedCustomerId,
    jidServer: jidServer || existing?.jidServer || "s.whatsapp.net",
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };
  memory.smartWhatsappConversations.set(key, conversation);
  return clone(conversation);
}

export async function listSmartConversations({ companyId }) {
  if (isMongoConnected()) {
    return SmartWhatsAppConversation.find({ companyId: mixedIdFilter(companyId) }).sort({ lastMessageAt: -1 }).limit(500).lean();
  }
  return [...memory.smartWhatsappConversations.values()]
    .filter((c) => String(c.companyId) === String(companyId))
    .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0))
    .map(clone);
}

export async function getSmartConversation({ companyId, conversationId }) {
  if (isMongoConnected()) {
    return SmartWhatsAppConversation.findOne({ _id: conversationId, companyId: mixedIdFilter(companyId) }).lean();
  }
  const found = [...memory.smartWhatsappConversations.values()].find((c) => String(c._id) === String(conversationId) && String(c.companyId) === String(companyId));
  return found ? clone(found) : null;
}

export async function markSmartConversationRead({ companyId, conversationId }) {
  if (isMongoConnected()) {
    return SmartWhatsAppConversation.findOneAndUpdate(
      { _id: conversationId, companyId: mixedIdFilter(companyId) },
      { $set: { unreadCount: 0 } },
      { new: true },
    ).lean();
  }
  const found = [...memory.smartWhatsappConversations.values()].find((c) => String(c._id) === String(conversationId) && String(c.companyId) === String(companyId));
  if (!found) return null;
  found.unreadCount = 0;
  found.updatedAt = now();
  return clone(found);
}

export async function deleteSmartConversation({ companyId, conversationId }) {
  if (isMongoConnected()) {
    const conversation = await SmartWhatsAppConversation.findOneAndDelete({ _id: conversationId, companyId: mixedIdFilter(companyId) }).lean();
    if (!conversation) return null;
    await SmartWhatsAppMessage.deleteMany({ companyId: mixedIdFilter(companyId), conversationId });
    return conversation;
  }

  const found = [...memory.smartWhatsappConversations.entries()].find(([, c]) => String(c._id) === String(conversationId) && String(c.companyId) === String(companyId));
  if (!found) return null;
  const [key, conversation] = found;
  memory.smartWhatsappConversations.delete(key);
  for (const [msgKey, msg] of memory.smartWhatsappMessages.entries()) {
    if (String(msg.companyId) === String(companyId) && String(msg.conversationId) === String(conversationId)) {
      memory.smartWhatsappMessages.delete(msgKey);
    }
  }
  return clone(conversation);
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function createSmartMessage(record) {
  if (isMongoConnected()) {
    return SmartWhatsAppMessage.findOneAndUpdate(
      { companyId: mixedIdFilter(record.companyId), waMessageId: record.waMessageId },
      { $setOnInsert: record },
      { new: true, upsert: true },
    ).lean();
  }

  const key = `${record.companyId}:${record.waMessageId}`;
  if (memory.smartWhatsappMessages.has(key)) return clone(memory.smartWhatsappMessages.get(key));
  const stored = { _id: id(), ...record, createdAt: now(), updatedAt: now() };
  memory.smartWhatsappMessages.set(key, stored);
  return clone(stored);
}

// Delivery/read ticks arriving after the fact for a message already
// recorded (see smart-whatsapp.service.js's handleWebhook, kind
// "message_status"). A message that hasn't synced into our DB yet (a
// status update racing ahead of the original send acknowledgement) is a
// harmless no-op — there's nothing to update.
export async function updateSmartMessageStatus({ companyId, waMessageId, status }) {
  if (isMongoConnected()) {
    return SmartWhatsAppMessage.findOneAndUpdate(
      { companyId: mixedIdFilter(companyId), waMessageId },
      { $set: { status } },
      { new: true },
    ).lean();
  }
  const key = `${companyId}:${waMessageId}`;
  const existing = memory.smartWhatsappMessages.get(key);
  if (!existing) return null;
  existing.status = status;
  existing.updatedAt = now();
  return clone(existing);
}

export async function listSmartMessagesForConversation({ companyId, conversationId, limit = 100 }) {
  if (isMongoConnected()) {
    return SmartWhatsAppMessage.find({ companyId: mixedIdFilter(companyId), conversationId }).sort({ timestamp: 1 }).limit(limit).lean();
  }
  return [...memory.smartWhatsappMessages.values()]
    .filter((m) => String(m.companyId) === String(companyId) && String(m.conversationId) === String(conversationId))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-limit)
    .map(clone);
}
