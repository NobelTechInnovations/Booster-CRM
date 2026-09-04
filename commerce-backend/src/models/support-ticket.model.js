import mongoose from "mongoose";

// A reply on one ticket — same embedded-subdocument shape as
// SyncedCustomer.followUps (synced-customer.model.js), reused here for the
// same reason: always read as part of the parent ticket, never queried
// independently. authorType distinguishes a company-staff reply from a
// customer's own follow-up comment (both public-support.routes.js and
// support.routes.js post here, on the two different auth models each uses).
const ticketReplySchema = new mongoose.Schema(
  {
    authorName: { type: String, default: "Support" },
    authorType: { type: String, enum: ["staff", "customer"], default: "staff" },
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

    // "pending_close" — staff asked to close it, but it isn't closed yet:
    // the customer gets a chance to confirm or object (by commenting,
    // which cancels the pending close) before it closes on its own after
    // 48h (see jobs/support-ticket-auto-close.job.js). A customer closing
    // their OWN ticket skips this entirely and goes straight to "closed" —
    // the hold is specifically for a close staff initiates on someone
    // else's behalf.
    status: { type: String, enum: ["open", "in_progress", "pending_close", "resolved", "closed"], default: "open", index: true },
    // Set when status becomes "pending_close" — what the 48h auto-close
    // job measures from. Cleared (left stale but harmless) once the
    // ticket leaves that status either way.
    pendingCloseAt: Date,

    replies: [ticketReplySchema],
  },
  { timestamps: true },
);

supportTicketSchema.index({ companyId: 1, contactPhone: 1 });
supportTicketSchema.index({ companyId: 1, contactEmail: 1 });
supportTicketSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);
