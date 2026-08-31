import mongoose from "mongoose";

// One row per customer phone number the business has exchanged WhatsApp
// messages with. companyId is Mixed for the same reason every other model
// in this codebase uses it — see mixedIdFilter() in whatsapp.repo.js.
const whatsappConversationSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    // WhatsApp's own id for the customer — their phone number in
    // international format with no leading "+" (e.g. "919876543210"),
    // exactly as Meta sends it in webhook payloads.
    waId: { type: String, required: true },

    customerName: { type: String, default: "" }, // from the WhatsApp profile, if Meta supplies one

    lastMessageAt: Date,
    lastMessagePreview: { type: String, default: "" },
    unreadCount: { type: Number, default: 0 },

    // Optional — matched by phone against SyncedCustomer, same broadened
    // "link on any activity, not just a specific status" rule this session
    // already applied to webhook-lead <-> customer linking.
    linkedCustomerId: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

whatsappConversationSchema.index({ companyId: 1, waId: 1 }, { unique: true });
whatsappConversationSchema.index({ companyId: 1, lastMessageAt: -1 });

export const WhatsAppConversation = mongoose.model("WhatsAppConversation", whatsappConversationSchema);
