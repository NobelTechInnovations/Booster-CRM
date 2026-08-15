import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import {
  listWebhookEndpoints,
  createWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  getEndpointByToken,
  recordWebhookEvent,
  listWebhookEvents,
  getWebhookEvent,
  listWebhookLeads,
  getWebhookLead,
  listEventsForLead,
  addLeadFollowUp,
} from "../../repositories/webhook.repo.js";
import { verifyWebhookSignature, extractEventSummary, extractLeadKey } from "./webhook.service.js";

export const webhookInboxRoutes = Router();

// ─── Management (authenticated, per company) ───────────────────────────────

webhookInboxRoutes.get(
  "/endpoints",
  requireAuth,
  asyncHandler(async (req, res) => {
    const endpoints = await listWebhookEndpoints(req.auth.companyId);
    res.json({ endpoints });
  }),
);

webhookInboxRoutes.post(
  "/endpoints",
  requireAuth,
  requirePermission("channels:manage"),
  asyncHandler(async (req, res) => {
    const result = await createWebhookEndpoint({ companyId: req.auth.companyId, ...(req.body || {}) });
    if (result.error) throw new HttpError(400, result.error);

    const inboundUrl = `${req.protocol}://${req.get("host")}/api/webhooks/inbound/${result.endpoint.token}`;
    // Secret is only ever included in this one response — every read after
    // this point (listWebhookEndpoints) omits it, same as the Shopify custom-app token.
    res.json({ message: "Webhook endpoint created", endpoint: result.endpoint, inboundUrl });
  }),
);

webhookInboxRoutes.patch(
  "/endpoints/:endpointId",
  requireAuth,
  requirePermission("channels:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateWebhookEndpoint({ companyId: req.auth.companyId, endpointId: req.params.endpointId, payload: req.body || {} });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ message: "Webhook endpoint updated", endpoint: result.endpoint });
  }),
);

webhookInboxRoutes.delete(
  "/endpoints/:endpointId",
  requireAuth,
  requirePermission("channels:manage"),
  asyncHandler(async (req, res) => {
    const result = await deleteWebhookEndpoint({ companyId: req.auth.companyId, endpointId: req.params.endpointId });
    if (!result.endpoint) throw new HttpError(404, "Webhook endpoint not found");
    res.json({ message: "Webhook endpoint removed" });
  }),
);

webhookInboxRoutes.get(
  "/events",
  requireAuth,
  asyncHandler(async (req, res) => {
    const events = await listWebhookEvents({
      companyId: req.auth.companyId,
      endpointId: req.query.endpointId,
      provider: req.query.provider,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ events });
  }),
);

webhookInboxRoutes.get(
  "/events/:eventId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const event = await getWebhookEvent({ companyId: req.auth.companyId, eventId: req.params.eventId });
    if (!event) throw new HttpError(404, "Event not found");
    res.json({ event });
  }),
);

// ─── Leads (events grouped by cart/order/customer) ─────────────────────────

webhookInboxRoutes.get(
  "/leads",
  requireAuth,
  asyncHandler(async (req, res) => {
    const leads = await listWebhookLeads({
      companyId: req.auth.companyId,
      endpointId: req.query.endpointId,
      provider: req.query.provider,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ leads });
  }),
);

// Full event timeline for one lead — powers the drawer.
webhookInboxRoutes.get(
  "/leads/:leadId/events",
  requireAuth,
  asyncHandler(async (req, res) => {
    const lead = await getWebhookLead({ companyId: req.auth.companyId, leadId: req.params.leadId });
    if (!lead) throw new HttpError(404, "Lead not found");
    const events = await listEventsForLead({ companyId: req.auth.companyId, endpointId: lead.endpointId, leadKey: lead.leadKey });
    res.json({ lead, events });
  }),
);

webhookInboxRoutes.post(
  "/leads/:leadId/follow-up",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { note, outcome, nextFollowUpAt, followUpStatus } = req.body || {};
    const lead = await addLeadFollowUp({
      companyId: req.auth.companyId,
      leadId: req.params.leadId,
      note,
      outcome,
      nextFollowUpAt,
      followUpStatus,
      createdByName: req.auth.displayName || req.auth.email,
    });
    if (!lead) throw new HttpError(404, "Lead not found");
    res.json({ message: "Follow-up logged", lead });
  }),
);

// ─── Inbound receiver (public — external services can't send our auth) ─────
// Identity + tenancy come entirely from the unguessable :token, not from a
// session. Always returns fast + 2xx-ish even on soft failures (unknown
// token, bad signature) so senders don't get stuck in an aggressive retry
// loop — the event still gets logged as unverified where possible so nothing
// silently vanishes.

webhookInboxRoutes.post(
  "/inbound/:token",
  asyncHandler(async (req, res) => {
    const endpoint = await getEndpointByToken(req.params.token, { includeSecret: true });
    if (!endpoint) {
      // 404 here (not 200) is intentional — a wrong/stale token is a setup
      // mistake worth the sender's own alerting picking up, unlike a
      // verification failure on a real, known endpoint (handled below).
      throw new HttpError(404, "Unknown webhook endpoint");
    }

    const { verified } = verifyWebhookSignature({
      secret: endpoint.secret,
      rawBody: req.rawBody || JSON.stringify(req.body || {}),
      headers: req.headers,
    });

    const { type, summary } = extractEventSummary(endpoint.provider, req.body);
    const leadKey = extractLeadKey(endpoint.provider, req.body);

    // A subset of headers only — enough to debug a signature mismatch,
    // without hoarding every header the sender includes.
    const headerSubset = {};
    for (const key of ["content-type", "user-agent", "x-razorpay-signature", "x-webhook-signature", "x-signature", "x-hub-signature-256", "x-cf-signature"]) {
      if (req.headers[key]) headerSubset[key] = req.headers[key];
    }

    await recordWebhookEvent({
      companyId: endpoint.companyId,
      endpointId: endpoint._id || endpoint.id,
      provider: endpoint.provider,
      type,
      summary,
      payload: req.body,
      headers: headerSubset,
      verified,
      leadKey,
    });

    res.status(200).json({ status: "received" });
  }),
);
