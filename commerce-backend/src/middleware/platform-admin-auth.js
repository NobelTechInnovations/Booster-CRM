import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

// Deliberately separate from middleware/auth.js's signAuthToken/requireAuth
// — own secret (env.platformAdmin.jwtSecret), own payload shape, no
// companyId anywhere. A `kind` claim on top of the separate secret means
// even a token signed by both secrets accidentally matching could never be
// accepted as the wrong kind.
export function signPlatformAdminToken(admin) {
  return jwt.sign(
    { sub: String(admin._id), email: admin.email, kind: "platform_admin" },
    env.platformAdmin.jwtSecret,
    { expiresIn: "7d" },
  );
}

export function requirePlatformAdmin(req, _res, next) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  if (type !== "Bearer" || !token) {
    return next(new HttpError(401, "Missing bearer token"));
  }

  try {
    const decoded = jwt.verify(token, env.platformAdmin.jwtSecret);
    if (decoded.kind !== "platform_admin") {
      return next(new HttpError(401, "Invalid token"));
    }
    req.platformAdmin = decoded;
    return next();
  } catch (_error) {
    return next(new HttpError(401, "Invalid or expired token"));
  }
}
