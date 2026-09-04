import mongoose from "mongoose";

// A company's own email content for one automation trigger — subject/body
// support {{namedVariable}} placeholders (see utils/template-render.js),
// rendered against that trigger's real event data by the automation
// dispatcher (modules/automation/automation-dispatcher.js) before sending
// through the company's own connected SMTP channel (channelType: "email").
// `trigger` is a plain string, not an enum, to match automation-rule.model.js's
// same trigger field — both the built-in order-lifecycle keys and any
// custom-named trigger a company invents are valid here.
const emailTemplateSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    name: { type: String, required: true, trim: true },
    trigger: { type: String, required: true, trim: true, index: true },
    subject: { type: String, required: true },
    bodyHtml: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

emailTemplateSchema.index({ companyId: 1, trigger: 1 });

export const EmailTemplate = mongoose.model("EmailTemplate", emailTemplateSchema);
