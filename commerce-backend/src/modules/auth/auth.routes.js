import { Router } from "express";
import bcrypt from "bcryptjs";
import { asyncHandler } from "../../utils/async-handler.js";
import { signAuthToken, requireAuth } from "../../middleware/auth.js";
import { HttpError } from "../../utils/http-error.js";
import {
  createCompanyOwner,
  findUserByEmailWithPassword,
  getOrCreateDevSession,
  getCompany,
  getStoreMode,
  getUserAndCompany,
  listUserCompanies,
  createAdditionalCompany,
  findUserForCompanySwitch,
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

// Tokens issued before the "email" claim was added to the JWT payload won't have
// req.auth.email — fall back to a DB lookup by userId so old sessions don't have
// to re-login just to use brand-switching.
async function resolveAuthEmail(req) {
  if (req.auth.email) return req.auth.email;
  const { user } = await getUserAndCompany({ userId: req.auth.sub, companyId: req.auth.companyId });
  return user?.email || "";
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

    const users = await findUserByEmailWithPassword(email);
    const activeUsers = users.filter((user) => user.status === "active");

    if (activeUsers.length === 0) {
      throw new HttpError(401, "Invalid email or password");
    }

    const matchingUsers = [];

    for (const user of activeUsers) {
      if (await bcrypt.compare(String(password), user.passwordHash || "")) {
        matchingUsers.push(user);
      }
    }

    if (matchingUsers.length === 0) {
      throw new HttpError(401, "Invalid email or password");
    }

    const requestedCompanyId = req.body.companyId ? String(req.body.companyId) : "";
    const user = requestedCompanyId
      ? matchingUsers.find((entry) => String(entry.companyId) === requestedCompanyId)
      : matchingUsers[0];

    if (matchingUsers.length > 1 && !requestedCompanyId) {
      const companies = await Promise.all(
        matchingUsers.map(async (entry) => {
          const company = await getCompany(entry.companyId);
          return {
            companyId: entry.companyId,
            companyName: company?.name,
            role: entry.role,
          };
        }),
      );

      return res.json({
        requiresCompanySelection: true,
        message: "Select a company to continue",
        companies,
      });
    }

    if (!user) {
      throw new HttpError(401, "Invalid company for this login");
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

// ─── Multi-brand: same login email, multiple companies ─────────────────────

authRoutes.get(
  "/companies",
  requireAuth,
  asyncHandler(async (req, res) => {
    const email = await resolveAuthEmail(req);
    const companies = await listUserCompanies(email);
    res.json({ companies });
  }),
);

authRoutes.post(
  "/companies",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { companyName } = req.body;
    requireField(companyName, "Brand name");

    const email = await resolveAuthEmail(req);
    if (!email) {
      throw new HttpError(401, "Your session is out of date — please log out and log back in.");
    }

    const result = await createAdditionalCompany({ email, companyName });

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
  "/switch-company",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { companyId } = req.body;
    requireField(companyId, "companyId");

    const email = await resolveAuthEmail(req);
    if (!email) {
      throw new HttpError(401, "Your session is out of date — please log out and log back in.");
    }

    const result = await findUserForCompanySwitch({ email, companyId });

    if (!result) {
      throw new HttpError(403, "You do not have access to this brand");
    }

    res.json({
      token: signAuthToken(result.user),
      store: getStoreMode(),
      user: publicUser(result.user),
      company: result.company,
    });
  }),
);
