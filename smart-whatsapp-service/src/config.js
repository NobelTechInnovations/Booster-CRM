import "dotenv/config";

// This service is intentionally a completely separate deployable — it is
// NOT part of commerce-backend and never touches its codebase or its
// Vercel deployment. It talks to commerce-backend only over HTTP, using a
// shared secret (not a user's JWT) since there is no logged-in user on
// this side of the bridge.
export const config = {
  port: Number(process.env.PORT || 5200),

  // Every request into this service (except /health) must carry this exact
  // value in an `x-smart-whatsapp-secret` header. Generate a long random
  // string and set the SAME value here and as SMART_WHATSAPP_SHARED_SECRET
  // in commerce-backend's env — this is the only thing standing between
  // this service and anyone who can reach its URL, so don't leave it blank
  // outside of local development.
  sharedSecret: process.env.SMART_WHATSAPP_SHARED_SECRET || "dev-only-smart-whatsapp-secret",

  // Where commerce-backend lives — used to push inbound messages the
  // instant they arrive (this service can't wait to be polled for those;
  // WhatsApp delivers them once, in real time).
  backendUrl: process.env.BACKEND_URL || "http://localhost:4000",
  backendWebhookPath: "/api/smart-whatsapp/webhook",

  // Each company's WhatsApp Web login session (Baileys' multi-file auth
  // state — keys, not the actual message history) lives on this service's
  // own disk, one folder per company. This is exactly why this service
  // needs a real, persistent-disk host (a VPS, or Node hosting with a
  // writable filesystem that survives restarts) — a container that gets
  // rebuilt from scratch on every deploy would force every company to
  // re-scan the QR code each time.
  sessionsDir: process.env.SESSIONS_DIR || "./sessions",
};
