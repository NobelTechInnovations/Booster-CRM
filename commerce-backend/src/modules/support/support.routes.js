import { Router } from "express";
import { requireAuth, requireAuthHeaderOrQuery, requirePermission } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { attachmentUpload, handleUploadErrors } from "../../utils/upload.js";
import {
  listSupportTickets,
  getSupportTicket,
  replySupportTicket,
  updateSupportTicketStatus,
  getStaffSupportAttachment,
} from "../../repositories/support-ticket.repo.js";

const uploadFiles = handleUploadErrors(attachmentUpload.array("files", 3));

// Company-side support ticket inbox — the "when company will comment or
// reply" half of the feature. Gated behind support:manage, granted to
// Owner (via "*"), Admin, and the Support role itself (see permissions.js).
export const supportRoutes = Router();

// Registered BEFORE the router-wide requireAuth below, with its own auth
// check instead — an <img>/<video> tag can't set an Authorization header,
// so this is the one route here that also accepts the token as a ?token=
// query param (same requireAuthHeaderOrQuery already used for WhatsApp's
// inbound-media route, for the identical reason).
supportRoutes.get(
  "/tickets/:ticketId/attachments/:attachmentId",
  requireAuthHeaderOrQuery,
  requirePermission("support:manage"),
  asyncHandler(async (req, res) => {
    const result = await getStaffSupportAttachment({
      companyId: req.auth.companyId,
      ticketId: req.params.ticketId,
      attachmentId: req.params.attachmentId,
    });
    if (result.error) throw new HttpError(404, "Attachment not found");
    const { attachment } = result;
    res.set("Content-Type", attachment.mimeType);
    res.set("Cache-Control", "private, max-age=3600");
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.filename)}"`);
    res.send(attachment.data.buffer ? Buffer.from(attachment.data.buffer) : attachment.data);
  }),
);

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
  uploadFiles,
  asyncHandler(async (req, res) => {
    const result = await replySupportTicket({
      companyId: req.auth.companyId,
      ticketId: req.params.ticketId,
      message: req.body?.message,
      authorName: req.auth.displayName || req.auth.email || "Support",
      files: req.files,
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
