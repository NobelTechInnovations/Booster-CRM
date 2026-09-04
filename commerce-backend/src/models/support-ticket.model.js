import mongoose from "mongoose";

// A reply from company staff on one ticket — same embedded-subdocument
// shape as SyncedCustomer.followUps (synced-customer.model.js), reused
// here for the same reason: always read as part of the parent ticket,
// never queried independently. Customer-side is read-only (see the
// support-ticket-view.jsx frontend) — only company staff post here.
const ticketReplySchema = new mongoose.Schema(
  {
    authorName: { type: String, default: "Support" },
    message: { type: String, required: true },
  },
  { _id: true, timestamps: true },
);

// Public, no-login support tickets — a customer submits by category/
// sub-category + a message, giving a phone and/or email (or neither, in
// which case it's saved as a general inquiry: still stored, just
// unnotifiable and unfindable later, same as walking into a store and
// leaving a note with no way to reach you back). Looked up the same way
// the existing public order-tracking page works — by phone/email, scoped
// to one company via its slug — see public-tracking.repo.js, whose
// getActiveCompanyBySlug/phoneCandidates helpers this reuses rather than
// duplicating.
const supportTicketSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    // "TCK-<last 6 hex of this doc's own _id, uppercased>" — set right
    // after creation (needs the real _id first). Human-friendly, no
    // separate counter/race-condition risk, same synthetic-id-from-own-_id
    // reasoning as this session's store-migration work.
    ticketNumber: { type: String, index: true },

    contactPhone: { type: String, trim: true, index: true },
    contactEmail: { type: String, trim: true, lowercase: true, index: true },
    isGeneralInquiry: { type: Boolean, default: false },

    category: { type: String, required: true, trim: true },
    subCategory: { type: String, trim: true },
    message: { type: String, required: true },

    status: { type: String, enum: ["open", "in_progress", "resolved", "closed"], default: "open", index: true },

    replies: [ticketReplySchema],
  },
  { timestamps: true },
);

supportTicketSchema.index({ companyId: 1, contactPhone: 1 });
supportTicketSchema.index({ companyId: 1, contactEmail: 1 });
supportTicketSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);
