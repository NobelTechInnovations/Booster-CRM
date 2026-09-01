import mongoose from "mongoose";

// Short-lived bridge between the OAuth redirect callback and the frontend
// picker screen — needed only when a company's Meta login grants access to
// more than one WhatsApp phone number and there's no way to know in
// advance which one they want connected. The access token itself lives
// here (never in a URL — a long-lived token in a redirect query string
// would end up in browser history and server logs) and this row is
// deleted (or expires via the TTL index below) as soon as the company
// picks a number, or after 15 minutes if they never come back to finish.
const whatsappPendingSignupSchema = new mongoose.Schema({
  selectionToken: { type: String, required: true, unique: true, index: true },
  companyId: { type: mongoose.Schema.Types.Mixed, required: true },
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  accessToken: { type: String, required: true, select: false },
  candidates: [
    {
      phoneNumberId: String,
      whatsappBusinessAccountId: String,
      displayPhoneNumber: String,
      verifiedName: String,
    },
  ],
  createdAt: { type: Date, default: Date.now, expires: 900 }, // 15 minutes
});

export const WhatsAppPendingSignup =
  mongoose.models.WhatsAppPendingSignup || mongoose.model("WhatsAppPendingSignup", whatsappPendingSignupSchema);
