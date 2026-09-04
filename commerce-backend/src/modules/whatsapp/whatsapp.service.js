import { URLSearchParams } from "node:url";
import { env } from "../../config/env.js";
import { graphFetch, graphFetchAll } from "../../utils/graph-api.js";
import { HttpError } from "../../utils/http-error.js";
import { createOauthState, readOauthState } from "../../utils/oauth-state.js";
import {
  upsertWhatsAppChannel,
  getWhatsAppChannelByPhoneNumberId,
  getChannelForSync,
  listWhatsAppChannels,
} from "../../repositories/channel.repo.js";
import {
  upsertConversation,
  createMessage,
  updateMessageStatus,
  createPendingWhatsAppSignup,
  getPendingWhatsAppSignup,
  deletePendingWhatsAppSignup,
} from "../../repositories/whatsapp.repo.js";
import { getOrderById } from "../../repositories/order.repo.js";
import { getCompany } from "../../repositories/company.repo.js";
import { buildInvoicePdf } from "../../utils/invoice-pdf.js";

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

  const channel = await upsertWhatsAppChannel({
    companyId, userId, phoneNumberId,
    whatsappBusinessAccountId: whatsappBusinessAccountId || "",
    accessToken,
    whatsappDisplayName: details.verified_name || "",
    whatsappPhoneNumber: details.display_phone_number || "",
  });
  if (whatsappBusinessAccountId) {
    await subscribeAppToWaba(accessToken, whatsappBusinessAccountId).catch((err) => {
      console.warn(`[WhatsApp] Could not subscribe app to WABA ${whatsappBusinessAccountId}: ${err.message}`);
    });
  }
  await registerWhatsAppNumber(accessToken, phoneNumberId).catch((err) => {
    console.warn(`[WhatsApp] Could not register phone number ${phoneNumberId}: ${err.message}`);
  });
  return channel;
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

// Meta requires the app to be explicitly registered as a "subscribed app"
// on a WhatsApp Business Account before it's allowed to send messages (or
// receive webhook events) on that WABA's behalf — this is a separate step
// from the OAuth grant itself, and skipping it is exactly what produces
// "(#200) You do not have the necessary permissions to send messages on
// behalf of this WhatsApp Business Account" even though the token has
// whatsapp_business_management/whatsapp_business_messaging scope. Embedded
// Signup's postMessage-based popup flow used to fire this automatically as
// part of its own wizard; the plain redirect this app switched to doesn't,
// so it has to be called explicitly here. Best-effort: a failure here
// shouldn't block the connection itself (receiving still needs the channel
// row to exist), but it's logged loudly since sending will be broken until
// this succeeds — connectFromCandidate/connectWhatsAppChannel below retry
// it on every (re)connect, and fixWhatsAppPermissions lets an already-
// connected company retry it without a full reconnect.
async function subscribeAppToWaba(accessToken, wabaId) {
  if (!wabaId) return;
  await graphFetch(`${GRAPH_BASE()}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// A phone number connected to the Cloud API (rather than set up through
// WhatsApp Manager's own guided UI, which does this step invisibly) also
// has to explicitly complete Cloud API "registration" before it's allowed
// to send/receive at all — a separate step from subscribing the app above,
// and from Meta's own display-name/number review. Skipping it produces
// "(#133010) Account not registered", distinct from the "(#200) necessary
// permissions" subscribe-app error. A random 6-digit PIN is fine here: it
// only sets up WhatsApp's optional two-step verification, which the
// business can view/change any time in WhatsApp Manager → this number →
// Two-step verification — nothing about it needs to be remembered or
// stored by this app.
async function registerWhatsAppNumber(accessToken, phoneNumberId) {
  if (!phoneNumberId) return;
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  await graphFetch(`${GRAPH_BASE()}/${phoneNumberId}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
}

async function connectFromCandidate({ companyId, userId, accessToken, candidate }) {
  const channel = await upsertWhatsAppChannel({
    companyId, userId,
    phoneNumberId: candidate.phoneNumberId,
    whatsappBusinessAccountId: candidate.whatsappBusinessAccountId,
    accessToken,
    whatsappDisplayName: candidate.verifiedName || "",
    whatsappPhoneNumber: candidate.displayPhoneNumber || "",
  });
  await subscribeAppToWaba(accessToken, candidate.whatsappBusinessAccountId).catch((err) => {
    console.warn(`[WhatsApp] Could not subscribe app to WABA ${candidate.whatsappBusinessAccountId}: ${err.message}`);
  });
  // Best-effort, same as above — a number that's already registered
  // errors here (harmlessly; it's already in the state we want), and one
  // that genuinely needs it gets activated automatically instead of
  // failing every send with "(#133010) Account not registered" until
  // someone happens to run Fix permissions.
  await registerWhatsAppNumber(accessToken, candidate.phoneNumberId).catch((err) => {
    console.warn(`[WhatsApp] Could not register phone number ${candidate.phoneNumberId}: ${err.message}`);
  });
  return channel;
}

// Lets a company that's already connected retry the subscribe-app-to-WABA
// and register-phone-number steps above without going through the full
// "Change number" reconnect — covers a connection made before these steps
// existed, or either Meta call failing transiently the first time.
export async function fixWhatsAppPermissions({ companyId }) {
  const [summary] = await listWhatsAppChannels(companyId);
  if (!summary) throw new HttpError(400, "Connect a WhatsApp number first");

  const channel = await getChannelForSync({ channelId: summary._id || summary.id, companyId });
  const accessToken = channel?.credentials?.accessToken;
  const wabaId = channel?.external?.whatsappBusinessAccountId;
  const phoneNumberId = channel?.external?.phoneNumberId;
  if (!accessToken) throw new HttpError(400, "Missing access token for this connection — click Change number and reconnect.");
  if (!wabaId) throw new HttpError(400, "Missing WhatsApp Business Account ID for this connection — click Change number and reconnect.");

  await subscribeAppToWaba(accessToken, wabaId);
  // Best-effort: an already-registered number throws here, which is fine
  // (nothing to fix) — surfaced as a warning (not a failure of the whole
  // action, since the subscribe step above already succeeded) so a
  // genuine registration problem is at least visible instead of silently
  // swallowed.
  let registerWarning;
  await registerWhatsAppNumber(accessToken, phoneNumberId).catch((err) => {
    registerWarning = err.message;
    console.warn(`[WhatsApp] Could not register phone number ${phoneNumberId}: ${err.message}`);
  });
  return { ok: true, registerWarning };
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
// Free-form text/media, which covers every reply sent within WhatsApp's
// 24-hour customer-service window (any conversation the customer themselves
// started, or one still inside that window). Messaging someone who has
// *never* messaged this number before is a different, Meta-enforced case —
// see sendWhatsAppTemplateMessage below.
function guessMediaType(url) {
  const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "image";
  if (["mp4", "3gp"].includes(ext)) return "video";
  if (["mp3", "ogg", "amr", "aac"].includes(ext)) return "audio";
  return "document"; // pdf, docx, xlsx, etc. — WhatsApp's catch-all attachment type
}

export async function sendWhatsAppMessage({ companyId, channelId, to, text, mediaUrl, mediaId, mediaType, sentByUserName }) {
  const channel = await getChannelForSync({ channelId, companyId });
  if (!channel || channel.channelType !== "whatsapp") throw new HttpError(404, "WhatsApp channel not found");
  if (!to) throw new HttpError(400, "Recipient phone number is required");
  const hasMedia = Boolean(mediaId || mediaUrl?.trim());
  if (!text?.trim() && !hasMedia) throw new HttpError(400, "Message text or attachment is required");

  const waId = String(to).replace(/\D/g, "");
  const type = hasMedia ? (mediaType || guessMediaType(mediaUrl || "")) : "text";

  const payload = hasMedia
    ? {
        messaging_product: "whatsapp", to: waId, type,
        [type]: {
          // An uploaded file (mediaId, from POST /media/upload) is preferred
          // — Meta hosts it directly, no external URL needs to stay reachable.
          // mediaUrl (a plain link) is kept as a fallback for anything still
          // using it.
          ...(mediaId ? { id: mediaId } : { link: mediaUrl.trim() }),
          // Only image/video/document support a caption; audio doesn't.
          ...(text?.trim() && type !== "audio" ? { caption: text.trim() } : {}),
          ...(type === "document" && !mediaId ? { filename: mediaUrl.split("/").pop()?.split("?")[0] || "file" } : {}),
        },
      }
    : { messaging_product: "whatsapp", to: waId, type: "text", text: { body: text } };

  const body = await graphFetch(`${GRAPH_BASE()}/${channel.external.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.credentials.accessToken}` },
    body: JSON.stringify(payload),
  });

  const waMessageId = body.messages?.[0]?.id;
  const preview = hasMedia ? (text?.trim() || `[${type}]`) : text;
  const conversation = await upsertConversation({
    companyId, waId, lastMessageAt: new Date(), lastMessagePreview: preview, incrementUnread: false,
  });

  const message = await createMessage({
    companyId,
    conversationId: conversation._id,
    waMessageId,
    direction: "outbound",
    type,
    text: text || "",
    // Same convention inbound media already uses: mediaId (Meta's own,
    // proxied through GET /media/:mediaId) takes priority over a raw link,
    // so the message-thread renderer doesn't need to care about direction.
    mediaUrl: !mediaId && mediaUrl?.trim() ? mediaUrl.trim() : "",
    mediaId: mediaId || "",
    status: "sent",
    timestamp: new Date(),
    sentByUserName: sentByUserName || "",
  });

  return { conversation, message };
}

// ─── Upload (attach a real file, not just a URL) ────────────────────────────
// Uploads straight to Meta's own WhatsApp media store and hands back the
// resulting media id — sendWhatsAppMessage then references that id directly
// (no file ever needs to live on, or be re-hosted by, this app's own
// servers). Mirrors fetchWhatsAppMedia's read side.
export async function uploadWhatsAppMedia({ companyId, fileBuffer, filename, mimeType }) {
  const [summary] = await listWhatsAppChannels(companyId);
  if (!summary) throw new HttpError(400, "Connect a WhatsApp number first");
  const channel = await getChannelForSync({ channelId: summary._id || summary.id, companyId });
  const accessToken = channel?.credentials?.accessToken;
  const phoneNumberId = channel?.external?.phoneNumberId;
  if (!accessToken || !phoneNumberId) throw new HttpError(400, "Missing WhatsApp credentials — click Change number and reconnect.");

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([fileBuffer], { type: mimeType || "application/octet-stream" }), filename || "file");

  const response = await fetch(`${GRAPH_BASE()}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new HttpError(response.status >= 400 ? response.status : 502, body?.error?.message || "Upload to WhatsApp failed", body);
  }

  const category = (mimeType || "").split("/")[0];
  const mediaType = category === "image" || category === "video" || category === "audio" ? category : "document";
  return { mediaId: body.id, mediaType };
}

// ─── Send an order's Tax Invoice as a WhatsApp document ────────────────────
// Builds the same invoice shown in the app's own Tax Invoice modal (see
// invoice-pdf.js) as a real PDF file, uploads it to Meta's media store, and
// sends it as a document attachment to the order's phone number. Uses the
// free-form send path (sendWhatsAppMessage above), so — same platform rule
// noted below — this only works while a 24-hour customer-service window is
// open with that number (i.e. they've messaged the business recently);
// otherwise Meta rejects it and that error surfaces to the caller as-is.
export async function sendOrderInvoiceViaWhatsApp({ companyId, orderId }) {
  const order = await getOrderById({ companyId, orderId });
  if (!order) throw new HttpError(404, "Order not found");
  if (!order.phone) throw new HttpError(400, "This order has no phone number to send to");

  const [company, [channelSummary]] = await Promise.all([
    getCompany(companyId),
    listWhatsAppChannels(companyId),
  ]);
  if (!channelSummary) throw new HttpError(400, "Connect a WhatsApp number first");

  const pdfBuffer = await buildInvoicePdf({ order, company });
  const filename = `${order.name || order.externalId || "invoice"}.pdf`.replace(/^#/, "");
  const { mediaId } = await uploadWhatsAppMedia({ companyId, fileBuffer: pdfBuffer, filename, mimeType: "application/pdf" });

  return sendWhatsAppMessage({
    companyId,
    channelId: channelSummary._id || channelSummary.id,
    to: order.phone,
    text: `Here's your invoice for order ${order.name || ""}`.trim(),
    mediaId,
    mediaType: "document",
  });
}

// ─── Send (message template — for a number that has never messaged first) ──
// WhatsApp only allows free-form text/media (sendWhatsAppMessage above)
// within an open 24-hour customer-service window, i.e. a conversation the
// customer started. Reaching a brand-new number requires a message
// template Meta has approved in advance — this is a platform rule, not
// something this app can route around. Templates are managed in Meta's own
// WhatsApp Manager ("Message templates"); listMessageTemplates below just
// surfaces the already-approved ones so the panel can offer them.
export async function listMessageTemplates({ companyId }) {
  const [summary] = await listWhatsAppChannels(companyId);
  if (!summary) throw new HttpError(400, "Connect a WhatsApp number first");
  const channel = await getChannelForSync({ channelId: summary._id || summary.id, companyId });
  const accessToken = channel?.credentials?.accessToken;
  const wabaId = channel?.external?.whatsappBusinessAccountId;
  if (!accessToken || !wabaId) throw new HttpError(400, "Missing WhatsApp credentials — click Change number and reconnect.");

  const params = new URLSearchParams({ fields: "name,status,category,language,components", access_token: accessToken });
  const rows = await graphFetchAll(`${GRAPH_BASE()}/${wabaId}/message_templates?${params.toString()}`, { maxRows: 200 });
  return rows.filter((t) => t.status === "APPROVED");
}

export async function sendWhatsAppTemplateMessage({ companyId, channelId, to, templateName, language, bodyParams = [] }) {
  const channel = await getChannelForSync({ channelId, companyId });
  if (!channel || channel.channelType !== "whatsapp") throw new HttpError(404, "WhatsApp channel not found");
  if (!to) throw new HttpError(400, "Recipient phone number is required");
  if (!templateName) throw new HttpError(400, "Template name is required");

  const waId = String(to).replace(/\D/g, "");
  const components = bodyParams.length
    ? [{ type: "body", parameters: bodyParams.map((value) => ({ type: "text", text: String(value ?? "") })) }]
    : [];

  const body = await graphFetch(`${GRAPH_BASE()}/${channel.external.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.credentials.accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: waId, type: "template",
      template: { name: templateName, language: { code: language || "en_US" }, ...(components.length ? { components } : {}) },
    }),
  });

  const waMessageId = body.messages?.[0]?.id;
  const conversation = await upsertConversation({
    companyId, waId, lastMessageAt: new Date(), lastMessagePreview: `Template: ${templateName}`, incrementUnread: false,
  });

  const message = await createMessage({
    companyId,
    conversationId: conversation._id,
    waMessageId,
    direction: "outbound",
    type: "template",
    text: `Template: ${templateName}`,
    status: "sent",
    timestamp: new Date(),
  });

  return { conversation, message };
}

// ─── Inbound media ───────────────────────────────────────────────────────────
// Meta's own media URL requires a Bearer token and expires in minutes, so it
// can never be handed straight to the browser — this resolves a stored
// mediaId to actual bytes on demand, every time it's requested, rather than
// trying to cache/re-host the file anywhere.
export async function fetchWhatsAppMedia({ companyId, mediaId }) {
  const [summary] = await listWhatsAppChannels(companyId);
  if (!summary) throw new HttpError(404, "WhatsApp channel not found");
  const channel = await getChannelForSync({ channelId: summary._id || summary.id, companyId });
  const accessToken = channel?.credentials?.accessToken;
  if (!accessToken) throw new HttpError(400, "Missing WhatsApp credentials");

  const meta = await graphFetch(`${GRAPH_BASE()}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const fileResponse = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!fileResponse.ok) throw new HttpError(502, "Could not download this attachment from Meta — it may have expired.");

  return { body: fileResponse.body, contentType: meta.mime_type || fileResponse.headers.get("content-type") || "application/octet-stream" };
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
        // Meta nests media under a key matching the message type itself
        // (msg.image.id, msg.document.id, ...) — msg[msg.type] covers every
        // media type the same way without a type-by-type switch.
        const mediaNode = ["image", "video", "audio", "document", "sticker"].includes(msg.type) ? msg[msg.type] : null;
        const text = msg.text?.body || msg.button?.text || mediaNode?.caption || (msg.type !== "text" ? `[${msg.type}]` : "");
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
          mediaId: mediaNode?.id || "",
          mediaMimeType: mediaNode?.mime_type || "",
          status: "received",
          timestamp,
        });
      }

      for (const status of value.statuses || []) {
        // Meta only ever includes `errors` alongside a "failed" status —
        // this is the one place that information exists at all, so
        // capturing it here is what makes a failed send diagnosable later
        // instead of just the bare word "failed".
        await updateMessageStatus({ companyId, waMessageId: status.id, status: status.status, error: status.errors?.[0] });
      }
    }
  }
}
