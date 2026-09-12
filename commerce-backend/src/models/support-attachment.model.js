import mongoose from "mongoose";

// A customer's (or staff's) uploaded photo/video/PDF attached to a support
// ticket's original message or one of its replies. Stored directly in
// MongoDB rather than a cloud bucket — this app has no S3/Cloudinary/etc.
// account configured (checked: no such credentials in env), and standing
// one up wasn't part of what was asked for. Each attachment is its own
// document (not embedded in the ticket) for two reasons: a ticket read
// never has to pull megabytes of binary data along with it just to show
// the conversation, and each file gets MongoDB's full 16MB-per-document
// budget to itself rather than sharing it with the ticket's own fields —
// see the 12MB per-file cap enforced at the multer layer (public-support.
// routes.js / support.routes.js) for the actual ceiling this leaves.
//
// replyId is null for an attachment on the ticket's original message, or
// the _id of the specific reply subdocument (SupportTicket.replies) it was
// sent with — there's no separate join table, callers just filter this
// collection by {ticketId, replyId} to know which message an attachment
// belongs to.
const supportAttachmentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    ticketId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    replyId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    filename: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true, select: false }, // never loaded on a metadata-only query — see .select("-data") everywhere this is listed
    uploadedBy: { type: String, enum: ["customer", "staff"], required: true },
  },
  { timestamps: true },
);

supportAttachmentSchema.index({ ticketId: 1, replyId: 1 });

export const SupportAttachment = mongoose.model("SupportAttachment", supportAttachmentSchema);
