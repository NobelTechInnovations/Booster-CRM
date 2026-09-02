import { Router } from "express";
import { Readable } from "node:stream";
import { requireAuth, requirePermission, requireAuthHeaderOrQuery } from "../../middleware/auth.js";
import { requireFeature } from "../../middleware/feature-gate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { env } from "../../config/env.js";
import {
  startConnection,
  getConnectionStatus,
  disconnect,
  sendSmartMessage,
  startSmartConversation,
  handleWebhook,
  listSmartConversations,
  getSmartConversation,
  markSmartConversationRead,
  deleteSmartConversation,
  listSmartMessagesForConversation,
  fetchSmartMedia,
} from "./smart-whatsapp.service.js";

export const smartWhatsappRoutes = Router();

// ─── Connect / status ────────────────────────────────────────────────────────

smartWhatsappRoutes.post(
  "/connect",
  requireAuth,
  requireFeature("smart_whatsapp"),
  requirePermission("whatsapp:manage"),
  asyncHandler(async (req, res) => {
    const status = await startConnection({ companyId: req.auth.companyId });
    res.json(status);
  }),
);

smartWhatsappRoutes.get(
  "/status",
  requireAuth,
  requireFeature("smart_whatsapp"),
  asyncHandler(async (req, res) => {
    const status = await getConnectionStatus({ companyId: req.auth.companyId });
    res.json(status);
  }),
);

smartWhatsappRoutes.post(
  "/disconnect",
  requireAuth,
  requireFeature("smart_whatsapp"),
  requirePermission("whatsapp:manage"),
  asyncHandler(async (req, res) => {
    const result = await disconnect({ companyId: req.auth.companyId });
    res.json(result);
  }),
);

// ─── Webhook — pushed to by the smart-whatsapp service, not a browser ──────
// Authenticated with the same shared secret the service itself requires on
// its own routes (see smart-whatsapp-service/src/routes.js) — there's no
// per-user identity on this side of the bridge, just this one service.

smartWhatsappRoutes.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    if (req.headers["x-smart-whatsapp-secret"] !== env.smartWhatsapp.sharedSecret) {
      throw new HttpError(401, "Invalid shared secret");
    }
    await handleWebhook(req.body);
    res.json({ ok: true });
  }),
);

// ─── Conversations / messages ────────────────────────────────────────────────

smartWhatsappRoutes.get(
  "/conversations",
  requireAuth,
  requireFeature("smart_whatsapp"),
  asyncHandler(async (req, res) => {
    const conversations = await listSmartConversations({ companyId: req.auth.companyId });
    res.json({ conversations });
  }),
);

smartWhatsappRoutes.delete(
  "/conversations/:id",
  requireAuth,
  requireFeature("smart_whatsapp"),
  requirePermission("whatsapp:manage"),
  asyncHandler(async (req, res) => {
    const conversation = await deleteSmartConversation({ companyId: req.auth.companyId, conversationId: req.params.id });
    if (!conversation) throw new HttpError(404, "Conversation not found");
    res.json({ ok: true });
  }),
);

smartWhatsappRoutes.post(
  "/conversations/start",
  requireAuth,
  requireFeature("smart_whatsapp"),
  requirePermission("whatsapp:manage"),
  asyncHandler(async (req, res) => {
    const to = String(req.body?.to || "").trim();
    if (!to) throw new HttpError(400, "Recipient phone number is required");
    const result = await startSmartConversation({
      companyId: req.auth.companyId,
      to,
      text: req.body?.text,
      mediaUrl: req.body?.mediaUrl,
      mediaType: req.body?.mediaType,
      sentByUserName: req.auth.displayName || req.auth.email || "",
    });
    res.json(result);
  }),
);

smartWhatsappRoutes.get(
  "/conversations/:id/messages",
  requireAuth,
  requireFeature("smart_whatsapp"),
  asyncHandler(async (req, res) => {
    const conversation = await getSmartConversation({ companyId: req.auth.companyId, conversationId: req.params.id });
    if (!conversation) throw new HttpError(404, "Conversation not found");
    const messages = await listSmartMessagesForConversation({ companyId: req.auth.companyId, conversationId: req.params.id });
    await markSmartConversationRead({ companyId: req.auth.companyId, conversationId: req.params.id });
    res.json({ conversation, messages });
  }),
);

smartWhatsappRoutes.post(
  "/conversations/:id/messages",
  requireAuth,
  requireFeature("smart_whatsapp"),
  requirePermission("whatsapp:manage"),
  asyncHandler(async (req, res) => {
    const conversation = await getSmartConversation({ companyId: req.auth.companyId, conversationId: req.params.id });
    if (!conversation) throw new HttpError(404, "Conversation not found");
    const result = await sendSmartMessage({
      companyId: req.auth.companyId,
      conversationId: req.params.id,
      to: conversation.waId,
      // Reply on the exact same JID domain the conversation's messages
      // actually arrived on — see smart-whatsapp-service's session-manager
      // .js (jidServerOf) for why this can't just default to a phone number.
      jidServer: conversation.jidServer,
      text: req.body?.text,
      mediaUrl: req.body?.mediaUrl,
      mediaType: req.body?.mediaType,
      sentByUserName: req.auth.displayName || req.auth.email || "",
    });
    res.json(result);
  }),
);

// ─── Media proxy ─────────────────────────────────────────────────────────────
// requireAuthHeaderOrQuery (not requireAuth) because a plain <img>/<video>
// tag can't attach an Authorization header — same as the Cloud API's own
// media proxy route.

smartWhatsappRoutes.get(
  "/media/:messageId",
  requireAuthHeaderOrQuery,
  requireFeature("smart_whatsapp"),
  asyncHandler(async (req, res) => {
    const { body, contentType } = await fetchSmartMedia({ companyId: req.auth.companyId, messageId: req.params.messageId });
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    Readable.fromWeb(body).pipe(res);
  }),
);
