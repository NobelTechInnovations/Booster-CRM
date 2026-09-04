import mongoose from "mongoose";

// One row per email the automation dispatcher actually attempted to send —
// the audit trail that answers "did this fire, and what happened" for a
// company's own automation rules, and the source of truth the dispatcher's
// own idempotency guard reads before sending again (see
// automation-dispatcher.js: a webhook can redeliver, a cron can re-scan,
// so before sending it checks whether this exact rule already emailed for
// this exact order and skips if so).
const emailLogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailTemplate" },
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: "AutomationRule", index: true },
    // Present for every order-lifecycle trigger (order_placed, order_fulfilled,
    // order_delivered, order_cancelled, refund_processed, cod_payment_reminder);
    // absent for a custom trigger fired with no associated order.
    orderId: { type: mongoose.Schema.Types.Mixed, index: true },
    trigger: String,
    to: { type: String, required: true },
    subject: String,
    status: { type: String, enum: ["sent", "failed"], required: true },
    error: String,
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

emailLogSchema.index({ companyId: 1, ruleId: 1, orderId: 1 });
emailLogSchema.index({ companyId: 1, createdAt: -1 });

export const EmailLog = mongoose.model("EmailLog", emailLogSchema);
