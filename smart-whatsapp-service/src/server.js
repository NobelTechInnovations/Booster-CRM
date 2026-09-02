import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { router } from "./routes.js";
import { resumeAllSessions } from "./session-manager.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(router);

app.listen(config.port, () => {
  console.log(`[smart-whatsapp] listening on :${config.port}`);
  // Re-establishes every already-paired company's connection on startup —
  // otherwise a routine restart (a deploy, the host rebooting) would leave
  // every one of them silently disconnected until someone happened to hit
  // "connect" again in the panel.
  resumeAllSessions();
});
