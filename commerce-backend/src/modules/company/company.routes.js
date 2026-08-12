import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import {
  getCompany,
  updateCompanyKyc,
  updateCompanyProfile,
  updateCompanyTaxSettings,
  updateCompanyNotificationSettings,
} from "../../repositories/store.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";

export const companyRoutes = Router();

companyRoutes.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const company = await getCompany(req.auth.companyId);

    if (!company) {
      throw new HttpError(404, "Company not found");
    }

    res.json({ company });
  }),
);

companyRoutes.put(
  "/",
  requireAuth,
  requirePermission("company:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateCompanyProfile({
      companyId: req.auth.companyId,
      payload: req.body,
    });

    if (result.error) {
      throw new HttpError(400, result.error);
    }

    res.json({ company: result.company });
  }),
);

companyRoutes.put(
  "/kyc",
  requireAuth,
  requirePermission("company:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateCompanyKyc({
      companyId: req.auth.companyId,
      payload: req.body,
    });

    if (result.error) {
      throw new HttpError(400, result.error);
    }

    res.json({ company: result.company });
  }),
);

companyRoutes.put(
  "/tax-settings",
  requireAuth,
  requirePermission("company:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateCompanyTaxSettings({
      companyId: req.auth.companyId,
      payload: req.body,
    });

    if (result.error) {
      throw new HttpError(400, result.error);
    }

    res.json({ company: result.company });
  }),
);

companyRoutes.put(
  "/notification-settings",
  requireAuth,
  requirePermission("company:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateCompanyNotificationSettings({
      companyId: req.auth.companyId,
      payload: req.body,
    });

    if (result.error) {
      throw new HttpError(400, result.error);
    }

    res.json({ company: result.company });
  }),
);
