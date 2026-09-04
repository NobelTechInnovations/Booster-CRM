import { isMongoConnected } from "../config/database.js";
import { SupportTicket } from "../models/support-ticket.model.js";
import { getActiveCompanyBySlug, phoneCandidates, companyIdFilter } from "./public-tracking.repo.js";
import { getConnectedEmailChannel } from "./channel.repo.js";
import { sendCompanySmtpEmail } from "../utils/smtp-mailer.js";

// ─── Email notification (fixed built-in template, not the customizable ────
// automation/template system — see the plan's own note on why: this needs
// to work the moment SMTP is connected, with no separate rule/template
// setup required first, the same way an order confirmation just works.
// Best-effort — never allowed to throw past the caller, same contract as
// every other notification email in this app.

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// notice covers the non-reply lifecycle emails — staff asking to close,
// confirmation the ticket actually closed, confirmation it reopened.
// Plain replies keep using replyMessage as before; the two are mutually
// exclusive in practice (a status change and a message are never sent in
// the same call).
const NOTICE_TEXT = {
  pending_close: "We'd like to close this ticket. If everything's sorted, you can confirm the close from your ticket page — if not, just add a comment there and we'll keep it open.",
  closed: "This ticket has been closed. If you need anything else, you can reopen it anytime from the same ticket page.",
  auto_closed: "This ticket was automatically closed after 48 hours with no response. If you still need help, just reopen it from the same ticket page.",
  reopened: "This ticket has been reopened and is back in progress.",
};

const NOTICE_SUBJECT = {
  pending_close: (t) => `Please confirm: close ticket ${t.ticketNumber}?`,
  closed: (t) => `Ticket ${t.ticketNumber} closed`,
  auto_closed: (t) => `Ticket ${t.ticketNumber} closed (no response)`,
  reopened: (t) => `Ticket ${t.ticketNumber} reopened`,
};

function ticketEmailHtml({ ticket, company, replyMessage, notice }) {
  const historyRows = (ticket.replies || [])
    .slice(-5)
    .map((r) => `<li style="margin-bottom:6px;"><strong>${escapeHtml(r.authorName)}</strong> — ${escapeHtml(r.message)}</li>`)
    .join("");

  const noticeText = notice ? NOTICE_TEXT[notice] : "";
  const bodyBlock = replyMessage
    ? `<p>You have a new reply on your support ticket:</p>
       <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:12px 0;">${escapeHtml(replyMessage)}</div>`
    : noticeText
      ? `<p>${escapeHtml(noticeText)}</p>`
      : `<p>We've received your support ticket and will get back to you soon.</p>`;

  return `
    <div style="font-family:sans-serif;color:#0f172a;">
      <p>Hi${ticket.isGeneralInquiry ? "" : " there"},</p>
      ${bodyBlock}
      <p style="font-size:13px;color:#475569;">
        Ticket <strong>${escapeHtml(ticket.ticketNumber)}</strong> · ${escapeHtml(ticket.category)}${ticket.subCategory ? ` — ${escapeHtml(ticket.subCategory)}` : ""}<br/>
        Status: <strong>${escapeHtml(ticket.status)}</strong>
      </p>
      ${historyRows ? `<p style="font-size:12px;color:#94a3b8;margin-top:16px;">Recent history:</p><ul style="font-size:13px;color:#334155;">${historyRows}</ul>` : ""}
      <p style="font-size:11px;color:#94a3b8;margin-top:20px;">${escapeHtml(company?.name || "")} · Powered by Wokbook</p>
    </div>
  `.trim();
}

async function notifyCustomer({ companyId, ticket, replyMessage, notice }) {
  if (!ticket.contactEmail) return; // no address to notify — silently skip, same as every other best-effort email in this app
  try {
    const channel = await getConnectedEmailChannel(companyId);
    if (!channel) return;
    const company = { name: undefined }; // avoid an extra Company lookup on the hot path; fromName on the channel already carries brand identity in the "From" header
    const subject = replyMessage
      ? `New reply on your support ticket ${ticket.ticketNumber}`
      : notice && NOTICE_SUBJECT[notice]
        ? NOTICE_SUBJECT[notice](ticket)
        : `We've received your ticket ${ticket.ticketNumber}`;
    await sendCompanySmtpEmail({ channel, to: ticket.contactEmail, subject, html: ticketEmailHtml({ ticket, company, replyMessage, notice }) });
  } catch (err) {
    console.warn(`[Support] Notification email failed for ticket ${ticket.ticketNumber}:`, err.message);
  }
}

// ─── Public (no-login) ──────────────────────────────────────────────────────

const CATEGORIES = ["order_issue", "payment_refund", "shipping", "product", "general"];

function publicTicketSummary(t) {
  return {
    id: t._id,
    ticketNumber: t.ticketNumber,
    category: t.category,
    subCategory: t.subCategory || "",
    message: t.message,
    status: t.status,
    pendingCloseAt: t.pendingCloseAt || null,
    createdAt: t.createdAt,
    replies: (t.replies || []).map((r) => ({ authorName: r.authorName, authorType: r.authorType || "staff", message: r.message, createdAt: r.createdAt })),
  };
}

// Re-validates the ticket actually belongs to this contact (not just "some
// ticket matched at list time") — same "a guessed id alone reveals
// nothing" pattern as getPublicOrderDetail in public-tracking.repo.js.
// Shared by every public action that mutates a specific ticket (comment,
// close, reopen) as well as the read-only detail lookup below — returns a
// live mongoose document (not .lean()) so callers can push/save directly.
async function findOwnedTicketDoc({ companySlug, ticketId, phone, email }) {
  const company = await getActiveCompanyBySlug(companySlug);
  if (!company) return { error: "not_found" };

  const phoneCands = phoneCandidates(phone);
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!phoneCands.length && !cleanEmail) return { error: "contact_required" };

  if (!isMongoConnected()) return { error: "not_found" };
  const ticket = await SupportTicket.findOne({ _id: ticketId, companyId: companyIdFilter(company._id) });
  if (!ticket) return { error: "not_found" };

  const matches = (ticket.contactPhone && phoneCands.includes(ticket.contactPhone)) || (ticket.contactEmail && ticket.contactEmail === cleanEmail);
  if (!matches) return { error: "not_found" };

  return { company, ticket };
}

// Support tickets are Mongo-only, no in-memory dev fallback — same
// reasoning as data-export.repo.js: a real customer-facing record, not
// something worth simulating for a Mongo-less local dev run.
export async function createSupportTicket({ companySlug, phone, email, category, subCategory, message }) {
  if (!isMongoConnected()) return { error: "not_found" };
  const company = await getActiveCompanyBySlug(companySlug);
  if (!company) return { error: "not_found" };

  const cleanMessage = String(message || "").trim();
  if (!cleanMessage) return { error: "message_required" };
  if (!CATEGORIES.includes(category)) return { error: "invalid_category" };

  const contactPhone = String(phone || "").trim();
  const contactEmail = String(email || "").trim().toLowerCase();
  const isGeneralInquiry = !contactPhone && !contactEmail;

  const doc = await SupportTicket.create({
    companyId: company._id,
    contactPhone: contactPhone || undefined,
    contactEmail: contactEmail || undefined,
    isGeneralInquiry,
    category,
    subCategory: String(subCategory || "").trim(),
    message: cleanMessage,
  });
  doc.ticketNumber = `TCK-${String(doc._id).slice(-6).toUpperCase()}`;
  await doc.save();

  await notifyCustomer({ companyId: company._id, ticket: doc });

  return { ticket: publicTicketSummary(doc.toObject()) };
}

// General-inquiry tickets (no contact info) are never returned here by
// design — there's nothing to match them against.
export async function listPublicTicketsByContact({ companySlug, phone, email }) {
  const company = await getActiveCompanyBySlug(companySlug);
  if (!company) return { error: "not_found" };

  const phoneCands = phoneCandidates(phone);
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!phoneCands.length && !cleanEmail) return { error: "contact_required" };

  const or = [];
  if (phoneCands.length) or.push({ contactPhone: { $in: phoneCands } });
  if (cleanEmail) or.push({ contactEmail: cleanEmail });

  let tickets;
  if (isMongoConnected()) {
    tickets = await SupportTicket.find({ companyId: companyIdFilter(company._id), $or: or }).sort({ createdAt: -1 }).lean();
  } else {
    tickets = [];
  }

  return {
    company: { name: company.name, slug: company.slug, logoUrl: company.logoUrl || "" },
    tickets: tickets.map(publicTicketSummary),
  };
}

export async function getPublicTicketDetail({ companySlug, ticketId, phone, email }) {
  const found = await findOwnedTicketDoc({ companySlug, ticketId, phone, email });
  if (found.error) return found;
  const { company, ticket } = found;
  return { company: { name: company.name, slug: company.slug, logoUrl: company.logoUrl || "" }, ticket: publicTicketSummary(ticket.toObject()) };
}

// Customer adds a follow-up message to their own ticket — the one public
// mutation that was deliberately left out of the original plan ("customers
// can view replies but not reply back"); this request explicitly reverses
// that. Commenting while a staff-requested close is on hold reads as an
// objection — cancels the hold. Commenting on an already-closed ticket
// picks the conversation back up, same effect.
export async function customerCommentOnTicket({ companySlug, ticketId, phone, email, message }) {
  const cleanMessage = String(message || "").trim();
  if (!cleanMessage) return { error: "message_required" };

  const found = await findOwnedTicketDoc({ companySlug, ticketId, phone, email });
  if (found.error) return found;
  const { ticket } = found;

  ticket.replies.push({ authorName: "Customer", authorType: "customer", message: cleanMessage });

  if (ticket.status === "pending_close" || ticket.status === "closed" || ticket.status === "open") {
    ticket.status = "in_progress";
    ticket.pendingCloseAt = undefined;
  }
  await ticket.save();

  return { ticket: publicTicketSummary(ticket.toObject()) };
}

// One action covers both "customer closes their own ticket outright" and
// "customer confirms a staff-requested pending close" — same target state
// either way, so there's no separate confirm endpoint.
export async function customerCloseTicket({ companySlug, ticketId, phone, email }) {
  const found = await findOwnedTicketDoc({ companySlug, ticketId, phone, email });
  if (found.error) return found;
  const { company, ticket } = found;

  if (ticket.status === "closed") return { ticket: publicTicketSummary(ticket.toObject()) }; // already closed — no-op, not an error

  ticket.status = "closed";
  ticket.pendingCloseAt = undefined;
  await ticket.save();

  await notifyCustomer({ companyId: company._id, ticket: ticket.toObject(), notice: "closed" });

  return { ticket: publicTicketSummary(ticket.toObject()) };
}

export async function customerReopenTicket({ companySlug, ticketId, phone, email }) {
  const found = await findOwnedTicketDoc({ companySlug, ticketId, phone, email });
  if (found.error) return found;
  const { company, ticket } = found;

  if (ticket.status !== "closed") return { error: "not_closed" };

  ticket.status = "open";
  ticket.pendingCloseAt = undefined;
  await ticket.save();

  await notifyCustomer({ companyId: company._id, ticket: ticket.toObject(), notice: "reopened" });

  return { ticket: publicTicketSummary(ticket.toObject()) };
}

// Called by support-ticket-auto-close.job.js (a plain cron, same shape as
// cod-payment-reminder.job.js) — any ticket still sitting in pending_close
// 48h after staff asked to close it gets closed on its own, since a
// customer who never responds is treated the same as one who confirmed.
export async function autoCloseOverdueTickets({ olderThanMs = 48 * 60 * 60 * 1000 } = {}) {
  if (!isMongoConnected()) return { closed: 0 };
  const cutoff = new Date(Date.now() - olderThanMs);
  const overdue = await SupportTicket.find({ status: "pending_close", pendingCloseAt: { $lte: cutoff } });

  let closed = 0;
  for (const ticket of overdue) {
    try {
      ticket.status = "closed";
      ticket.pendingCloseAt = undefined;
      await ticket.save();
      await notifyCustomer({ companyId: ticket.companyId, ticket: ticket.toObject(), notice: "auto_closed" });
      closed += 1;
    } catch (err) {
      console.warn(`[Support] Auto-close failed for ticket ${ticket.ticketNumber}:`, err.message);
    }
  }
  return { closed };
}

// ─── Company-side (authenticated) ───────────────────────────────────────────

export async function listSupportTickets({ companyId, status }) {
  if (!isMongoConnected()) return [];
  const filter = { companyId: companyIdFilter(companyId), ...(status ? { status } : {}) };
  return SupportTicket.find(filter).sort({ createdAt: -1 }).lean();
}

export async function getSupportTicket({ companyId, ticketId }) {
  if (!isMongoConnected()) return null;
  return SupportTicket.findOne({ _id: ticketId, companyId: companyIdFilter(companyId) }).lean();
}

export async function replySupportTicket({ companyId, ticketId, message, authorName }) {
  if (!isMongoConnected()) return { error: "Ticket not found" };
  const cleanMessage = String(message || "").trim();
  if (!cleanMessage) return { error: "Reply message is required" };

  const ticket = await SupportTicket.findOne({ _id: ticketId, companyId: companyIdFilter(companyId) });
  if (!ticket) return { error: "Ticket not found" };

  ticket.replies.push({ authorName: authorName || "Support", authorType: "staff", message: cleanMessage });
  // A reply is real progress — auto-advance out of "open", but never
  // downgrade a ticket a company already marked resolved/closed just
  // because they left a closing note on it. A staff reply while a close
  // is pending reads as continued work, not a change of mind — leave the
  // hold as-is; the customer's own comment is what cancels it.
  if (ticket.status === "open") ticket.status = "in_progress";
  await ticket.save();

  await notifyCustomer({ companyId, ticket: ticket.toObject(), replyMessage: cleanMessage });

  return { ticket: ticket.toObject() };
}

export async function updateSupportTicketStatus({ companyId, ticketId, status }) {
  if (!isMongoConnected()) return { error: "Ticket not found" };
  if (!["open", "in_progress", "resolved", "closed"].includes(status)) return { error: "Invalid status" };

  const ticket = await SupportTicket.findOne({ _id: ticketId, companyId: companyIdFilter(companyId) });
  if (!ticket) return { error: "Ticket not found" };

  if (status === "closed") {
    // Staff can never force-close directly — it goes on hold so the
    // customer gets a chance to confirm or object first (see the model's
    // own note on pending_close). A customer closing their own ticket
    // goes through customerCloseTicket above instead, which skips this
    // hold entirely.
    ticket.status = "pending_close";
    ticket.pendingCloseAt = new Date();
    await ticket.save();
    await notifyCustomer({ companyId, ticket: ticket.toObject(), notice: "pending_close" });
    return { ticket: ticket.toObject() };
  }

  ticket.status = status;
  if (status !== "pending_close") ticket.pendingCloseAt = undefined;
  await ticket.save();
  return { ticket: ticket.toObject() };
}
