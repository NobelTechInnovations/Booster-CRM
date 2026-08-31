import mongoose from "mongoose";

const socialCommentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    channelId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    // Local SocialPost._id, not the external post id — lets a comment list
    // query join cheaply without re-parsing externalPostId matching logic.
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "SocialPost", required: true, index: true },

    externalCommentId: { type: String, required: true },
    parentCommentId: String, // set when this row is itself a reply-to-a-reply

    fromUsername: String,
    fromId: String,
    text: String,
    postedAt: Date,

    // True for a row created by replyToComment() from this app — lets the
    // thread UI visually separate outbound replies from inbound comments
    // without having to compare fromId against "our own" account id.
    isOwnReply: { type: Boolean, default: false },

    raw: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

socialCommentSchema.index({ companyId: 1, channelId: 1, externalCommentId: 1 }, { unique: true });
socialCommentSchema.index({ postId: 1, postedAt: 1 });

export const SocialComment = mongoose.model("SocialComment", socialCommentSchema);
