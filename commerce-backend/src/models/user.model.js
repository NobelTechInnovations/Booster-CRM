import mongoose from "mongoose";

// Despite the name, this is the MEMBERSHIP record: one row per (person,
// workspace) pair, carrying the role that person holds in that workspace.
// It kept its original name on purpose — `User` appears in 181 routes and
// every JWT's `sub` claim is a User._id, so renaming it would have been
// pure churn across the whole codebase for zero behaviour change.
//
// Identity itself now lives on Account (see account.model.js): one row per
// email, owning the password. `passwordHash` below is retained only as the
// pre-migration fallback and for rollback — auth reads Account first and
// only falls back here for rows the account backfill hasn't reached yet.
const userSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, ref: "Company", required: true, index: true },

    // The person this membership belongs to. Nullable during the migration
    // window; every row gets one once scripts/migrate-accounts.js has run.
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", index: true },

    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },

    // Legacy credential. New writes go to Account.passwordHash; this stays
    // so a half-migrated database still logs everyone in, and so the change
    // is reversible without data loss.
    passwordHash: { type: String, select: false },

    // Was a hardcoded enum of seven e-commerce roles (Owner, Admin, Manager,
    // Support, Warehouse, Marketing, Accountant) — which made it impossible
    // for a workspace that isn't a store to have a role that fits it, a
    // coaching centre needing "Centre Head" being the case that forced this.
    // Now a free string, resolved against the workspace's own Role documents
    // (see models/role.model.js), falling back to the legacy built-in map
    // for workspaces that have never defined their own.
    role: { type: String, required: true, default: "Owner", trim: true },

    status: { type: String, enum: ["active", "disabled"], default: "active" },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.index({ companyId: 1, email: 1 }, { unique: true });

export const User = mongoose.model("User", userSchema);
