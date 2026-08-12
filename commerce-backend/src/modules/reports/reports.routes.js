import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { generateReport, REPORT_TYPES } from "../../repositories/reports.repo.js";

export const reportsRoutes = Router();

reportsRoutes.use(requireAuth);

reportsRoutes.get(
  "/types",
  asyncHandler(async (_req, res) => {
    res.json({ types: REPORT_TYPES });
  }),
);

reportsRoutes.get(
  "/:type",
  asyncHandler(async (req, res) => {
    const report = await generateReport({
      type: req.params.type,
      companyId: req.auth.companyId,
      from: req.query.from,
      to: req.query.to,
    });

    if (!report) {
      throw new HttpError(404, `Unknown report type: ${req.params.type}`);
    }

    res.json({ report });
  }),
);
