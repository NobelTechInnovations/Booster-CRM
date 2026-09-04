import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import {
  listSupportTickets,
  getSupportTicket,
  replySupportTicket,
  updateSupportTicketStatus,
} from "../../repositories/support-ticket.repo.js";

// Company-side support ticket inbox — the "when company will comment or
// reply" half of the feature. Gated behind support:manage, granted to
// Owner (via "*"), Admin, and the Support role itself (see permissions.js).
export const supportRoutes = Router();

supportRoutes.use(requireAuth);
supportRoutes.use(requirePermission("support:manage"));

supportRoutes.get(
  "/tickets",
  asyncHandler(async (req, res) => {
    const tickets = await listSupportTickets({ companyId: req.auth.companyId, status: req.query.status });
    res.json({ tickets });
  }),
);

supportRoutes.get(
  "/tickets/:ticketId",
  asyncHandler(async (req, res) => {
    const ticket = await getSupportTicket({ companyId: req.auth.companyId, ticketId: req.params.ticketId });
    if (!ticket) throw new HttpError(404, "Ticket not found");
    res.json({ ticket });
  }),
);

supportRoutes.post(
  "/tickets/:ticketId/reply",
  asyncHandler(async (req, res) => {
    const result = await replySupportTicket({
      companyId: req.auth.companyId,
      ticketId: req.params.ticketId,
      message: req.body?.message,
      authorName: req.auth.displayName || req.auth.email || "Support",
    });
    if (result.error) throw new HttpError(result.error === "Ticket not found" ? 404 : 400, result.error);
    res.json({ ticket: result.ticket });
  }),
);

supportRoutes.patch(
  "/tickets/:ticketId/status",
  asyncHandler(async (req, res) => {
    const result = await updateSupportTicketStatus({
      companyId: req.auth.companyId,
      ticketId: req.params.ticketId,
      status: req.body?.status,
    });
    if (result.error) throw new HttpError(result.error === "Ticket not found" ? 404 : 400, result.error);
    res.json({ ticket: result.ticket });
  }),
);
