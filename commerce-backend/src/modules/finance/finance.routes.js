import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { getSalesAnalytics } from "../../repositories/order.repo.js";
import {
  createExpense,
  createPurchase,
  createVendor,
  deleteExpense,
  deletePurchase,
  deleteVendor,
  getFinanceSummary,
  listExpenses,
  listPurchases,
  listVendors,
  updateExpense,
  updatePurchase,
  updateVendor,
} from "../../repositories/finance.repo.js";

export const financeRoutes = Router();

financeRoutes.use(requireAuth);

// ─── Summary & Analytics ─────────────────────────────────────────────────────

financeRoutes.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const summary = await getFinanceSummary({
      companyId: req.auth.companyId,
      from: req.query.from,
      to: req.query.to,
    });

    res.json({ summary });
  }),
);

financeRoutes.get(
  "/sales-analytics",
  asyncHandler(async (req, res) => {
    const analytics = await getSalesAnalytics({
      companyId: req.auth.companyId,
      from: req.query.from,
      to: req.query.to,
      groupBy: req.query.groupBy || "day",
      channelId: req.query.channelId,
    });

    res.json({ analytics });
  }),
);

// ─── Vendors ─────────────────────────────────────────────────────────────────

financeRoutes.get(
  "/vendors",
  asyncHandler(async (req, res) => {
    const vendors = await listVendors(req.auth.companyId);
    res.json({ vendors });
  }),
);

financeRoutes.post(
  "/vendors",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await createVendor({ companyId: req.auth.companyId, payload: req.body || {} });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ message: "Vendor created", vendor: result.vendor });
  }),
);

financeRoutes.patch(
  "/vendors/:vendorId",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateVendor({ companyId: req.auth.companyId, vendorId: req.params.vendorId, payload: req.body || {} });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ message: "Vendor updated", vendor: result.vendor });
  }),
);

financeRoutes.delete(
  "/vendors/:vendorId",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await deleteVendor({ companyId: req.auth.companyId, vendorId: req.params.vendorId });
    if (!result.vendor) throw new HttpError(404, "Vendor not found");
    res.json({ message: "Vendor removed", vendor: result.vendor });
  }),
);

// ─── Purchases (raw material / packaging) ────────────────────────────────────

financeRoutes.get(
  "/purchases",
  asyncHandler(async (req, res) => {
    const purchases = await listPurchases({
      companyId: req.auth.companyId,
      from: req.query.from,
      to: req.query.to,
      vendorId: req.query.vendorId,
    });
    res.json({ purchases });
  }),
);

financeRoutes.post(
  "/purchases",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await createPurchase({ companyId: req.auth.companyId, payload: req.body || {} });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ message: "Purchase recorded", purchase: result.purchase });
  }),
);

financeRoutes.patch(
  "/purchases/:purchaseId",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await updatePurchase({ companyId: req.auth.companyId, purchaseId: req.params.purchaseId, payload: req.body || {} });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ message: "Purchase updated", purchase: result.purchase });
  }),
);

financeRoutes.delete(
  "/purchases/:purchaseId",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await deletePurchase({ companyId: req.auth.companyId, purchaseId: req.params.purchaseId });
    if (!result.purchase) throw new HttpError(404, "Purchase not found");
    res.json({ message: "Purchase removed", purchase: result.purchase });
  }),
);

// ─── Expenses ────────────────────────────────────────────────────────────────

financeRoutes.get(
  "/expenses",
  asyncHandler(async (req, res) => {
    const expenses = await listExpenses({
      companyId: req.auth.companyId,
      from: req.query.from,
      to: req.query.to,
      category: req.query.category,
    });
    res.json({ expenses });
  }),
);

financeRoutes.post(
  "/expenses",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await createExpense({ companyId: req.auth.companyId, payload: req.body || {}, createdBy: req.auth.sub });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ message: "Expense recorded", expense: result.expense });
  }),
);

financeRoutes.patch(
  "/expenses/:expenseId",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateExpense({ companyId: req.auth.companyId, expenseId: req.params.expenseId, payload: req.body || {} });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ message: "Expense updated", expense: result.expense });
  }),
);

financeRoutes.delete(
  "/expenses/:expenseId",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await deleteExpense({ companyId: req.auth.companyId, expenseId: req.params.expenseId });
    if (!result.expense) throw new HttpError(404, "Expense not found");
    res.json({ message: "Expense removed", expense: result.expense });
  }),
);
