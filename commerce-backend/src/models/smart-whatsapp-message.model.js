import mongoose from "mongoose";

// Mirrors whatsapp-message.model.js — see that file's comments for the
// reasoning on each field. mediaId here is the smart-whatsapp-service's
// own message id (used to re-fetch that service's
// GET /sessions/:companyId/media/:messageId), not a Meta media id.
const smartWhatsappMessageSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "SmartWhatsAppConversation", required: true, index: true },
    waMessageId: { type: String, required: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    type: { type: String, default: "text" },
    text: { type: String, default: "" },
    mediaUrl: { type: String, default: "" },
    mediaId: { type: String, default: "" },
    mediaMimeType: { type: String, default: "" },
    status: { type: String, enum: ["received", "sent", "failed"], default: "received" },
    timestamp: { type: Date, required: true },
    sentByUserName: { type: String, default: "" },
  },
  { timestamps: true },
);

smartWhatsappMessageSchema.index({ companyId: 1, waMessageId: 1 }, { unique: true });
smartWhatsappMessageSchema.index({ conversationId: 1, timestamp: 1 });

export const SmartWhatsAppMessage = mongoose.model("SmartWhatsAppMessage", smartWhatsappMessageSchema);
