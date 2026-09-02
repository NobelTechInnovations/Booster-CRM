import mongoose from "mongoose";

// One row per company — this app's own record of what the smart-whatsapp
// service last reported for that company's connection. The service itself
// is the source of truth for whether the socket is actually live; this is
// just a cache so the panel can show status without a round trip on every
// page load, kept in sync by the service's own webhook push
// (smart-whatsapp.service.js's handleWebhook) and by polling on connect.
const smartWhatsappSessionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["disconnected", "connecting", "qr", "open", "close", "logged_out"],
      default: "disconnected",
    },
    phoneNumber: { type: String, default: "" },
    lastConnectedAt: Date,
  },
  { timestamps: true },
);

export const SmartWhatsAppSession = mongoose.model("SmartWhatsAppSession", smartWhatsappSessionSchema);
