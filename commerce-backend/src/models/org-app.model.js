import mongoose from "mongoose";

// One row per (workspace, app) that the workspace has installed.
//
// This is the promotion of an idea that already worked here: plan features.
// `company.subscription.features[]` + requireFeature() has been gating
// Social, Automation and Smart WhatsApp in production for a while, which is
// install/uninstall in everything but name. What it couldn't do is let a
// workspace choose for itself, carry per-app settings, or record who turned
// something on — which is all this adds.
//
// Absence is meaningful: a workspace with NO rows at all is treated as
// having every commerce app installed, matching the "no plan assigned means
// full access" convention utils/feature-gate.js already uses. That's what
// lets this ship without touching a single existing customer.
const orgAppSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },

    // Matches a slug in config/app-registry.js. Not a ref: the catalogue is
    // code, so there is no App collection to point at.
    appSlug: { type: String, required: true, trim: true },

    status: { type: String, enum: ["installed", "suspended"], default: "installed" },

    // Per-app configuration the app itself defines the shape of. Mixed on
    // purpose — nothing queries into it, each app reads its own key back
    // whole.
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },

    installedAt: { type: Date, default: Date.now },
    installedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    uninstalledAt: Date,
  },
  { timestamps: true },
);

orgAppSchema.index({ companyId: 1, appSlug: 1 }, { unique: true });

export const OrgApp = mongoose.model("OrgApp", orgAppSchema);
