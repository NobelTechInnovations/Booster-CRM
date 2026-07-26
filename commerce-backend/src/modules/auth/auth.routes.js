import { Router } from "express";
import bcrypt from "bcryptjs";
import { asyncHandler } from "../../utils/async-handler.js";
import { signAuthToken, requireAuth } from "../../middleware/auth.js";
import { HttpError } from "../../utils/http-error.js";
import {
  createCompanyOwner,
  findUserByEmailWithPassword,
  getOrCreateDevSession,
  getStoreMode,
  getUserAndCompany,
} from "../../repositories/store.js";
import { permissionsForRole } from "./permissions.js";

export const authRoutes = Router();

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    permissions: permissionsForRole(user.role),
  };
}

function requireField(value, label) {
  if (!String(value || "").trim()) {
    throw new HttpError(400, `${label} is required`);
  }
}

authRoutes.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const { companyName, name, email, password } = req.body;

    requireField(companyName, "Company name");
    requireField(name, "Name");
    requireField(email, "Email");
    requireField(password, "Password");

    if (String(password).length < 8) {
      throw new HttpError(400, "Password must be at least 8 characters");
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const result = await createCompanyOwner({
      companyName,
      name,
      email,
      passwordHash,
    });

    if (result.error) {
      throw new HttpError(409, result.error);
    }

    res.status(201).json({
      token: signAuthToken(result.user),
      store: getStoreMode(),
      user: publicUser(result.user),
      company: result.company,
    });
  }),
);

authRoutes.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    requireField(email, "Email");
    requireField(password, "Password");

    const user = await findUserByEmailWithPassword(email);
    if (!user || user.status !== "active") {
      throw new HttpError(401, "Invalid email or password");
    }

    const matches = await bcrypt.compare(String(password), user.passwordHash || "");
    if (!matches) {
      throw new HttpError(401, "Invalid email or password");
    }

    const { company } = await getUserAndCompany({
      userId: user._id,
      companyId: user.companyId,
    });

    res.json({
      token: signAuthToken(user),
      store: getStoreMode(),
      user: publicUser(user),
      company,
    });
  }),
);

authRoutes.post(
  "/dev-login",
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || "owner@sukirti.test").toLowerCase();
    const name = String(req.body.name || "Sukirti Owner");

    const { company, user } = await getOrCreateDevSession({ email, name });

    res.json({
      token: signAuthToken(user),
      store: getStoreMode(),
      user: publicUser(user),
      company,
    });
  }),
);

authRoutes.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { user, company } = await getUserAndCompany({
      userId: req.auth.sub,
      companyId: req.auth.companyId,
    });

    res.json({ user: user ? publicUser(user) : null, company, store: getStoreMode() });
  }),
);
