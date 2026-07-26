import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

export function signAuthToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      companyId: String(user.companyId),
      role: user.role,
    },
    env.jwtSecret,
    { expiresIn: "7d" },
  );
}

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  if (type !== "Bearer" || !token) {
    return next(new HttpError(401, "Missing bearer token"));
  }

  try {
    req.auth = jwt.verify(token, env.jwtSecret);
    return next();
  } catch (_error) {
    return next(new HttpError(401, "Invalid or expired token"));
  }
}
