import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { startSession, getStatus, sendMessage, logout, findMediaFile } from "./session-manager.js";

export const router = Router();

// Every route here (except /health) is a private, service-to-service call
// from commerce-backend — never called directly by a browser — so a
// single shared secret is enough authentication; there's no per-user
// identity on this side of the bridge at all.
router.use((req, res, next) => {
  if (req.path === "/health") return next();
  const provided = req.headers["x-smart-whatsapp-secret"];
  if (provided !== config.sharedSecret) return res.status(401).json({ message: "Invalid or missing shared secret" });
  next();
});

router.get("/health", (_req, res) => res.json({ ok: true }));

router.post("/sessions/:companyId/start", async (req, res) => {
  try {
    await startSession(req.params.companyId);
    res.json(getStatus(req.params.companyId));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/sessions/:companyId/status", (req, res) => {
  res.json(getStatus(req.params.companyId));
});

router.post("/sessions/:companyId/logout", async (req, res) => {
  try {
    await logout(req.params.companyId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/sessions/:companyId/send", async (req, res) => {
  try {
    const result = await sendMessage(req.params.companyId, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Streams a previously-downloaded inbound attachment back to
// commerce-backend, which re-proxies it to the browser the same way it
// already does for Cloud API media — this service's own disk is never
// exposed straight to the internet.
router.get("/sessions/:companyId/media/:messageId", (req, res) => {
  const filePath = findMediaFile(req.params.companyId, req.params.messageId);
  if (!filePath) return res.status(404).json({ message: "Attachment not found (it may not have finished downloading yet)" });
  const ext = path.extname(filePath).slice(1);
  const contentTypeByExt = { jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", ogg: "audio/ogg", pdf: "application/pdf" };
  res.setHeader("Content-Type", contentTypeByExt[ext] || "application/octet-stream");
  fs.createReadStream(filePath).pipe(res);
});
