import nodemailer from "nodemailer";

// Raw SMTP, unlike every other external call in this codebase (metaFetch,
// shopifyFetch, razorpayFetch, mailer.js's Resend calls) — there's no HTTP
// API to fetch(), so nodemailer (the standard, well-supported Node SMTP
// client) is the one place this app needs a real dependency for outbound
// email rather than a fetch wrapper.

function buildTransport({ host, port, secure, username, password }) {
  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Boolean(secure), // true = implicit TLS (port 465), false = STARTTLS (587) or plain (25)
    auth: { user: username, pass: password },
  });
}

// Thrown (not returned) on failure — this is the "does this SMTP config
// actually work" check run once, at connect time, before ever saving
// credentials (same "verify before save" philosophy as connectWhatsAppChannel
// in whatsapp.service.js) — a bad host/port/password should fail loudly
// right there, not silently on the first real automated send weeks later.
export async function verifySmtpCredentials({ host, port, secure, username, password }) {
  const transporter = buildTransport({ host, port, secure, username, password });
  await transporter.verify();
}

// Every real automated send goes through this — a structured result, not
// best-effort-swallowed like mailer.js's sendEmail(), because every call
// here gets written to an EmailLog row either way (see
// automation-dispatcher.js) and a silently-swallowed failure would mean
// the log lies about what actually happened.
export async function sendCompanySmtpEmail({ channel, to, subject, html }) {
  const creds = channel?.credentials || {};
  if (!creds.host || !creds.port || !creds.username || !creds.password) {
    return { success: false, error: "This email channel's SMTP settings are incomplete — reconnect it." };
  }

  const fromEmail = channel.external?.fromEmail || creds.username;
  const fromName = channel.external?.fromName;

  try {
    const transporter = buildTransport(creds);
    await transporter.sendMail({
      from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
