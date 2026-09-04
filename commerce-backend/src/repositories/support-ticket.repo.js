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

function ticketEmailHtml({ ticket, company, replyMessage }) {
  const historyRows = (ticket.replies || [])
    .slice(-5)
    .map((r) => `<li style="margin-bottom:6px;"><strong>${escapeHtml(r.authorName)}</strong> — ${escapeHtml(r.message)}</li>`)
    .join("");

  return `
    <div style="font-family:sans-serif;color:#0f172a;">
      <p>Hi${ticket.isGeneralInquiry ? "" : " there"},</p>
      ${replyMessage
        ? `<p>You have a new reply on your support ticket:</p>
           <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:12px 0;">${escapeHtml(replyMessage)}</div>`
        : `<p>We've received your support ticket and will get back to you soon.</p>`
      }
      <p style="font-size:13px;color:#475569;">
        Ticket <strong>${escapeHtml(ticket.ticketNumber)}</strong> · ${escapeHtml(ticket.category)}${ticket.subCategory ? ` — ${escapeHtml(ticket.subCategory)}` : ""}<br/>
        Status: <strong>${escapeHtml(ticket.status)}</strong>
      </p>
      ${historyRows ? `<p style="font-size:12px;color:#94a3b8;margin-top:16px;">Recent history:</p><ul style="font-size:13px;color:#334155;">${historyRows}</ul>` : ""}
      <p style="font-size:11px;color:#94a3b8;margin-top:20px;">${escapeHtml(company?.name || "")} · Powered by Wokbook</p>
    </div>
  `.trim();
}

async function notifyCustomer({ companyId, ticket, replyMessage }) {
  if (!ticket.contactEmail) return; // no address to notify — silently skip, same as every other best-effort email in this app
  try {
    const channel = await getConnectedEmailChannel(companyId);
    if (!channel) return;
    const company = { name: undefined }; // avoid an extra Company lookup on the hot path; fromName on the channel already carries brand identity in the "From" header
    const subject = replyMessage
      ? `New reply on your support ticket ${ticket.ticketNumber}`
      : `We've received your ticket ${ticket.ticketNumber}`;
    await sendCompanySmtpEmail({ channel, to: ticket.contactEmail, subject, html: ticketEmailHtml({ ticket, company, replyMessage }) });
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
    createdAt: t.createdAt,
    replies: (t.replies || []).map((r) => ({ authorName: r.authorName, message: r.message, createdAt: r.createdAt })),
  };
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

// Re-validates the ticket actually belongs to this contact (not just "some
// ticket matched at list time") — same "a guessed id alone reveals
// nothing" pattern as getPublicOrderDetail in public-tracking.repo.js.
export async function getPublicTicketDetail({ companySlug, ticketId, phone, email }) {
  const company = await getActiveCompanyBySlug(companySlug);
  if (!company) return { error: "not_found" };

  const phoneCands = phoneCandidates(phone);
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!phoneCands.length && !cleanEmail) return { error: "contact_required" };

  let ticket;
  if (isMongoConnected()) {
    ticket = await SupportTicket.findOne({ _id: ticketId, companyId: companyIdFilter(company._id) }).lean();
  }
  if (!ticket) return { error: "not_found" };

  const matches = (ticket.contactPhone && phoneCands.includes(ticket.contactPhone)) || (ticket.contactEmail && ticket.contactEmail === cleanEmail);
  if (!matches) return { error: "not_found" };

  return { company: { name: company.name, slug: company.slug, logoUrl: company.logoUrl || "" }, ticket: publicTicketSummary(ticket) };
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

  ticket.replies.push({ authorName: authorName || "Support", message: cleanMessage });
  // A reply is real progress — auto-advance out of "open", but never
  // downgrade a ticket a company already marked resolved/closed just
  // because they left a closing note on it.
  if (ticket.status === "open") ticket.status = "in_progress";
  await ticket.save();

  await notifyCustomer({ companyId, ticket: ticket.toObject(), replyMessage: cleanMessage });

  return { ticket: ticket.toObject() };
}

export async function updateSupportTicketStatus({ companyId, ticketId, status }) {
  if (!isMongoConnected()) return { error: "Ticket not found" };
  if (!["open", "in_progress", "resolved", "closed"].includes(status)) return { error: "Invalid status" };
  const ticket = await SupportTicket.findOneAndUpdate(
    { _id: ticketId, companyId: companyIdFilter(companyId) },
    { $set: { status } },
    { new: true },
  ).lean();
  if (!ticket) return { error: "Ticket not found" };
  return { ticket };
}
