import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import { pino } from "pino";
import QRCode from "qrcode";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { notifyInboundMessage, notifyStatusChange } from "./backend-client.js";

// Baileys logs very heavily at default levels — this service has its own,
// much shorter, log lines below, so Baileys itself is kept quiet. Flip to
// "info" (or pass a real pino destination) while debugging one specific
// connection.
const logger = pino({ level: "silent" });

// One entry per company for as long as this process is up:
// { sock, status: "connecting"|"qr"|"open"|"close"|"logged_out", qr, phoneNumber }
// This is genuinely in-memory, not persisted — the actual WhatsApp *login*
// (the thing that would otherwise force a re-scan) is what's saved to disk
// via useMultiFileAuthState below; this map just tracks the live socket for
// whichever companies this particular process instance is currently
// holding open.
const sessions = new Map();

function sessionDir(companyId) {
  return path.join(config.sessionsDir, String(companyId));
}

function mediaDir(companyId) {
  return path.join(sessionDir(companyId), "media");
}

// Baileys nests an inbound attachment under a key matching its type
// (imageMessage, videoMessage, ...) — this pulls out whichever one is
// present the same way whatsapp.service.js's Cloud API webhook handler
// does for Meta's shape.
function extractMedia(msg) {
  for (const type of ["image", "video", "audio", "document", "sticker"]) {
    const node = msg[`${type}Message`];
    if (node) return { type, node };
  }
  return null;
}

export function getStatus(companyId) {
  const entry = sessions.get(companyId);
  if (!entry) return { status: "disconnected", qr: null, phoneNumber: "" };
  return { status: entry.status, qr: entry.qr, phoneNumber: entry.phoneNumber };
}

export async function startSession(companyId) {
  const existing = sessions.get(companyId);
  if (existing && ["open", "connecting", "qr"].includes(existing.status)) return existing;

  const dir = sessionDir(companyId);
  fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  const sock = makeWASocket({ version, auth: state, logger, printQRInTerminal: false });
  const entry = { sock, status: "connecting", qr: null, phoneNumber: "" };
  sessions.set(companyId, entry);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      entry.qr = await QRCode.toDataURL(qr).catch(() => null);
      entry.status = "qr";
    }

    if (connection === "open") {
      entry.status = "open";
      entry.qr = null;
      entry.phoneNumber = (sock.user?.id || "").split(":")[0];
      notifyStatusChange({ companyId, status: "open", phoneNumber: entry.phoneNumber });
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      entry.status = loggedOut ? "logged_out" : "close";
      notifyStatusChange({ companyId, status: entry.status });

      if (!loggedOut) {
        // Baileys' own documented pattern: any close that isn't an actual
        // logout just means the connection dropped (network blip, WA
        // server restart, etc.) — reconnect using the same saved
        // credentials, no new QR scan needed.
        setTimeout(() => {
          startSession(companyId).catch((err) => console.error(`[smart-whatsapp] reconnect failed for company ${companyId}: ${err.message}`));
        }, 3000);
      } else {
        // A genuine logout (unlinked from the phone's own WhatsApp app) —
        // clear the now-invalid credentials so the next connect attempt
        // starts a real fresh pairing instead of looping on stale creds.
        fs.rmSync(dir, { recursive: true, force: true });
        sessions.delete(companyId);
      }
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      // Group messages are out of scope — this bridges a business's own
      // customer conversations, not a general WhatsApp client.
      if (m.key.remoteJid?.endsWith("@g.us")) continue;

      const waId = (m.key.remoteJid || "").split("@")[0];
      if (!waId) continue;

      const msg = m.message;
      const text = msg.conversation || msg.extendedTextMessage?.text || "";
      const media = extractMedia(msg);

      if (media) {
        downloadMediaMessage(m, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage })
          .then((buffer) => {
            const dirPath = mediaDir(companyId);
            fs.mkdirSync(dirPath, { recursive: true });
            const ext = (media.node.mimetype || "application/octet-stream").split("/")[1] || "bin";
            fs.writeFileSync(path.join(dirPath, `${m.key.id}.${ext}`), buffer);
          })
          .catch((err) => console.warn(`[smart-whatsapp] media download failed for ${m.key.id}: ${err.message}`));
      }

      notifyInboundMessage({
        companyId,
        waId,
        text: text || media?.node?.caption || "",
        type: media?.type || "text",
        mediaId: media ? m.key.id : undefined,
        mediaMimeType: media?.node?.mimetype || "",
        senderName: m.pushName || "",
        waMessageId: m.key.id,
        timestamp: m.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000).toISOString() : undefined,
      });
    }
  });

  return entry;
}

export async function sendMessage(companyId, { to, text, mediaUrl, mediaType }) {
  const entry = sessions.get(companyId);
  if (!entry || entry.status !== "open") throw new Error("This WhatsApp number isn't connected right now.");
  if (!to) throw new Error("Recipient phone number is required.");
  if (!text?.trim() && !mediaUrl) throw new Error("Message text or attachment is required.");

  const jid = `${String(to).replace(/\D/g, "")}@s.whatsapp.net`;
  const payload = mediaUrl
    ? { [mediaType || "document"]: { url: mediaUrl }, ...(text?.trim() ? { caption: text.trim() } : {}) }
    : { text: text.trim() };

  const sent = await entry.sock.sendMessage(jid, payload);
  return { waMessageId: sent?.key?.id || "" };
}

export async function logout(companyId) {
  const entry = sessions.get(companyId);
  if (entry) {
    await entry.sock.logout().catch(() => {});
    sessions.delete(companyId);
  }
  fs.rmSync(sessionDir(companyId), { recursive: true, force: true });
}

// Finds a previously-downloaded inbound attachment on disk — filenames are
// "<messageId>.<ext>" (see the download above), so the extension is
// unknown ahead of time from just the id the main backend has.
export function findMediaFile(companyId, messageId) {
  const dirPath = mediaDir(companyId);
  if (!fs.existsSync(dirPath)) return null;
  const match = fs.readdirSync(dirPath).find((f) => f.startsWith(`${messageId}.`));
  return match ? path.join(dirPath, match) : null;
}

// Called once at startup so a service restart resumes every company's
// already-paired connection instead of silently dropping it until someone
// happens to hit "connect" again.
export function resumeAllSessions() {
  if (!fs.existsSync(config.sessionsDir)) return;
  for (const companyId of fs.readdirSync(config.sessionsDir)) {
    const credsPath = path.join(config.sessionsDir, companyId, "creds.json");
    if (fs.existsSync(credsPath)) {
      startSession(companyId).catch((err) => console.error(`[smart-whatsapp] could not resume session for company ${companyId}: ${err.message}`));
    }
  }
}
