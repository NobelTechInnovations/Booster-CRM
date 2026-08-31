import mongoose from "mongoose";
import { isMongoConnected } from "../config/database.js";
import { SocialPost } from "../models/social-post.model.js";
import { SocialComment } from "../models/social-comment.model.js";
import { memory, id, clone, now } from "./memory-store.js";

// Same fix as ad-insight.repo.js's identical helper: companyId/channelId are
// Schema.Types.Mixed, so the same logical id can be saved as either a plain
// string or an ObjectId depending on what the caller passed at write time.
// An exact-match filter on a Mixed field only matches one BSON type, which
// would silently create duplicate rows (or miss existing ones) depending on
// which type happened to be used at write vs read time.
function mixedIdFilter(idValue) {
  const str = String(idValue || "");
  return mongoose.Types.ObjectId.isValid(str) ? { $in: [str, new mongoose.Types.ObjectId(str)] } : str;
}

// ─── Posts ───────────────────────────────────────────────────────────────────

export async function upsertSocialPosts(records) {
  if (!records.length) return [];

  if (isMongoConnected()) {
    await SocialPost.bulkWrite(
      records.map((record) => ({
        updateOne: {
          filter: {
            companyId: mixedIdFilter(record.companyId),
            channelId: mixedIdFilter(record.channelId),
            externalPostId: record.externalPostId,
          },
          update: { $set: record },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return SocialPost.find({
      companyId: mixedIdFilter(records[0].companyId),
      channelId: mixedIdFilter(records[0].channelId),
      externalPostId: { $in: records.map((r) => r.externalPostId) },
    }).lean();
  }

  const saved = [];
  for (const record of records) {
    const key = `${record.companyId}:${record.channelId}:${record.externalPostId}`;
    const existing = memory.socialPosts.get(key);
    const stored = { _id: existing?._id || id(), ...existing, ...record, updatedAt: now(), createdAt: existing?.createdAt || now() };
    memory.socialPosts.set(key, stored);
    saved.push(clone(stored));
  }
  return saved;
}

export async function listSocialPosts({ companyId, channelId, page = 1, limit = 25 }) {
  const skip = (Math.max(1, page) - 1) * limit;

  if (isMongoConnected()) {
    const filter = { companyId: mixedIdFilter(companyId), ...(channelId ? { channelId: mixedIdFilter(channelId) } : {}) };
    const [posts, total] = await Promise.all([
      SocialPost.find(filter).sort({ postedAt: -1 }).skip(skip).limit(limit).lean(),
      SocialPost.countDocuments(filter),
    ]);
    return { posts, total, hasMore: skip + posts.length < total };
  }

  const all = [...memory.socialPosts.values()]
    .filter((p) => String(p.companyId) === String(companyId) && (!channelId || String(p.channelId) === String(channelId)))
    .sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0));
  const posts = all.slice(skip, skip + limit).map(clone);
  return { posts, total: all.length, hasMore: skip + posts.length < all.length };
}

export async function getSocialPost({ companyId, postId }) {
  if (isMongoConnected()) {
    return SocialPost.findOne({ _id: postId, companyId: mixedIdFilter(companyId) }).lean();
  }
  const post = [...memory.socialPosts.values()].find((p) => String(p._id) === String(postId) && String(p.companyId) === String(companyId));
  return post ? clone(post) : null;
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function upsertSocialComments(records) {
  if (!records.length) return [];

  if (isMongoConnected()) {
    await SocialComment.bulkWrite(
      records.map((record) => ({
        updateOne: {
          filter: {
            companyId: mixedIdFilter(record.companyId),
            channelId: mixedIdFilter(record.channelId),
            externalCommentId: record.externalCommentId,
          },
          update: { $set: record },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return SocialComment.find({
      companyId: mixedIdFilter(records[0].companyId),
      channelId: mixedIdFilter(records[0].channelId),
      externalCommentId: { $in: records.map((r) => r.externalCommentId) },
    }).lean();
  }

  const saved = [];
  for (const record of records) {
    const key = `${record.companyId}:${record.channelId}:${record.externalCommentId}`;
    const existing = memory.socialComments.get(key);
    const stored = { _id: existing?._id || id(), ...existing, ...record, updatedAt: now(), createdAt: existing?.createdAt || now() };
    memory.socialComments.set(key, stored);
    saved.push(clone(stored));
  }
  return saved;
}

export async function listCommentsForPost({ companyId, postId }) {
  if (isMongoConnected()) {
    return SocialComment.find({ companyId: mixedIdFilter(companyId), postId }).sort({ postedAt: 1 }).lean();
  }
  return [...memory.socialComments.values()]
    .filter((c) => String(c.companyId) === String(companyId) && String(c.postId) === String(postId))
    .sort((a, b) => new Date(a.postedAt || 0) - new Date(b.postedAt || 0))
    .map(clone);
}
