import mongoose from "mongoose";

// One row per Instagram media item or Facebook Page post. companyId/channelId
// are Mixed (see mixedIdFilter() in social.repo.js) since every other model
// in this codebase stores them that way — the same id can legitimately
// arrive as a string or an ObjectId depending on the write path.
const socialPostSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    channelId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    platform: { type: String, enum: ["instagram", "facebook"], required: true, index: true },

    // Graph API's own post/media id — globally unique per Meta's docs, but
    // scoped to companyId+channelId in the unique index below anyway so a
    // stray cross-tenant collision can never happen even if that ever changes.
    externalPostId: { type: String, required: true },

    pageId: String,
    igUserId: String,

    caption: String,
    mediaType: String, // IMAGE | VIDEO | CAROUSEL_ALBUM | ... (Instagram) or the Page post's type
    mediaUrl: String,
    thumbnailUrl: String,
    permalink: String,
    postedAt: Date,

    insights: {
      reach: { type: Number, default: 0 },
      impressions: { type: Number, default: 0 },
      likeCount: { type: Number, default: 0 },
      commentsCount: { type: Number, default: 0 },
      saved: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
    },

    lastSyncedAt: Date,
    raw: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

socialPostSchema.index({ companyId: 1, channelId: 1, externalPostId: 1 }, { unique: true });
socialPostSchema.index({ companyId: 1, postedAt: -1 });

export const SocialPost = mongoose.model("SocialPost", socialPostSchema);
