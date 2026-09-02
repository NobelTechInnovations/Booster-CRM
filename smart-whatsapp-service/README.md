# Smart WhatsApp service

A small, standalone, **always-on** Node service that connects a real
WhatsApp number by pairing with it the same way WhatsApp Web does (scan a
QR code from the phone's own WhatsApp app), instead of going through Meta's
official Cloud API. It bridges those messages to the main Wokbook backend
(`commerce-backend`) over a private HTTP API.

## Why this is a separate service, not part of commerce-backend

commerce-backend runs on Vercel as **serverless functions** — each request
spins up, runs, and shuts down. A WhatsApp Web session needs a **live
WebSocket connection held open 24/7**; a serverless function architecturally
cannot do that. This service is a plain, long-running Node process instead,
and needs a host with a persistent process and a persistent disk — a VPS
(e.g. Hostinger VPS) or any "Node.js app hosting" plan that doesn't idle the
app after inactivity.

## ⚠️ This is unofficial

Unlike the Cloud API integration elsewhere in this app, this connects the
way third-party "WhatsApp Web automation" tools do — it is **not** an
officially sanctioned way to send/receive WhatsApp messages programmatically,
and using it carries a real risk that WhatsApp flags or bans the connected
number. Use a number you're comfortable with that risk on. This was built
at the explicit request of, and with that risk accepted by, the account
owner — see the conversation this shipped in for that decision.

## Setup

```bash
cd smart-whatsapp-service
npm install
cp .env.example .env
# edit .env: set SMART_WHATSAPP_SHARED_SECRET to a long random string,
# and BACKEND_URL to wherever commerce-backend is actually reachable.
npm start
```

Then, in commerce-backend's own `.env`, add the **same** secret:

```
SMART_WHATSAPP_SERVICE_URL=https://your-host:5200
SMART_WHATSAPP_SHARED_SECRET=<the same long random string>
```

## Running it permanently (VPS)

Don't just run `npm start` in a terminal — it'll die the moment you
disconnect. Use a process manager so it survives reboots and crashes:

```bash
npm install -g pm2
pm2 start src/server.js --name smart-whatsapp
pm2 save
pm2 startup   # follow the one-time instructions it prints, then re-run: pm2 save
```

`pm2 logs smart-whatsapp` shows what it's doing; `pm2 restart smart-whatsapp`
picks up a code update after you `git pull`.

## What actually needs to survive across restarts

The `sessions/` folder (path set by `SESSIONS_DIR`) holds each connected
company's WhatsApp Web login. If it's deleted or the disk isn't persistent
(some low-tier "Node app hosting" plans wipe the filesystem on redeploy),
every company connected here has to re-scan the QR code from scratch. A
real VPS's disk is persistent by default; if using a managed Node hosting
plan instead, confirm its filesystem survives redeploys before relying on
it here.

## API (all routes except `/health` require the shared secret)

Every request (except `/health`) must include:

```
x-smart-whatsapp-secret: <SMART_WHATSAPP_SHARED_SECRET>
```

- `POST /sessions/:companyId/start` — begins pairing (or resumes an
  existing one). Poll `GET .../status` afterwards for the QR code.
- `GET /sessions/:companyId/status` — `{ status, qr, phoneNumber }`.
  `status` is one of `disconnected`, `connecting`, `qr`, `open`, `close`,
  `logged_out`. `qr` is a data-URL PNG, present only while `status: "qr"`.
- `POST /sessions/:companyId/logout` — unlinks the number and wipes its
  saved credentials (the company will need to scan a fresh QR to
  reconnect).
- `POST /sessions/:companyId/send` — `{ to, text, mediaUrl?, mediaType? }`.
- `GET /sessions/:companyId/media/:messageId` — streams back a
  previously-received inbound attachment.

This service pushes to commerce-backend's `POST /api/smart-whatsapp/webhook`
(authenticated with the same shared secret) whenever a message arrives or a
session's connection status changes — commerce-backend never has to poll
this service for that.
