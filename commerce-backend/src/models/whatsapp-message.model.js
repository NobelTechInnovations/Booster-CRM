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
    type: { type: String, default: "text" }, // text | image | video | document | audio | template | ...
    text: { type: String, default: "" },
    // Outbound attachments carry a real, directly-fetchable link (whatever
    // URL the sender attached). Inbound attachments only ever carry Meta's
    // opaque media id — Meta's own media URLs need a Bearer token and
    // expire in minutes, so inbound media is fetched on demand through
    // GET /api/whatsapp/media/:mediaId instead of being stored as a URL.
    mediaUrl: { type: String, default: "" },
    mediaId: { type: String, default: "" },
    mediaMimeType: { type: String, default: "" },

    // sent -> delivered -> read is the normal outbound progression, updated
    // as Meta's status webhook events arrive; inbound messages are just
    // "received" and never get a status update.
    status: { type: String, enum: ["received", "sent", "delivered", "read", "failed"], default: "received" },
    // Meta's own error code/title/message from the status webhook's
    // `errors` array — only ever set when status is "failed". Previously
    // discarded entirely (only the bare word "failed" was kept), making a
    // failed send undiagnosable from inside the panel. See
    // updateMessageStatus (whatsapp.repo.js).
    errorCode: { type: Number },
    errorMessage: { type: String, default: "" },

    timestamp: { type: Date, required: true },
    sentByUserName: { type: String, default: "" }, // which panel user sent it, for outbound only
  },
  { timestamps: true },
);

whatsappMessageSchema.index({ companyId: 1, waMessageId: 1 }, { unique: true });
whatsappMessageSchema.index({ conversationId: 1, timestamp: 1 });

export const WhatsAppMessage = mongoose.model("WhatsAppMessage", whatsappMessageSchema);
