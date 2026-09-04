import mongoose from "mongoose";

const automationRuleSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    name: { type: String, required: true, trim: true },
    // A plain string, not an enum — order_placed/order_fulfilled/order_delivered/
    // order_cancelled/refund_processed/cod_payment_reminder/low_stock/
    // repeat_customer/abandoned_checkout are the built-in keys (see
    // automation.repo.js's BUILT_IN_TRIGGERS), but a company can also name
    // its own custom trigger and fire it externally (see webhook-inbox.routes.js's
    // automationTriggerKey) — cleanPayload() in automation.repo.js is what
    // actually validates this is one of those OR a real non-empty string,
    // not the schema.
    trigger: { type: String, required: true, trim: true, index: true },
    action: {
      type: String,
      enum: ["send_whatsapp", "send_email", "tag_order", "notify_team", "webhook"],
      required: true,
    },
    config: mongoose.Schema.Types.Mixed,   // e.g. { message, webhookUrl, tag }
    isActive: { type: Boolean, default: true },
    runCount: { type: Number, default: 0 },
    lastRunAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const AutomationRule = mongoose.model("AutomationRule", automationRuleSchema);
