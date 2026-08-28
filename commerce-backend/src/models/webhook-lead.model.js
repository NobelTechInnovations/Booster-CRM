import mongoose from "mongoose";

// One row per grouped lead (e.g. one abandoned cart, identified by cart_id) —
// upserted every time a new WebhookEvent with the same (endpointId, leadKey)
// arrives, so this always reflects the latest stage/summary without needing
// to re-scan every individual event. Follow-up tracking mirrors
// SyncedCustomer's exact same shape (followUpStatus/followUps) so this reads
// the same way in the UI as customer follow-ups already do.
const followUpSchema = new mongoose.Schema(
  {
    calledAt: { type: Date, required: true },
    note: { type: String, default: "" },
    outcome: {
      type: String,
      enum: ["called", "no_answer", "interested", "converted", "follow_up_later", "not_interested", "other"],
      default: "called",
    },
    nextFollowUpAt: { type: Date },
    createdByName: { type: String, default: "Agent" },
  },
  { _id: true, timestamps: true },
);

const webhookLeadSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    endpointId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    provider: { type: String, required: true, trim: true },
    leadKey: { type: String, required: true, trim: true },

    // Denormalized from the latest event, so the leads list never has to join.
    latestType: String,
    latestSummary: String,
    latestStage: String,
    customerName: String,
    customerEmail: String,
    customerPhone: String,
    cartValue: Number,
    // What product(s) the shopper looked at/added — from real cart contents
    // when available, else parsed from the landing-page URL. The whole point
    // of this field: know what to talk about on the follow-up call.
    productInterest: String,
    landingPageUrl: String,
    ipAddress: String,

    // IP -> approximate location, resolved lazily (not at webhook-ingest
    // time — keeps the inbound receiver fast) via a separate geo lookup call.
    // likelyLanguage is a general-knowledge Indian-state -> language guess,
    // not a verified fact about this specific person.
    geoCity: String,
    geoRegion: String,
    geoCountry: String,
    likelyLanguage: String,
    geoResolvedAt: Date,

    eventCount: { type: Number, default: 0 },
    firstEventAt: Date,
    lastEventAt: Date,

    // Set when the lead is opened in the drawer — used to distinguish new/unseen
    // leads (bright row highlight) from already-reviewed ones. Stored in DB so
    // "seen" survives page refresh and other users on the same account see it too.
    seenAt: { type: Date, default: null, index: true },

    // Set when the lead is linked to a synced customer (same phone/email).
    linkedCustomerId: { type: mongoose.Schema.Types.Mixed, default: null },

    followUpStatus: {
      type: String,
      enum: ["new", "follow_up_scheduled", "converted", "no_response", "closed"],
      default: "new",
      index: true,
    },
    nextFollowUpAt: { type: Date, index: true },
    followUps: [followUpSchema],
  },
  { timestamps: true },
);

webhookLeadSchema.index({ endpointId: 1, leadKey: 1 }, { unique: true });
webhookLeadSchema.index({ companyId: 1, lastEventAt: -1 });

export const WebhookLead = mongoose.model("WebhookLead", webhookLeadSchema);
