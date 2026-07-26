import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { getStoreMode } from "./repositories/store.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { channelRoutes } from "./modules/channels/channel.routes.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true,
    }),
  );
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "commerce-backend",
      phase: "phase-1-authentication",
      store: getStoreMode(),
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/channels", channelRoutes);

  app.use((req, res) => {
    res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
  });

  app.use((error, _req, res, _next) => {
    const statusCode = error.statusCode || 500;

    if (statusCode >= 500) {
      console.error(error);
    }

    res.status(statusCode).json({
      message: error.message || "Internal server error",
      details: error.details,
    });
  });

  return app;
}
