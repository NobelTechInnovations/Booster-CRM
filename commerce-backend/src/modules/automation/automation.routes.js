import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireFeature } from "../../middleware/feature-gate.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import {
  listAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  toggleAutomationRule,
  deleteAutomationRule,
  recordAutomationRun,
  BUILT_IN_TRIGGERS,
} from "../../repositories/automation.repo.js";

export const automationRoutes = Router();

automationRoutes.use(requireAuth);
automationRoutes.use(requireFeature("automation"));

// The known trigger keys, for the Automation page's trigger picker — a
// company can still type its own custom name instead (see
// automation-rule.model.js's own comment on why trigger isn't a hard enum).
automationRoutes.get(
  "/triggers",
  asyncHandler(async (_req, res) => {
    res.json({ triggers: BUILT_IN_TRIGGERS });
  }),
);

automationRoutes.get(
  "/rules",
  asyncHandler(async (req, res) => {
    const rules = await listAutomationRules(req.auth.companyId);
    res.json({ rules });
  }),
);

automationRoutes.post(
  "/rules",
  asyncHandler(async (req, res) => {
    const result = await createAutomationRule({
      companyId: req.auth.companyId,
      createdBy: req.auth.sub,
      payload: req.body,
    });
    if (result.error) throw new HttpError(400, result.error);
    res.status(201).json({ rule: result.rule });
  }),
);

automationRoutes.patch(
  "/rules/:ruleId",
  asyncHandler(async (req, res) => {
    const result = await updateAutomationRule({
      companyId: req.auth.companyId,
      ruleId: req.params.ruleId,
      payload: req.body,
    });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ rule: result.rule });
  }),
);

automationRoutes.patch(
  "/rules/:ruleId/toggle",
  asyncHandler(async (req, res) => {
    const result = await toggleAutomationRule({
      companyId: req.auth.companyId,
      ruleId: req.params.ruleId,
      isActive: Boolean(req.body.isActive),
    });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ rule: result.rule });
  }),
);

automationRoutes.post(
  "/rules/:ruleId/run",
  asyncHandler(async (req, res) => {
    const result = await recordAutomationRun({ companyId: req.auth.companyId, ruleId: req.params.ruleId });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ rule: result.rule });
  }),
);

automationRoutes.delete(
  "/rules/:ruleId",
  asyncHandler(async (req, res) => {
    const result = await deleteAutomationRule({ companyId: req.auth.companyId, ruleId: req.params.ruleId });
    res.json({ rule: result.rule });
  }),
);
