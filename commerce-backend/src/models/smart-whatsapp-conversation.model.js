import mongoose from "mongoose";

// Mirrors whatsapp-conversation.model.js exactly, but for the separate
// "Smart WhatsApp" (unofficial, WhatsApp Web-paired) integration — kept as
// its own model rather than reusing WhatsAppConversation so the two never
// collide or need a provider flag threaded through every query, matching
// the "add this as a genuinely separate feature" instruction it shipped
// under.
const smartWhatsappConversationSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    waId: { type: String, required: true },
    customerName: { type: String, default: "" },
    lastMessageAt: Date,
    lastMessagePreview: { type: String, default: "" },
    unreadCount: { type: Number, default: 0 },
    linkedCustomerId: { type: mongoose.Schema.Types.Mixed },
    // "s.whatsapp.net" (a real phone-number contact) or "lid" (WhatsApp's
    // privacy-preserving Linked ID — the contact's real number is hidden).
    // Captured from whichever domain the first inbound message actually
    // arrived on; a reply MUST go back out on this same domain or it goes
    // nowhere (a @lid message sent to {digits}@s.whatsapp.net addresses a
    // phone number that doesn't exist — that digit string is an opaque
    // WhatsApp id, not a real MSISDN). See smart-whatsapp-service's
    // session-manager.js (jidServerOf) for the full explanation.
    jidServer: { type: String, default: "s.whatsapp.net" },
  },
  { timestamps: true },
);

smartWhatsappConversationSchema.index({ companyId: 1, waId: 1 }, { unique: true });
smartWhatsappConversationSchema.index({ companyId: 1, lastMessageAt: -1 });

export const SmartWhatsAppConversation = mongoose.model("SmartWhatsAppConversation", smartWhatsappConversationSchema);
