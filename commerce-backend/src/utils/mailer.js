import { env } from "../config/env.js";

// Transactional email via Resend's REST API — same fetch-wrapper shape as
// every other external service in this codebase (metaFetch, shopifyFetch,
// razorpayFetch). No SMTP setup, no library beyond native fetch.
//
// Best-effort by design: every caller of sendEmail() treats it as a
// non-critical side effect (a receipt, a reminder) — a misconfigured or
// down email provider must never break the actual feature (a payment
// still gets credited, a trial still expires) it's just notifying about.
export async function sendEmail({ to, subject, html }) {
  if (!env.resend.apiKey) {
    console.warn(`[mailer] RESEND_API_KEY not set — skipped email to ${to}: ${subject}`);
    return { skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.resend.apiKey}`,
    },
    body: JSON.stringify({ from: env.resend.fromEmail, to, subject, html }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn(`[mailer] Resend rejected email to ${to}: ${response.status} ${body?.message || ""}`);
    return { error: body?.message || `Resend request failed (${response.status})` };
  }
  return body;
}
