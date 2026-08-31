import mongoose from "mongoose";

const whatsappMessageSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "WhatsAppConversation", required: true, index: true },

    // Meta's own message id — unique, and specifically what makes webhook
    // redelivery idempotent (Meta retries a webhook POST if it doesn't get
    // a fast 200 back, which would otherwise duplicate the message).
    waMessageId: { type: String, required: true },

    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    type: { type: String, default: "text" }, // text | image | document | template | ...
    text: { type: String, default: "" },
    mediaUrl: { type: String, default: "" },

    // sent -> delivered -> read is the normal outbound progression, updated
    // as Meta's status webhook events arrive; inbound messages are just
    // "received" and never get a status update.
    status: { type: String, enum: ["received", "sent", "delivered", "read", "failed"], default: "received" },

    timestamp: { type: Date, required: true },
    sentByUserName: { type: String, default: "" }, // which panel user sent it, for outbound only
  },
  { timestamps: true },
);

whatsappMessageSchema.index({ companyId: 1, waMessageId: 1 }, { unique: true });
whatsappMessageSchema.index({ conversationId: 1, timestamp: 1 });

export const WhatsAppMessage = mongoose.model("WhatsAppMessage", whatsappMessageSchema);
