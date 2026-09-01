import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { env } from "../../config/env.js";
import { verifyWebhookSignature } from "../webhooks/webhook.service.js";
import { listWhatsAppChannels, deleteWhatsAppChannel } from "../../repositories/channel.repo.js";
import { listConversations, getConversation, listMessagesForConversation, markConversationRead } from "../../repositories/whatsapp.repo.js";
import {
  connectWhatsAppChannel,
  buildWhatsAppSignupAuthorizeUrl,
  completeWhatsAppSignupRedirect,
  sendWhatsAppMessage,
  handleIncomingWebhook,
} from "./whatsapp.service.js";

export const whatsappRoutes = Router();

// ─── Connect (credential entry) ─────────────────────────────────────────────

whatsappRoutes.post(
  "/connect",
  requireAuth,
  requirePermission("whatsapp:manage"),
  asyncHandler(async (req, res) => {
    const channel = await connectWhatsAppChannel({
      companyId: req.auth.companyId,
      userId: req.auth.sub,
      phoneNumberId: req.body?.phoneNumberId,
      whatsappBusinessAccountId: req.body?.whatsappBusinessAccountId,
      accessToken: req.body?.accessToken,
    });
    res.json({ channel });
  }),
);

// ─── Connect (WhatsApp Embedded Signup — "Continue with Facebook") ─────────
// The easy path: a full-page redirect through Meta's own WhatsApp signup
// (login -> pick/create a WhatsApp Business Account and number -> confirm),
// the same mechanism Social's connect flow already uses reliably — no
// manual token/ID entry, and none of the JS-SDK-popup flakiness (FedCM
// interference, Chrome's popup blocker) that flow ran into in practice.
whatsappRoutes.post(
  "/meta/connect",
  requireAuth,
  requirePermission("whatsapp:manage"),
  asyncHandler(async (req, res) => {
    const installUrl = buildWhatsAppSignupAuthorizeUrl({ companyId: req.auth.companyId, userId: req.auth.sub });
    res.json({ provider: "meta", installUrl });
  }),
);

whatsappRoutes.get(
  "/meta/callback",
  asyncHandler(async (req, res) => {
    // Full-page browser redirect from Meta, not a fetch() call — same
    // convention as social.routes.js's callback: always redirect back into
    // the panel carrying either the connected channel id or a readable
    // error, never leave the user staring at a raw JSON response.
    try {
      const { channel } = await completeWhatsAppSignupRedirect(req.query);
      res.redirect(`${env.frontendUrl}/panel/whatsapp?provider=meta&status=connected&channelId=${channel._id || channel.id}`);
    } catch (error) {
      res.redirect(`${env.frontendUrl}/panel/whatsapp?provider=meta&status=error&message=${encodeURIComponent(error.message)}`);
    }
  }),
);

whatsappRoutes.get(
  "/channels",
  requireAuth,
  asyncHandler(async (req, res) => {
    const channels = await listWhatsAppChannels(req.auth.companyId);
    res.json({ channels });
  }),
);

// Fully removes the connection — lets a company disconnect this number and
// connect a different one (connectWhatsAppChannel upserts on
// {companyId, provider, shop:"whatsapp"}, i.e. there's only ever one
// WhatsApp channel row per company, so "change number" is: delete this
// one, then connect fresh with the new Phone Number ID + token).
whatsappRoutes.delete(
  "/channels/:channelId",
  requireAuth,
  requirePermission("whatsapp:manage"),
  asyncHandler(async (req, res) => {
    const channel = await deleteWhatsAppChannel({ channelId: req.params.channelId, companyId: req.auth.companyId });
    if (!channel) throw new HttpError(404, "WhatsApp channel not found");
    res.json({ ok: true });
  }),
);

// ─── Meta webhook — public, no auth possible (Meta calls this directly) ────
// One shared webhook URL + verify token for every connected company (Meta
// only supports one webhook URL per Meta App — that's app-level config,
// not per-company) — handleIncomingWebhook resolves which company each
// event belongs to from the payload's own phone_number_id, matched against
// that company's Channel.external.phoneNumberId. See whatsapp.service.js.

whatsappRoutes.get(
  "/webhook",
  (req, res) => {
    // The verification handshake Meta requires before it will ever POST a
    // real event here — nothing like this existed anywhere in the codebase
    // before this route. Must echo hub.challenge back as plain text, not
    // JSON, or Meta treats verification as failed.
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token && env.whatsapp.webhookVerifyToken && token === env.whatsapp.webhookVerifyToken) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send("Verification failed");
    }
  },
);

whatsappRoutes.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    // Advisory, not blocking — matches this codebase's existing webhook
    // convention (webhook-inbox.routes.js never rejects on a failed/missing
    // signature either, since malformed verification setup is a far more
    // common failure than an actual forged payload) but it's logged so a
    // real problem is visible.
    const { verified } = verifyWebhookSignature({
      secret: env.whatsapp.appSecret,
      rawBody: req.rawBody || JSON.stringify(req.body || {}),
      headers: req.headers,
    });
    if (!verified) console.warn("[WhatsApp webhook] signature did not verify — processing anyway, but check WHATSAPP_APP_SECRET");

    await handleIncomingWebhook(req.body);

    // Meta retries aggressively on anything but a fast 200 — always ack.
    res.status(200).json({ status: "received" });
  }),
);

// ─── Authenticated conversation/message routes ──────────────────────────────

whatsappRoutes.get(
  "/conversations",
  requireAuth,
  asyncHandler(async (req, res) => {
    const conversations = await listConversations({ companyId: req.auth.companyId });
    res.json({ conversations });
  }),
);

// Start a brand-new conversation with a phone number that has never messaged
// in (no existing WhatsAppConversation row to look up an id from) — the
// "/conversations/:id/messages" route below requires one to already exist,
// which is exactly the gap this closes: sending the *first* outbound
// message to a customer. sendWhatsAppMessage's upsertConversation call
// already creates the conversation row on demand, so this is otherwise
// identical to a reply, just keyed by phone number instead of conversation id.
whatsappRoutes.post(
  "/conversations/start",
  requireAuth,
  requirePermission("whatsapp:manage"),
  asyncHandler(async (req, res) => {
    const to = String(req.body?.to || "").trim();
    if (!to) throw new HttpError(400, "Recipient phone number is required");

    const [channel] = await listWhatsAppChannels(req.auth.companyId);
    if (!channel) throw new HttpError(400, "Connect a WhatsApp number first");

    const result = await sendWhatsAppMessage({
      companyId: req.auth.companyId,
      channelId: channel._id || channel.id,
      to,
      text: req.body?.text,
      sentByUserName: req.auth.displayName || req.auth.email || "",
    });
    res.json(result);
  }),
);

whatsappRoutes.get(
  "/conversations/:id/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    const conversation = await getConversation({ companyId: req.auth.companyId, conversationId: req.params.id });
    if (!conversation) throw new HttpError(404, "Conversation not found");
    const messages = await listMessagesForConversation({ companyId: req.auth.companyId, conversationId: req.params.id });
    await markConversationRead({ companyId: req.auth.companyId, conversationId: req.params.id });
    res.json({ conversation, messages });
  }),
);

whatsappRoutes.post(
  "/conversations/:id/messages",
  requireAuth,
  requirePermission("whatsapp:manage"),
  asyncHandler(async (req, res) => {
    const conversation = await getConversation({ companyId: req.auth.companyId, conversationId: req.params.id });
    if (!conversation) throw new HttpError(404, "Conversation not found");

    // A company has (in practice) exactly one connected WhatsApp channel —
    // same "first channel of this type" convention ads.routes.js already
    // uses for resolveAdAccountScope.
    const [channel] = await listWhatsAppChannels(req.auth.companyId);
    if (!channel) throw new HttpError(400, "Connect a WhatsApp number first");

    const result = await sendWhatsAppMessage({
      companyId: req.auth.companyId,
      channelId: channel._id || channel.id,
      to: conversation.waId,
      text: req.body?.text,
      sentByUserName: req.auth.displayName || req.auth.email || "",
    });
    res.json(result);
  }),
);
