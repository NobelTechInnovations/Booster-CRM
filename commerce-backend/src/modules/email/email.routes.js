import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireFeature } from "../../middleware/feature-gate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import {
  listEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
} from "../../repositories/email-template.repo.js";
import { listEmailLogs } from "../../repositories/email-log.repo.js";
import { getConnectedEmailChannel } from "../../repositories/channel.repo.js";
import { sendCompanySmtpEmail } from "../../utils/smtp-mailer.js";
import { renderNamedTemplate } from "../../utils/template-render.js";

export const emailRoutes = Router();

emailRoutes.use(requireAuth);
emailRoutes.use(requireFeature("automation"));

// ─── Templates ────────────────────────────────────────────────────────────

emailRoutes.get(
  "/templates",
  asyncHandler(async (req, res) => {
    const templates = await listEmailTemplates(req.auth.companyId);
    res.json({ templates });
  }),
);

emailRoutes.post(
  "/templates",
  asyncHandler(async (req, res) => {
    const result = await createEmailTemplate({ companyId: req.auth.companyId, createdBy: req.auth.sub, payload: req.body });
    if (result.error) throw new HttpError(400, result.error);
    res.status(201).json({ template: result.template });
  }),
);

emailRoutes.patch(
  "/templates/:templateId",
  asyncHandler(async (req, res) => {
    const result = await updateEmailTemplate({ companyId: req.auth.companyId, templateId: req.params.templateId, payload: req.body });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ template: result.template });
  }),
);

emailRoutes.delete(
  "/templates/:templateId",
  asyncHandler(async (req, res) => {
    const result = await deleteEmailTemplate({ companyId: req.auth.companyId, templateId: req.params.templateId });
    res.json({ template: result.template });
  }),
);

// Sample data standing in for a real order — lets a company see exactly
// what a customer would receive before ever wiring the template into a
// live rule. Sent to the current user's own address.
const SAMPLE_CONTEXT = {
  customerName: "Priya Sharma",
  orderNumber: "#1042",
  orderTotal: 1499,
  currency: "INR",
  trackingNumber: "SAMPLE123456",
  trackingUrl: "https://example.com/track/SAMPLE123456",
  courierName: "Sample Courier",
  companyName: "Your Store",
};

emailRoutes.post(
  "/templates/:templateId/test-send",
  asyncHandler(async (req, res) => {
    const template = await getEmailTemplate({ companyId: req.auth.companyId, templateId: req.params.templateId });
    if (!template) throw new HttpError(404, "Template not found");
    if (!req.auth.email) throw new HttpError(400, "No email address on your account to send a test to");

    const channel = await getConnectedEmailChannel(req.auth.companyId);
    if (!channel) throw new HttpError(400, "Connect an email channel first");

    const subject = `[Test] ${renderNamedTemplate(template.subject, SAMPLE_CONTEXT)}`;
    const html = renderNamedTemplate(template.bodyHtml, SAMPLE_CONTEXT);
    const result = await sendCompanySmtpEmail({ channel, to: req.auth.email, subject, html });
    if (!result.success) throw new HttpError(400, `Test email failed: ${result.error}`);

    res.json({ message: `Test email sent to ${req.auth.email}` });
  }),
);

// ─── Send log ─────────────────────────────────────────────────────────────

emailRoutes.get(
  "/logs",
  asyncHandler(async (req, res) => {
    const logs = await listEmailLogs({ companyId: req.auth.companyId, limit: Number(req.query.limit) || 100 });
    res.json({ logs });
  }),
);
