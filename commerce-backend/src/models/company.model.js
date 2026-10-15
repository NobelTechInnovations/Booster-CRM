import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    legalName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },
    // The brand logo — stored as a data: URI (base64-encoded image), not a
    // link to external storage, since this project has no S3/Cloudinary
    // account configured and the backend's own filesystem is ephemeral on
    // Vercel. A data URI works as-is everywhere a URL would (<img src>,
    // fetched and decoded for the invoice PDF), so no separate file host is
    // needed. Kept small (see updateCompanyLogo's size cap) since it lives
    // directly on every read of this document. Empty string = no logo set.
    logoUrl: { type: String, default: "" },
    businessType: {
      type: String,
      enum: ["Proprietorship", "Partnership", "LLP", "Private Limited", "Public Limited", "Other", ""],
      default: "",
    },
    gstin: { type: String, trim: true, uppercase: true },
    pan: { type: String, trim: true, uppercase: true },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: "India" },
    },
    kyc: {
      status: { type: String, enum: ["not_started", "draft", "submitted", "verified", "rejected"], default: "not_started" },
      gstin: String,
      pan: String,
      legalName: String,
      registeredAddress: String,
      bankAccountName: String,
      bankAccountNumber: String,
      ifsc: String,
      submittedAt: Date,
      verifiedAt: Date,
      rejectionReason: String,
    },
    integrations: {
      amazon: {
        applicationId: String,
        clientId: String,
        clientSecret: { type: String, select: false },
        sellerCentralUrl: { type: String, default: "https://sellercentral.amazon.in" },
        marketplaceId: { type: String, default: "A21TJRUUN4KGV" },
        spApiEndpoint: { type: String, default: "https://sellingpartnerapi-eu.amazon.com" },
        syncDays: { type: Number, default: 30 },
        draftMode: { type: Boolean, default: true },
      },
      // Per-brand Shopify app credentials — lets each company OAuth through
      // their OWN Shopify app (Dev Dashboard, "Custom" distribution) instead
      // of the one shared app in env.shopify.*. Falls back to the shared app
      // when unset, so existing companies (e.g. Sukirti) are unaffected.
      shopify: {
        apiKey: String,
        apiSecret: { type: String, select: false },
      },
    },
    taxSettings: {
      gstRate: { type: Number, default: 5 },        // applicable GST % for invoices/reports
      invoicePrefix: { type: String, default: "INV" },
      invoiceStartNumber: { type: Number, default: 1 },
      placeOfSupply: String,
    },
    notificationSettings: {
      lowStockAlerts: { type: Boolean, default: true },
      newOrderAlerts: { type: Boolean, default: true },
      dailySummaryEmail: { type: Boolean, default: false },
      lowStockThreshold: { type: Number, default: 5 },
    },
    // First-run app selection, the Odoo/Zoho "what are you here to do?" step.
    //
    // `completed` is what tells a brand-new workspace apart from one that
    // predates the app system entirely. That distinction has to be explicit:
    // "this workspace has no app records" used to be read as "give it
    // everything" (so existing customers kept working), which meant a coaching
    // centre signing up was handed Orders and Fulfilment it will never use.
    // Existing workspaces are grandfathered by scripts/migrate-grandfather-apps.js,
    // which writes their real app records and marks them completed — after
    // which an absent record can only mean "hasn't chosen yet".
    onboarding: {
      // No default on purpose: absent means a workspace from before onboarding
      // existed (grandfathered with every commerce app). Only signup writes false.
      completed: { type: Boolean },
      // Which preset they picked (see BUSINESS_TYPES in config/app-registry.js).
      // Kept for reporting and for suggesting apps later — never used to gate
      // anything, since what a workspace can actually open is decided purely
      // by its installed apps.
      businessType: { type: String, default: "" },
      completedAt: Date,
    },

    // Set by a platform admin (app/admin), never by the company itself —
    // absent entirely on every company that existed before this field was
    // added, and companyHasFeature() (utils/feature-gate.js) treats an
    // absent subscription as full access, so nothing changes for any
    // existing company until an admin explicitly assigns one.
    subscription: {
      planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
      planSlug: String,
      // Denormalized from the Plan at assignment time so a feature check
      // never needs an extra Plan lookup — re-copied whenever the
      // subscription is updated.
      features: [String],
      // Same denormalization as `features` — copied from Plan.limits at
      // assignment time (see updateCompanySubscription in
      // platform-admin.repo.js). Enforced by feature-gate.js's
      // getEffectiveLimits()/assertLimitNotExceeded() at the few places
      // that actually create a user/channel; maxOrders is admin-visible
      // only, not enforced anywhere (see feature-gate.js's own note).
      limits: {
        maxUsers: Number,
        maxOrders: Number,
        maxChannels: Number,
        maxShippingChannels: Number,
      },
      status: { type: String, enum: ["trialing", "active", "past_due", "suspended", "cancelled"], default: "trialing" },
      trialEndsAt: Date,
      currentPeriodEnd: Date,
      seats: Number,
      // Admin's own internal notes about this company's billing — not
      // shown to the company itself anywhere.
      notes: String,
      // Set by the daily upgrade-reminder cron job (jobs/upgrade-reminder
      // .job.js) so a trial ending in 3 days doesn't get emailed 3 times —
      // once per calendar day is enough.
      lastUpgradeReminderSentAt: Date,
    },
    // Prepaid balance an admin manually tops up (no payment gateway is
    // wired yet — see feature-gate.js's own note on that) and that usage
    // charges like a plan's perOrderFulfillmentFee are meant to debit
    // against. Every entry is logged (see WalletTransaction model) so the
    // balance is always reconstructable, not just a bare number.
    wallet: {
      balance: { type: Number, default: 0 },
      currency: { type: String, default: "INR" },
    },
  },
  { timestamps: true },
);

export const Company = mongoose.model("Company", companySchema);
