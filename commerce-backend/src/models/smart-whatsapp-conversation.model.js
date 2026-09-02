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
  },
  { timestamps: true },
);

smartWhatsappConversationSchema.index({ companyId: 1, waId: 1 }, { unique: true });
smartWhatsappConversationSchema.index({ companyId: 1, lastMessageAt: -1 });

export const SmartWhatsAppConversation = mongoose.model("SmartWhatsAppConversation", smartWhatsappConversationSchema);
