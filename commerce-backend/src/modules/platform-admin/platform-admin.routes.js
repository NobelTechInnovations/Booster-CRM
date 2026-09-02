import { Router } from "express";
import bcrypt from "bcryptjs";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { signPlatformAdminToken, requirePlatformAdmin } from "../../middleware/platform-admin-auth.js";
import {
  findPlatformAdminByEmail,
  touchPlatformAdminLogin,
  createPlatformAdmin,
  listPlatformAdmins,
  listPlans,
  createPlan,
  updatePlan,
  listAllCompaniesForAdmin,
  getCompanyForAdmin,
  updateCompanyStatus,
  updateCompanySubscription,
  adjustCompanyWallet,
} from "../../repositories/platform-admin.repo.js";
import { listAllPaymentTransactions, getFulfillmentEarnings } from "../../repositories/billing.repo.js";

export const platformAdminRoutes = Router();

function publicAdmin(admin) {
  return { id: admin._id, name: admin.name, email: admin.email, status: admin.status };
}

function requireField(value, label) {
  if (!String(value || "").trim()) throw new HttpError(400, `${label} is required`);
}

// ─── Auth — completely separate from /api/auth (company login). No public
// signup: the first admin comes from scripts/seed-platform-admin.js, every
// admin after that only via an already-authenticated admin. ────────────────

platformAdminRoutes.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    requireField(email, "Email");
    requireField(password, "Password");

    const admin = await findPlatformAdminByEmail(email);
    if (!admin || admin.status !== "active") throw new HttpError(401, "Invalid email or password");

    const matches = await bcrypt.compare(String(password), admin.passwordHash || "");
    if (!matches) throw new HttpError(401, "Invalid email or password");

    await touchPlatformAdminLogin(admin._id);

    res.json({ token: signPlatformAdminToken(admin), admin: publicAdmin(admin) });
  }),
);

platformAdminRoutes.get(
  "/auth/me",
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const admin = await findPlatformAdminByEmail(req.platformAdmin.email);
    if (!admin) throw new HttpError(404, "Admin not found");
    res.json({ admin: publicAdmin(admin) });
  }),
);

platformAdminRoutes.get(
  "/admins",
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const admins = await listPlatformAdmins();
    res.json({ admins: admins.map(publicAdmin) });
  }),
);

platformAdminRoutes.post(
  "/admins",
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    requireField(name, "Name");
    requireField(email, "Email");
    requireField(password, "Password");
    if (String(password).length < 8) throw new HttpError(400, "Password must be at least 8 characters");

    const passwordHash = await bcrypt.hash(String(password), 12);
    const result = await createPlatformAdmin({ name, email, passwordHash });
    if (result.error) throw new HttpError(409, result.error);

    res.status(201).json({ admin: publicAdmin(result.admin) });
  }),
);

// ─── Companies (cross-tenant) ────────────────────────────────────────────────

platformAdminRoutes.get(
  "/companies",
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const companies = await listAllCompaniesForAdmin();
    res.json({ companies });
  }),
);

platformAdminRoutes.get(
  "/companies/:id",
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const result = await getCompanyForAdmin(req.params.id);
    if (!result) throw new HttpError(404, "Company not found");
    res.json(result);
  }),
);

platformAdminRoutes.patch(
  "/companies/:id/status",
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const result = await updateCompanyStatus({ companyId: req.params.id, status: req.body?.status });
    if (result.error) throw new HttpError(400, result.error);
    if (!result.company) throw new HttpError(404, "Company not found");
    res.json({ company: result.company });
  }),
);

platformAdminRoutes.patch(
  "/companies/:id/subscription",
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const result = await updateCompanySubscription({
      companyId: req.params.id,
      planId: req.body?.planId,
      status: req.body?.status,
      trialEndsAt: req.body?.trialEndsAt,
      currentPeriodEnd: req.body?.currentPeriodEnd,
      seats: req.body?.seats,
      notes: req.body?.notes,
    });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ company: result.company });
  }),
);

platformAdminRoutes.patch(
  "/companies/:id/wallet",
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const result = await adjustCompanyWallet({
      companyId: req.params.id,
      amount: req.body?.amount,
      note: req.body?.note,
      type: req.body?.type,
      adminEmail: req.platformAdmin.email,
    });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ company: result.company, balanceAfter: result.balanceAfter });
  }),
);

// ─── Plans ───────────────────────────────────────────────────────────────────

platformAdminRoutes.get(
  "/plans",
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const plans = await listPlans();
    res.json({ plans });
  }),
);

platformAdminRoutes.post(
  "/plans",
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    requireField(req.body?.name, "Plan name");
    const plan = await createPlan(req.body || {});
    res.status(201).json({ plan });
  }),
);

platformAdminRoutes.patch(
  "/plans/:id",
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const plan = await updatePlan(req.params.id, req.body || {});
    if (!plan) throw new HttpError(404, "Plan not found");
    res.json({ plan });
  }),
);

// ─── Payments & earnings ─────────────────────────────────────────────────────

platformAdminRoutes.get(
  "/payments",
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const payments = await listAllPaymentTransactions();
    res.json({ payments });
  }),
);

platformAdminRoutes.get(
  "/earnings",
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const earnings = await getFulfillmentEarnings();
    res.json(earnings);
  }),
);
