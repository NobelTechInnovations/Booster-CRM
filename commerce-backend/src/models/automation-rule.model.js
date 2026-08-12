import mongoose from "mongoose";

const automationRuleSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    name: { type: String, required: true, trim: true },
    trigger: {
      type: String,
      enum: ["order_placed", "order_fulfilled", "order_cancelled", "low_stock", "repeat_customer", "abandoned_checkout"],
      required: true,
    },
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
