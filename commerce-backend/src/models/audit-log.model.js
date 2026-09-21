import mongoose from "mongoose";

// The platform-wide "who changed what" trail. Until now this app had only
// scattered, domain-specific trails — WalletTransaction for balance moves,
// EmailLog for sends, SkuCost.history for price edits, SyncedOrder
// .statusHistory for order stages. Each is good at its own job and none of
// them can answer "what did this user do last Tuesday", which is the
// question that actually matters once one workspace has several apps and
// several people with different roles inside it.
//
// Deliberately denormalized: actorName/actorEmail and a human-readable
// `summary` are written at log time rather than joined at read time, so an
// entry still reads correctly after the user who made it is renamed,
// disabled, or removed from the workspace entirely. An audit trail that
// goes blank when someone leaves is not an audit trail.
const auditLogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },

    // Null for anything the system did on its own — a cron job, a webhook
    // from Shopify, an automation rule firing.
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorName: { type: String, default: "System" },
    actorEmail: { type: String, default: "" },

    // Which app the action belongs to ("core" for platform-level things like
    // installing an app or changing a role). Lets the audit view filter by
    // app the same way the nav does.
    app: { type: String, required: true, index: true },

    // Dotted verb — "app.install", "role.update", "user.disable",
    // "order.cancel". Stable string, safe to filter and group by.
    action: { type: String, required: true, index: true },

    entity: { type: String, default: "" },
    entityId: { type: String, default: "" },

    // One line a human can read without decoding the payload below.
    summary: { type: String, default: "" },

    // Optional before/after snapshots. Kept Mixed on purpose: this is the
    // one place where the shape genuinely varies per action, and nothing
    // ever queries *into* these — they're read back whole, for display.
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },

    ip: { type: String, default: "" },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

// The read pattern is always "this workspace, newest first", optionally
// narrowed to one app or one record.
auditLogSchema.index({ companyId: 1, at: -1 });
auditLogSchema.index({ companyId: 1, app: 1, at: -1 });
auditLogSchema.index({ companyId: 1, entity: 1, entityId: 1, at: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
