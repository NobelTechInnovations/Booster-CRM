import { autoCloseOverdueTickets } from "../repositories/support-ticket.repo.js";

// Same plain-cron shape as cod-payment-reminder.job.js — any support
// ticket a staff member asked to close (status "pending_close") that's
// gone 48h with no customer response gets closed on its own. All the
// actual logic (the query, the notification email) lives in the repo
// function; this file is just the scheduled trigger for it.
export async function runSupportTicketAutoCloseJob() {
  console.log("[Job] Running support ticket auto-close check...");
  try {
    const { closed } = await autoCloseOverdueTickets();
    if (closed) console.log(`[Job] Auto-closed ${closed} support ticket(s).`);
  } catch (error) {
    console.error("[Job] Support ticket auto-close job failed:", error.message);
  }
}
