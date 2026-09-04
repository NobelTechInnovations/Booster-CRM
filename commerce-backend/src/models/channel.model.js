import mongoose from "mongoose";

const channelSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    // "sales" = Shopify, Amazon, WooCommerce etc.
    // "shipping" = Velocity, Shiprocket, Shipmozo etc.
    // "ads" = Meta Ads etc.
    // "social" = Instagram/Facebook Page performance + comment replies.
    // "whatsapp" = WhatsApp Business API (Cloud API) — each company connects
    // its own WhatsApp Business Account, so this is per-company like every
    // other channel here, not a single app-wide number.
    // "email" = a company's own SMTP (Gmail app-password, or any other
    // provider) — powers the email automation system (order confirmations,
    // shipped/delivered, refunds, ...), per-company like everything else here.
    channelType: {
      type: String,
      enum: ["sales", "shipping", "ads", "social", "whatsapp", "email"],
      required: true,
      default: "sales",
      index: true,
    },

    provider: {
      type: String,
      enum: [
        // Sales channels
        "shopify", "amazon", "woocommerce", "flipkart", "meesho", "myntra", "ajio", "etsy",
        // Shipping providers
        "velocity", "shiprocket", "shipmozo", "shipway", "ithink", "nimbuspost", "pickrr", "delhivery",
        // Ads / Social / WhatsApp providers (same Meta platform, distinguished by channelType + shop)
        "meta",
        // Email — one generic SMTP provider (host/port/username/password
        // covers Gmail, Outlook, Zoho, or any other mail provider a company
        // already has, no per-provider integration needed).
        "smtp",
      ],
      required: true,
      index: true,
    },

    name: { type: String, required: true },
    shop: { type: String, required: true, lowercase: true, trim: true },

    status: {
      // "inactive" pauses auto-sync (daily sync job + incoming webhooks
      // both already filter on status:"connected") while keeping the
      // access token and any app credentials intact — deliberately
      // different from "disconnected", which clears the token and needs a
      // real reconnect. Toggled via setChannelActive (channel.repo.js).
      type: String,
      enum: ["connected", "disconnected", "reconnect_required", "syncing", "inactive"],
      default: "connected",
      index: true,
    },

    scopes: [{ type: String }],

    credentials: {
      accessToken:    { type: String, select: false },
      // Page-scoped token from /me/accounts, distinct from the user-level
      // accessToken above — Meta's "new Pages experience" rejects Page and
      // Instagram media/insights/comments/reply calls made with a user
      // token (error_subcode 2069032), so social.service.js's Graph calls
      // use this one instead. Only ever set on the "social" channel type.
      pageAccessToken: { type: String, select: false },
      refreshToken:   { type: String, select: false },
      username:       { type: String, select: false },
      password:       { type: String, select: false },
      token:          { type: String, select: false },
      tokenExpiresAt: { type: Date,   select: false },
      apiKey:         { type: String, select: false },
      apiSecret:      { type: String, select: false },
      longLivedTokenExpiresAt: { type: Date, select: false },
      // SMTP (channelType: "email") — username/password above are reused
      // as-is (SMTP auth username + app-password/password).
      host:           { type: String, select: false },
      port:           { type: Number, select: false },
      secure:         { type: Boolean, select: false }, // true = TLS on connect (port 465), false = STARTTLS (587)
    },

    external: {
      // Sales channel fields
      shopId:            String,
      sellingPartnerId:  String,
      marketplaceId:     String,
      email:             String,
      domain:            String,
      myshopifyDomain:   String,
      currency:          String,
      timezone:          String,
      // Shipping provider fields
      accountId:         String,
      companyName:       String,
      // Ads provider fields
      adAccountId:       String,
      adAccountName:     String,
      adAccountCurrency: String,
      businessId:        String,
      // Social (Instagram/Facebook Page) fields
      pageId:            String,
      pageName:          String,
      igUserId:          String,
      igUsername:        String,
      // WhatsApp Business API fields — phoneNumberId is what the incoming
      // webhook payload carries (changes[].value.metadata.phone_number_id),
      // so it's how a webhook event gets routed back to the right company.
      phoneNumberId:       String,
      whatsappBusinessAccountId: String,
      whatsappDisplayName: String,
      whatsappPhoneNumber: String,
      // Email (SMTP) fields — the "From" header on every automated email.
      fromEmail: String,
      fromName:  String,
      // Non-secret mirrors of credentials.host/port/secure (which stay
      // select:false since they sit alongside the real password field) —
      // host/port/secure aren't sensitive on their own, and the "Update"
      // connect form needs somewhere to actually read them back from to
      // prefill itself, since a plain channel list never selects credentials.
      host:   String,
      port:   Number,
      secure: Boolean,
    },

    // Sales channel sync state
    sync: {
      products:    { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      orders:      { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      inventory:   { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      customers:   { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      warehouses:  { type: String, enum: ["idle", "queued", "running", "failed"], default: "idle" },
      lastSyncAt:  Date,
      lastError:   String,
    },

    // Sales channel metrics
    metrics: {
      orderCount:    { type: Number, default: 0 },
      salesTotal:    { type: Number, default: 0 },
      productCount:  { type: Number, default: 0 },
      customerCount: { type: Number, default: 0 },
      currency:      String,
      lastOrderName: String,
      lastOrderAt:   Date,
    },

    // Registered Shopify webhooks (to avoid re-registering)
    webhooks: [
      {
        topic:      String,
        webhookId:  String,
        registeredAt: Date,
      },
    ],

    connectedBy:    { type: mongoose.Schema.Types.Mixed },
    disconnectedAt: Date,
  },
  { timestamps: true },
);

channelSchema.index({ companyId: 1, provider: 1, shop: 1 }, { unique: true });
channelSchema.index({ companyId: 1, channelType: 1, status: 1 });
// Cross-tenant lookup by WhatsApp phone_number_id — the incoming webhook
// payload carries this and nothing else identifying, so this is how an
// event gets routed back to the right company (see whatsapp.service.js).
channelSchema.index({ "external.phoneNumberId": 1 }, { sparse: true });

export const Channel = mongoose.model("Channel", channelSchema);
