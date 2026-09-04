import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { simpleRateLimit } from "../../utils/simple-rate-limit.js";
import { createSupportTicket, listPublicTicketsByContact, getPublicTicketDetail } from "../../repositories/support-ticket.repo.js";

// No-login, customer-facing support tickets — same shape as
// public-tracking.routes.js (rate-limited per IP, scoped by company slug,
// deliberately narrow response shapes). Branding (name/logo) is served by
// the existing /api/public/track/:companySlug/branding endpoint — nothing
// support-specific about it, no need to duplicate that route here.
export const publicSupportRoutes = Router();

const lookupLimiter = simpleRateLimit({ windowMs: 10 * 60 * 1000, max: 30 });
// A bit tighter than lookup — this writes data and can trigger an email
// send, not just a read.
const createLimiter = simpleRateLimit({ windowMs: 10 * 60 * 1000, max: 10 });

publicSupportRoutes.get(
  "/:companySlug/tickets",
  lookupLimiter,
  asyncHandler(async (req, res) => {
    const { companySlug } = req.params;
    const { phone, email } = req.query;
    const result = await listPublicTicketsByContact({ companySlug, phone, email });
    if (result.error === "not_found") throw new HttpError(404, "Store not found");
    if (result.error === "contact_required") throw new HttpError(400, "Enter a phone number or email");
    res.json(result);
  }),
);

publicSupportRoutes.get(
  "/:companySlug/tickets/:ticketId",
  lookupLimiter,
  asyncHandler(async (req, res) => {
    const { companySlug, ticketId } = req.params;
    const { phone, email } = req.query;
    const result = await getPublicTicketDetail({ companySlug, ticketId, phone, email });
    if (result.error === "not_found") throw new HttpError(404, "Ticket not found");
    if (result.error === "contact_required") throw new HttpError(400, "Enter a phone number or email");
    res.json(result);
  }),
);

publicSupportRoutes.post(
  "/:companySlug/tickets",
  createLimiter,
  asyncHandler(async (req, res) => {
    const { companySlug } = req.params;
    const { phone, email, category, subCategory, message } = req.body || {};
    const result = await createSupportTicket({ companySlug, phone, email, category, subCategory, message });
    if (result.error === "not_found") throw new HttpError(404, "Store not found");
    if (result.error === "message_required") throw new HttpError(400, "Please describe your issue");
    if (result.error === "invalid_category") throw new HttpError(400, "Select a valid category");
    res.status(201).json(result);
  }),
);
