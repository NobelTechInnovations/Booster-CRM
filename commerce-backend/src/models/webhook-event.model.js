import mongoose from "mongoose";

// One row per inbound webhook call received — the raw payload plus a
// best-effort human-readable summary (extractSummary() in webhook.service.js)
// so the events list is scannable without opening every payload.
const webhookEventSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    endpointId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    provider: { type: String, required: true, trim: true },
    type: { type: String, trim: true }, // e.g. "payment.captured", "cart.abandoned" — extracted from payload/headers, best effort
    summary: { type: String, trim: true }, // e.g. "₹499 captured — priya@example.com"
    // Groups repeat events from the same underlying lead (a cart progressing
    // INIT -> PAYMENT_INITIATED -> ORDER_SCREEN all share one cart_id, sent
    // as separate webhook calls) — extracted best-effort from the payload
    // (cart_id, order_id, or a customer identifier), see extractLeadKey() in
    // webhook.service.js. Never null in practice — falls back to the event's
    // own _id so an ungroupable event still gets its own lead row.
    leadKey: { type: String, trim: true, index: true },

    payload: { type: mongoose.Schema.Types.Mixed },
    headers: { type: mongoose.Schema.Types.Mixed }, // a filtered subset, not the full header set (avoid storing auth-adjacent noise)

    verified: { type: Boolean, default: false }, // true only if a secret was configured AND the signature matched
    receivedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

webhookEventSchema.index({ companyId: 1, receivedAt: -1 });
webhookEventSchema.index({ endpointId: 1, receivedAt: -1 });

export const WebhookEvent = mongoose.model("WebhookEvent", webhookEventSchema);
