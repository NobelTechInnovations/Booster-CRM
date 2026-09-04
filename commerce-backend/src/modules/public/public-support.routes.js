import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { simpleRateLimit } from "../../utils/simple-rate-limit.js";
import {
  createSupportTicket,
  listPublicTicketsByContact,
  getPublicTicketDetail,
  customerCommentOnTicket,
  customerCloseTicket,
  customerReopenTicket,
} from "../../repositories/support-ticket.repo.js";

// No-login, customer-facing support tickets — same shape as
// public-tracking.routes.js (rate-limited per IP, scoped by company slug,
// deliberately narrow response shapes). Branding (name/logo) is served by
// the existing /api/public/track/:companySlug/branding endpoint — nothing
// support-specific about it, no need to duplicate that route here.
export const publicSupportRoutes = Router();

// 60/10min (bumped up from 30) — the ticket detail page now silently
// polls itself every ~25s while open (see support-ticket-view.jsx) so a
// staff-side status change or reply shows up without a manual refresh;
// the old 30/10min budget left no headroom for that alongside the
// initial branding/list/detail calls a normal visit already makes.
const lookupLimiter = simpleRateLimit({ windowMs: 10 * 60 * 1000, max: 60 });
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

// The three customer-side mutations added for the ticket lifecycle:
// comment (also available while pending_close — cancels the hold; and
// while closed — reopens into in_progress), close (covers both a direct
// self-close and confirming a staff-requested pending_close), reopen
// (only valid from closed, back to plain open — see support-ticket.repo.js
// for why these two "reopen" paths are kept distinct).
publicSupportRoutes.post(
  "/:companySlug/tickets/:ticketId/comment",
  createLimiter,
  asyncHandler(async (req, res) => {
    const { companySlug, ticketId } = req.params;
    const { phone, email, message } = req.body || {};
    const result = await customerCommentOnTicket({ companySlug, ticketId, phone, email, message });
    if (result.error === "not_found") throw new HttpError(404, "Ticket not found");
    if (result.error === "contact_required") throw new HttpError(400, "Enter a phone number or email");
    if (result.error === "message_required") throw new HttpError(400, "Please enter a message");
    res.json(result);
  }),
);

publicSupportRoutes.post(
  "/:companySlug/tickets/:ticketId/close",
  createLimiter,
  asyncHandler(async (req, res) => {
    const { companySlug, ticketId } = req.params;
    const { phone, email } = req.body || {};
    const result = await customerCloseTicket({ companySlug, ticketId, phone, email });
    if (result.error === "not_found") throw new HttpError(404, "Ticket not found");
    if (result.error === "contact_required") throw new HttpError(400, "Enter a phone number or email");
    res.json(result);
  }),
);

publicSupportRoutes.post(
  "/:companySlug/tickets/:ticketId/reopen",
  createLimiter,
  asyncHandler(async (req, res) => {
    const { companySlug, ticketId } = req.params;
    const { phone, email } = req.body || {};
    const result = await customerReopenTicket({ companySlug, ticketId, phone, email });
    if (result.error === "not_found") throw new HttpError(404, "Ticket not found");
    if (result.error === "contact_required") throw new HttpError(400, "Enter a phone number or email");
    if (result.error === "not_closed") throw new HttpError(400, "Only a closed ticket can be reopened");
    res.json(result);
  }),
);
