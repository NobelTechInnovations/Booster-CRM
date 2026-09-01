import { URLSearchParams } from "node:url";
import { env } from "../../config/env.js";
import { graphFetch, graphFetchAll } from "../../utils/graph-api.js";
import { HttpError } from "../../utils/http-error.js";
import { createOauthState, readOauthState } from "../../utils/oauth-state.js";
import {
  upsertWhatsAppChannel,
  getWhatsAppChannelByPhoneNumberId,
  getChannelForSync,
} from "../../repositories/channel.repo.js";
import {
  upsertConversation,
  createMessage,
  updateMessageStatus,
  createPendingWhatsAppSignup,
  getPendingWhatsAppSignup,
  deletePendingWhatsAppSignup,
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
// Full-page redirect, not the JS SDK popup Embedded Signup normally uses —
// switched after the popup proved unreliable in practice: Chrome's newer
// FedCM identity flow (which Meta's SDK tries before falling back to a
// classic popup) kept either getting blocked outright or flashing open and
// closing within about a second, and a stray bug on top of that (passing
// an async function where the SDK's own internal call expected a plain
// one — "Expression is of type asyncfunction, not function") made it worse
// still. A plain OAuth redirect has none of that: it's the exact same
// mechanism Social's connect flow already uses reliably in production.
//
// The one thing the popup flow got "for free" that a redirect doesn't is
// Meta pushing back the exact phone_number_id/waba_id it just set up via
// postMessage mid-flow. Redirect-only code exchange doesn't carry that, so
// it's recovered here instead: debug_token on the resulting access token
// exposes exactly which WhatsApp Business Account(s) the
// whatsapp_business_management grant covers (its granular_scopes.target_ids),
// then each of those WABAs' phone numbers is listed directly. If there's
// more than one number across every granted WABA, the first is connected
// and the company can switch via the existing "Change number" control —
// simpler than building a second, separate in-app picker UI for what
// should be a rare case (most companies have exactly one).
function redirectUri() {
  return `${env.meta.appUrl}/api/whatsapp/meta/callback`;
}

function requireMetaConfig() {
  if (!env.meta.appId || !env.meta.appSecret) {
    throw new HttpError(
      500,
      "Meta app credentials are not configured. Add META_APP_ID and META_APP_SECRET in commerce-backend/.env, then restart the backend.",
    );
  }
}

export function buildWhatsAppSignupAuthorizeUrl({ companyId, userId }) {
  requireMetaConfig();

  const state = createOauthState({ companyId, userId });
  const params = new URLSearchParams({
    client_id: env.meta.appId,
    redirect_uri: redirectUri(),
    state,
    config_id: env.meta.whatsappSignupConfigId,
    response_type: "code",
  });

  return `https://www.facebook.com/${env.meta.apiVersion}/dialog/oauth?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    client_id: env.meta.appId,
    client_secret: env.meta.appSecret,
    redirect_uri: redirectUri(),
    code,
  });
  return graphFetch(`${GRAPH_BASE()}/oauth/access_token?${params.toString()}`);
}

async function exchangeForLongLivedToken(shortLivedToken) {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: env.meta.appId,
    client_secret: env.meta.appSecret,
    fb_exchange_token: shortLivedToken,
  });
  return graphFetch(`${GRAPH_BASE()}/oauth/access_token?${params.toString()}`);
}

// Reads back which WhatsApp Business Account(s) this specific grant
// actually covers, straight from the token itself — no need for the
// popup's postMessage session info. debug_token's granular_scopes is the
// fast path when Meta populates it, but in practice (a plain OAuth
// redirect, rather than the JS SDK's guided Embedded Signup wizard, has no
// interactive "pick a WABA" step) it can come back empty even though the
// user genuinely does have a usable WhatsApp Business Account — so this
// falls back to directly walking businesses the token can see
// (/me/businesses -> owned_whatsapp_business_accounts) rather than
// trusting scope metadata alone.
async function findGrantedWabaIds(accessToken) {
  const debugParams = new URLSearchParams({ input_token: accessToken, access_token: `${env.meta.appId}|${env.meta.appSecret}` });
  const debugBody = await graphFetch(`${GRAPH_BASE()}/debug_token?${debugParams.toString()}`).catch(() => ({}));
  const scopes = debugBody?.data?.granular_scopes || [];
  const fromScopes = scopes.find((s) => s.scope === "whatsapp_business_management")?.target_ids || [];
  if (fromScopes.length) return fromScopes;

  const businessParams = new URLSearchParams({ fields: "id,name", access_token: accessToken });
  const businesses = await graphFetchAll(`${GRAPH_BASE()}/me/businesses?${businessParams.toString()}`, { maxRows: 25 }).catch(() => []);

  const wabaIds = [];
  for (const business of businesses) {
    const wabaParams = new URLSearchParams({ fields: "id", access_token: accessToken });
    const wabas = await graphFetchAll(`${GRAPH_BASE()}/${business.id}/owned_whatsapp_business_accounts?${wabaParams.toString()}`, { maxRows: 25 }).catch(() => []);
    wabaIds.push(...wabas.map((w) => w.id));
  }
  return wabaIds;
}

// Collects every phone number across every granted WABA, not just the
// first — so the caller can show a real picker (with the WABA's own name
// alongside each number, for "which one is which" clarity) whenever a
// company has more than one, instead of silently guessing.
async function findAllPhoneNumbers(accessToken, wabaIds) {
  const candidates = [];
  for (const wabaId of wabaIds) {
    const wabaParams = new URLSearchParams({ fields: "name", access_token: accessToken });
    const waba = await graphFetch(`${GRAPH_BASE()}/${wabaId}?${wabaParams.toString()}`).catch(() => ({}));

    const numberParams = new URLSearchParams({ fields: "id,display_phone_number,verified_name", access_token: accessToken });
    const numbers = await graphFetchAll(`${GRAPH_BASE()}/${wabaId}/phone_numbers?${numberParams.toString()}`, { maxRows: 25 }).catch(() => []);
    for (const number of numbers) {
      candidates.push({
        phoneNumberId: number.id,
        whatsappBusinessAccountId: wabaId,
        displayPhoneNumber: number.display_phone_number || "",
        verifiedName: number.verified_name || waba.name || "",
      });
    }
  }
  return candidates;
}

async function connectFromCandidate({ companyId, userId, accessToken, candidate }) {
  return upsertWhatsAppChannel({
    companyId, userId,
    phoneNumberId: candidate.phoneNumberId,
    whatsappBusinessAccountId: candidate.whatsappBusinessAccountId,
    accessToken,
    whatsappDisplayName: candidate.verifiedName || "",
    whatsappPhoneNumber: candidate.displayPhoneNumber || "",
  });
}

export async function completeWhatsAppSignupRedirect(query) {
  requireMetaConfig();

  const { code, error, error_description: errorDescription } = query || {};
  if (error) throw new HttpError(400, errorDescription || `Meta authorization failed: ${error}`);
  if (!code) throw new HttpError(400, "Missing Meta authorization code");

  const { companyId, userId } = readOauthState(query.state);

  const shortLived = await exchangeCodeForToken(code);
  const longLived = await exchangeForLongLivedToken(shortLived.access_token).catch(() => shortLived);
  const accessToken = longLived.access_token || shortLived.access_token;

  const wabaIds = await findGrantedWabaIds(accessToken);
  if (!wabaIds.length) {
    throw new HttpError(400, "Meta didn't grant access to any WhatsApp Business Account — make sure you picked or created one during signup.");
  }

  const candidates = await findAllPhoneNumbers(accessToken, wabaIds);
  if (!candidates.length) {
    throw new HttpError(400, "No phone number was found on the WhatsApp Business Account you connected — add one in Meta first, then try again.");
  }

  // More than one number across every granted WABA — hand back a picker
  // instead of silently guessing which one the company actually wants.
  // The access token is kept server-side (never in the redirect URL) via
  // a short-lived pending-signup row; only the opaque selectionToken
  // travels through the browser.
  if (candidates.length > 1) {
    const selectionToken = await createPendingWhatsAppSignup({ companyId, userId, accessToken, candidates });
    return { needsSelection: true, selectionToken, candidates };
  }

  const channel = await connectFromCandidate({ companyId, userId, accessToken, candidate: candidates[0] });
  return { channel };
}

export async function finalizeWhatsAppSignup({ companyId, userId, selectionToken, phoneNumberId }) {
  const pending = await getPendingWhatsAppSignup({ selectionToken, companyId });
  if (!pending) throw new HttpError(400, "This signup has expired — click Continue with Facebook and try again.");

  const candidate = pending.candidates.find((c) => c.phoneNumberId === phoneNumberId);
  if (!candidate) throw new HttpError(400, "That number wasn't part of the original signup — click Continue with Facebook and try again.");

  const channel = await connectFromCandidate({ companyId, userId, accessToken: pending.accessToken, candidate });
  await deletePendingWhatsAppSignup(selectionToken);
  return { channel };
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
