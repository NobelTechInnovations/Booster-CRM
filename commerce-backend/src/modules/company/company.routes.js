import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import {
  getCompany,
  updateCompanyKyc,
  updateCompanyProfile,
  updateCompanyTaxSettings,
  updateCompanyNotificationSettings,
  updateCompanyLogo,
} from "../../repositories/store.js";
import { createDataExportRequest, getLatestDataExportRequest } from "../../repositories/data-export.repo.js";
import { streamCompanyBackup } from "../../repositories/backup.repo.js";
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

// Upload (or clear, with logoDataUrl: "") the brand logo shown across every
// public-facing surface — the no-auth order tracking page and invoices
// (PDF + print view). See updateCompanyLogo for the validation/size cap.
companyRoutes.put(
  "/logo",
  requireAuth,
  requirePermission("company:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateCompanyLogo({
      companyId: req.auth.companyId,
      logoDataUrl: req.body?.logoDataUrl,
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

// ─── Data export request → admin approval → download ────────────────────────
// A company can't self-serve export its own data unrestricted — it asks,
// a platform admin reviews and approves (see platform-admin.routes.js's
// /data-export-requests/:id/approve), and only then does the download
// route below actually stream anything.

companyRoutes.post(
  "/data-export/request",
  requireAuth,
  requirePermission("company:manage"),
  asyncHandler(async (req, res) => {
    const request = await createDataExportRequest({ companyId: req.auth.companyId, userId: req.auth.sub });
    res.status(201).json({ request });
  }),
);

companyRoutes.get(
  "/data-export",
  requireAuth,
  asyncHandler(async (req, res) => {
    const request = await getLatestDataExportRequest(req.auth.companyId);
    res.json({ request });
  }),
);

companyRoutes.get(
  "/data-export/download",
  requireAuth,
  requirePermission("company:manage"),
  asyncHandler(async (req, res) => {
    const request = await getLatestDataExportRequest(req.auth.companyId);
    if (!request || request.status !== "approved") {
      throw new HttpError(403, "No approved data export yet — request one and wait for a platform admin to approve it.");
    }
    const filename = `wokbook-my-data-${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await streamCompanyBackup(req.auth.companyId, res);
  }),
);
