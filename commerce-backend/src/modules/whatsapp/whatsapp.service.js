import { env } from "../../config/env.js";
import { graphFetch } from "../../utils/graph-api.js";
import { HttpError } from "../../utils/http-error.js";
import {
  upsertWhatsAppChannel,
  getWhatsAppChannelByPhoneNumberId,
  getChannelForSync,
} from "../../repositories/channel.repo.js";
import {
  upsertConversation,
  createMessage,
  updateMessageStatus,
} from "../../repositories/whatsapp.repo.js";

const GRAPH_BASE = () => `https://graph.facebook.com/${env.whatsapp.apiVersion}`;

// ─── Connect (credential entry, not OAuth) ─────────────────────────────────
// WhatsApp Cloud API has no simple end-user OAuth consent screen for
// provisioning a business phone number the way Ads/Social do — the company
// admin gets their Phone Number ID + a permanent System User access token
// directly from their own WhatsApp Business Account in Meta Business
// Manager and pastes them in here. This is per-company, matching every
// other channel connection in this app — not the single app-wide number a
// naive env-var-only design would produce.
export async function connectWhatsAppChannel({ companyId, userId, phoneNumberId, whatsappBusinessAccountId, accessToken }) {
  if (!phoneNumberId?.trim() || !accessToken?.trim()) {
    throw new HttpError(400, "Phone Number ID and Access Token are required");
  }

  // Verify the credentials actually work, and pull the display name/number
  // Meta has on file, before saving — a channel row backed by a typo'd
  // token would otherwise silently fail on the first real send.
  const params = new URLSearchParams({ fields: "verified_name,display_phone_number", access_token: accessToken });
  const details = await graphFetch(`${GRAPH_BASE()}/${phoneNumberId}?${params.toString()}`).catch((err) => {
    throw new HttpError(400, `Could not verify these WhatsApp credentials: ${err.message}`);
  });

  return upsertWhatsAppChannel({
    companyId, userId, phoneNumberId,
    whatsappBusinessAccountId: whatsappBusinessAccountId || "",
    accessToken,
    whatsappDisplayName: details.verified_name || "",
    whatsappPhoneNumber: details.display_phone_number || "",
  });
}

// ─── Connect (WhatsApp Embedded Signup — the "Continue with Facebook" flow) ─
// Same end result as connectWhatsAppChannel above, but the company admin
// never sees a Phone Number ID or an access token — they log in with
// Facebook, Meta walks them through picking/creating a WhatsApp Business
// Account and phone number in its own popup, and hands back an
// authorization code plus the phone_number_id/waba_id it just set up. This
// is the standard replacement for manually hunting down a System User
// token in Business Manager, which is genuinely not something a non-
// technical shop owner can be expected to do.
//
// The code is exchanged the same two-step way Social's OAuth does
// (exchangeCodeForToken -> fb_exchange_token), reusing env.meta.appId/
// appSecret since Embedded Signup runs through the same Meta App as the
// Social OAuth flow. The result is a long-lived (~60 day) token, not a
// literal forever token the way a manually-generated System User token
// can be — there's no way to mint a true permanent token from this flow
// without the company also completing Business Manager's own System User
// setup, which is exactly the friction this flow exists to avoid. In
// practice that means: it works immediately with zero manual steps, and if
// a connection ever goes stale after ~60 days, reconnecting is the same
// one-click "Connect WhatsApp" flow, not a return trip to Business Manager.
export async function completeEmbeddedSignup({ companyId, userId, code, phoneNumberId, whatsappBusinessAccountId }) {
  if (!code?.trim()) throw new HttpError(400, "Missing authorization code from Meta");
  if (!phoneNumberId?.trim()) {
    throw new HttpError(400, "Meta didn't hand back a phone number — the signup popup may have been closed before finishing.");
  }
  if (!env.meta.appId || !env.meta.appSecret) {
    throw new HttpError(500, "Meta app credentials are not configured. Add META_APP_ID and META_APP_SECRET, then restart the backend.");
  }

  const shortLivedParams = new URLSearchParams({ client_id: env.meta.appId, client_secret: env.meta.appSecret, code });
  const shortLived = await graphFetch(`${GRAPH_BASE()}/oauth/access_token?${shortLivedParams.toString()}`).catch((err) => {
    throw new HttpError(400, `Could not complete WhatsApp signup with Meta: ${err.message}`);
  });

  const longLivedParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: env.meta.appId,
    client_secret: env.meta.appSecret,
    fb_exchange_token: shortLived.access_token,
  });
  const longLived = await graphFetch(`${GRAPH_BASE()}/oauth/access_token?${longLivedParams.toString()}`).catch(() => shortLived);
  const accessToken = longLived.access_token || shortLived.access_token;

  const detailParams = new URLSearchParams({ fields: "verified_name,display_phone_number", access_token: accessToken });
  const details = await graphFetch(`${GRAPH_BASE()}/${phoneNumberId}?${detailParams.toString()}`).catch(() => ({}));

  return upsertWhatsAppChannel({
    companyId, userId, phoneNumberId,
    whatsappBusinessAccountId: whatsappBusinessAccountId || "",
    accessToken,
    whatsappDisplayName: details.verified_name || "",
    whatsappPhoneNumber: details.display_phone_number || "",
  });
}

// ─── Send ────────────────────────────────────────────────────────────────────
// MVP scope: free-form text only, which covers every reply sent within
// WhatsApp's 24-hour customer-service window (any conversation the customer
// themselves started). Proactive/outside-window sends need a pre-approved
// message template — a distinct Meta feature, intentionally not built here.
export async function sendWhatsAppMessage({ companyId, channelId, to, text, sentByUserName }) {
  const channel = await getChannelForSync({ channelId, companyId });
  if (!channel || channel.channelType !== "whatsapp") throw new HttpError(404, "WhatsApp channel not found");
  if (!to) throw new HttpError(400, "Recipient phone number is required");
  if (!text?.trim()) throw new HttpError(400, "Message text is required");

  const waId = String(to).replace(/\D/g, "");

  const body = await graphFetch(`${GRAPH_BASE()}/${channel.external.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.credentials.accessToken}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to: waId, type: "text", text: { body: text } }),
  });

  const waMessageId = body.messages?.[0]?.id;
  const conversation = await upsertConversation({
    companyId, waId, lastMessageAt: new Date(), lastMessagePreview: text, incrementUnread: false,
  });

  const message = await createMessage({
    companyId,
    conversationId: conversation._id,
    waMessageId,
    direction: "outbound",
    type: "text",
    text,
    status: "sent",
    timestamp: new Date(),
    sentByUserName: sentByUserName || "",
  });

  return { conversation, message };
}

// ─── Receive (webhook) ───────────────────────────────────────────────────────

// Resolves companyId purely from the payload's own phone_number_id — no
// static single-tenant assumption. Every connected company's WABA can
// receive on the same shared webhook URL (Meta only supports one webhook
// URL + verify token per Meta App, which is app-level config, not
// per-company), and each event is routed to the right company by matching
// this field against that company's own Channel.external.phoneNumberId.
export async function handleIncomingWebhook(payload) {
  const entries = payload?.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const channel = await getWhatsAppChannelByPhoneNumberId(phoneNumberId);
      if (!channel) {
        console.warn(`[WhatsApp webhook] event for phone_number_id ${phoneNumberId} — no connected channel matches, dropped`);
        continue;
      }
      const companyId = channel.companyId;

      for (const msg of value.messages || []) {
        const waId = msg.from;
        const text = msg.text?.body || msg.button?.text || (msg.type !== "text" ? `[${msg.type}]` : "");
        const profileName = (value.contacts || []).find((c) => c.wa_id === waId)?.profile?.name || "";
        const timestamp = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();

        const conversation = await upsertConversation({
          companyId, waId, customerName: profileName, lastMessageAt: timestamp, lastMessagePreview: text, incrementUnread: true,
        });

        await createMessage({
          companyId,
          conversationId: conversation._id,
          waMessageId: msg.id,
          direction: "inbound",
          type: msg.type || "text",
          text,
          status: "received",
          timestamp,
        });
      }

      for (const status of value.statuses || []) {
        await updateMessageStatus({ companyId, waMessageId: status.id, status: status.status });
      }
    }
  }
}
