import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { listSocialChannels, deleteSocialChannel } from "../../repositories/channel.repo.js";
import { listSocialPosts, listCommentsForPost, getSocialPost } from "../../repositories/social.repo.js";
import {
  buildSocialAuthorizeUrl,
  completeSocialConnection,
  syncSocialPosts,
  syncCommentsForPost,
  replyToComment,
} from "./social.service.js";
import { env } from "../../config/env.js";

export const socialRoutes = Router();

// ─── Meta OAuth (Instagram + Facebook) ─────────────────────────────────────

socialRoutes.post(
  "/meta/connect",
  requireAuth,
  requirePermission("social:manage"),
  asyncHandler(async (req, res) => {
    const installUrl = buildSocialAuthorizeUrl({ companyId: req.auth.companyId, userId: req.auth.sub });
    res.json({ provider: "meta", installUrl });
  }),
);

socialRoutes.get(
  "/meta/callback",
  asyncHandler(async (req, res) => {
    // Full-page browser redirect from Meta, not a fetch() call — same
    // convention as ads.routes.js's callback: always redirect back into the
    // panel carrying either the connected channel id or a readable error,
    // never leave the user staring at a raw JSON response.
    try {
      const { channel } = await completeSocialConnection(req.query);
      res.redirect(`${env.frontendUrl}/panel/social?provider=meta&status=connected&channelId=${channel._id || channel.id}`);
    } catch (error) {
      res.redirect(`${env.frontendUrl}/panel/social?provider=meta&status=error&message=${encodeURIComponent(error.message)}`);
    }
  }),
);

socialRoutes.get(
  "/channels",
  requireAuth,
  asyncHandler(async (req, res) => {
    const channels = await listSocialChannels(req.auth.companyId);
    res.json({ channels });
  }),
);

// Fully removes the connection — the way to disconnect this account so a
// company can connect an entirely different Instagram/Facebook account
// (not just a different Page under the one already authorized, which
// "Reconnect" above already covers via Meta's own account switcher).
socialRoutes.delete(
  "/channels/:channelId",
  requireAuth,
  requirePermission("social:manage"),
  asyncHandler(async (req, res) => {
    const channel = await deleteSocialChannel({ channelId: req.params.channelId, companyId: req.auth.companyId });
    if (!channel) throw new HttpError(404, "Social channel not found");
    res.json({ ok: true });
  }),
);

// ─── Posts ───────────────────────────────────────────────────────────────────

socialRoutes.post(
  "/:channelId/sync",
  requireAuth,
  requirePermission("social:manage"),
  asyncHandler(async (req, res) => {
    const result = await syncSocialPosts({ companyId: req.auth.companyId, channelId: req.params.channelId });
    res.json(result);
  }),
);

socialRoutes.get(
  "/:channelId/posts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await listSocialPosts({
      companyId: req.auth.companyId,
      channelId: req.params.channelId,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
    });
    res.json(result);
  }),
);

// ─── Comments ────────────────────────────────────────────────────────────────

socialRoutes.get(
  "/posts/:postId/comments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const post = await getSocialPost({ companyId: req.auth.companyId, postId: req.params.postId });
    if (!post) throw new HttpError(404, "Post not found");

    // Refresh from Meta on every open unless the caller explicitly asks for
    // the cached list only (?refresh=false) — comment threads change often
    // and there's no webhook pushing updates for them yet.
    const comments = req.query.refresh === "false"
      ? await listCommentsForPost({ companyId: req.auth.companyId, postId: post._id })
      : await syncCommentsForPost({ companyId: req.auth.companyId, channelId: post.channelId, postId: post._id });

    res.json({ comments });
  }),
);

socialRoutes.post(
  "/comments/:commentId/reply",
  requireAuth,
  requirePermission("social:manage"),
  asyncHandler(async (req, res) => {
    const result = await replyToComment({
      companyId: req.auth.companyId,
      channelId: req.body?.channelId,
      postId: req.body?.postId,
      commentId: req.params.commentId,
      message: req.body?.message,
    });
    res.json(result);
  }),
);
