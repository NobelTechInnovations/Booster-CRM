import mongoose from "mongoose";

const adInsightSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    channelId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    provider: { type: String, default: "meta", index: true },

    campaignId: { type: String, index: true },
    campaignName: { type: String },
    adSetId: { type: String },
    adSetName: { type: String },
    adId: { type: String, required: true, index: true },
    adName: { type: String },

    date: { type: Date, required: true, index: true },

    spend: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    frequency: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    linkClicks: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
    cpc: { type: Number, default: 0 },
    cpm: { type: Number, default: 0 },
    costPerLinkClick: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },

    // Manual link so a "spend by product" view is possible without Meta DPA/catalog data
    linkedProductTitle: { type: String },

    // Auto-attribution against synced Shopify orders (UTM match)
    attributedRevenue: { type: Number, default: 0 },
    attributedOrders: { type: Number, default: 0 },
    lastAttributedAt: { type: Date },

    raw: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

adInsightSchema.index({ companyId: 1, channelId: 1, adId: 1, date: 1 }, { unique: true });
adInsightSchema.index({ companyId: 1, date: -1 });
adInsightSchema.index({ companyId: 1, campaignId: 1 });

export const AdInsight = mongoose.model("AdInsight", adInsightSchema);
