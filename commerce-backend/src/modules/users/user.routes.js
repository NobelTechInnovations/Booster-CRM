import { Router } from "express";
import bcrypt from "bcryptjs";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { createCompanyUser, listCompanyUsers, updateCompanyUser, changeOwnPassword } from "../../repositories/store.js";
import { roles } from "../auth/permissions.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";

export const userRoutes = Router();

function requireField(value, label) {
  if (!String(value || "").trim()) {
    throw new HttpError(400, `${label} is required`);
  }
}

function assertRole(role) {
  if (!roles.includes(role)) {
    throw new HttpError(400, "Invalid role");
  }
}

userRoutes.get(
  "/",
  requireAuth,
  requirePermission("users:read"),
  asyncHandler(async (req, res) => {
    const users = await listCompanyUsers({
      companyId: req.auth.companyId,
      actorUserId: req.auth.sub,
    });
    res.json({ users, roles });
  }),
);

userRoutes.post(
  "/",
  requireAuth,
  requirePermission("users:manage"),
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;

    requireField(name, "Name");
    requireField(email, "Email");
    requireField(password, "Password");
    requireField(role, "Role");
    assertRole(role);

    if (String(password).length < 8) {
      throw new HttpError(400, "Password must be at least 8 characters");
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const result = await createCompanyUser({
      companyId: req.auth.companyId,
      invitedBy: req.auth.sub,
      name,
      email,
      passwordHash,
      role,
    });

    if (result.error) {
      throw new HttpError(409, result.error);
    }

    res.status(201).json({ user: result.user });
  }),
);

userRoutes.post(
  "/me/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    requireField(currentPassword, "Current password");
    requireField(newPassword, "New password");

    const result = await changeOwnPassword({
      userId: req.auth.sub,
      currentPassword,
      newPassword,
    });

    if (result.error) {
      throw new HttpError(400, result.error);
    }

    res.json({ success: true });
  }),
);

userRoutes.patch(
  "/:userId",
  requireAuth,
  requirePermission("users:manage"),
  asyncHandler(async (req, res) => {
    const role = req.body.role;
    const status = req.body.status;

    assertRole(role);

    if (!["active", "disabled"].includes(status)) {
      throw new HttpError(400, "Invalid status");
    }

    const result = await updateCompanyUser({
      companyId: req.auth.companyId,
      userId: req.params.userId,
      actorUserId: req.auth.sub,
      role,
      status,
    });

    if (result.error) {
      throw new HttpError(403, result.error);
    }

    if (!result.user) {
      throw new HttpError(404, "User not found");
    }

    res.json({ user: result.user });
  }),
);
