import crypto from "node:crypto";
import { env } from "../config/env.js";

function base64Url(input) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function sign(payload) {
  return crypto.createHmac("sha256", env.jwtSecret).update(payload).digest("base64url");
}

export function createOauthState(data) {
  const payload = base64Url({
    ...data,
    nonce: crypto.randomBytes(16).toString("hex"),
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  return `${payload}.${sign(payload)}`;
}

export function readOauthState(state) {
  const [payload, signature] = String(state || "").split(".");

  if (!payload || !signature || sign(payload) !== signature) {
    throw new Error("Invalid OAuth state");
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

  if (!parsed.expiresAt || parsed.expiresAt < Date.now()) {
    throw new Error("Expired OAuth state");
  }

  return parsed;
}
