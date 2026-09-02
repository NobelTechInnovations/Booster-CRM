import mongoose from "mongoose";

// A subscription tier a company can be put on — defined and managed by
// platform admins (app/admin/plans), assigned to companies via
// company.subscription.planId. `features` is a free-form list of string
// keys (e.g. "whatsapp", "smart_whatsapp", "automation") an admin types in
// when creating a plan — nothing here hardcodes what those keys mean; that
// mapping only exists once a route actually calls companyHasFeature()
// (see utils/feature-gate.js), which no route does yet.
const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    priceMonthly: { type: Number, default: 0 },
    priceYearly: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    features: [String],
    limits: {
      maxUsers: Number,
      maxOrders: Number,
      maxChannels: Number,
    },
    // Soft-disabled rather than deleted — a plan already assigned to a
    // company must keep resolving correctly even after it's retired from
    // being offered to new/other companies.
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Plan = mongoose.model("Plan", planSchema);
