import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { getSalesAnalytics, listRefundedOrders, listOrdersWithShippingCost, updateOrderShippingCost, updateOrderManualAdjustments, updateOrderConfirmation, updateOrderFulfillmentAssignment } from "../../repositories/order.repo.js";
import {
  createExpense,
  createPurchase,
  createVendor,
  deleteExpense,
  deletePurchase,
  deleteVendor,
  getExpensesByPartner,
  getFinanceSummary,
  getFinanceTrend,
  getUnitEconomics,
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
  "/unit-economics",
  asyncHandler(async (req, res) => {
    const economics = await getUnitEconomics({
      companyId: req.auth.companyId,
      from: req.query.from,
      to: req.query.to,
    });

    res.json({ economics });
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

// The order rows behind the "Refunded/Returned Revenue" KPI — lets that card
// drill into an actual table instead of just a bare total.
financeRoutes.get(
  "/refunds",
  asyncHandler(async (req, res) => {
    const orders = await listRefundedOrders({ companyId: req.auth.companyId, from: req.query.from, to: req.query.to });
    res.json({ orders });
  }),
);

// The order rows behind the "Shipping Cost" KPI — order-wise breakdown so
// it can be verified (and manually corrected/filled in for orders shipped
// outside this panel) instead of only trusting the auto-captured total.
financeRoutes.get(
  "/shipping-costs",
  asyncHandler(async (req, res) => {
    const orders = await listOrdersWithShippingCost({ companyId: req.auth.companyId, from: req.query.from, to: req.query.to });
    res.json({ orders });
  }),
);

financeRoutes.patch(
  "/orders/:orderId/shipping-cost",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateOrderShippingCost({ companyId: req.auth.companyId, orderId: req.params.orderId, shippingCost: req.body?.shippingCost });
    if (!result) throw new HttpError(404, "Order not found");
    if (result.error) throw new HttpError(400, result.error);
    res.json({ message: "Shipping cost updated", order: result });
  }),
);

financeRoutes.patch(
  "/orders/:orderId/adjustments",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateOrderManualAdjustments({
      companyId: req.auth.companyId,
      orderId: req.params.orderId,
      discount: req.body?.discount,
      extraCharge: req.body?.extraCharge,
      note: req.body?.note,
    });
    if (!result) throw new HttpError(404, "Order not found");
    res.json({ message: "Order adjustments updated", order: result });
  }),
);

financeRoutes.patch(
  "/orders/:orderId/confirmation",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateOrderConfirmation({ companyId: req.auth.companyId, orderId: req.params.orderId, status: req.body?.status });
    if (!result) throw new HttpError(404, "Order not found");
    if (result.error) throw new HttpError(400, result.error);
    res.json({ message: "Order confirmation updated", order: result });
  }),
);

financeRoutes.patch(
  "/orders/:orderId/fulfillment-assignment",
  requirePermission("finance:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateOrderFulfillmentAssignment({ companyId: req.auth.companyId, orderId: req.params.orderId, assigned: Boolean(req.body?.assigned) });
    if (!result) throw new HttpError(404, "Order not found");
    if (result.error) throw new HttpError(400, result.error);
    res.json({ message: "Order fulfillment assignment updated", order: result });
  }),
);

financeRoutes.get(
  "/trend",
  asyncHandler(async (req, res) => {
    const result = await getFinanceTrend({
      companyId: req.auth.companyId,
      from: req.query.from,
      to: req.query.to,
      groupBy: req.query.groupBy || "day",
    });

    res.json(result);
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

financeRoutes.get(
  "/expenses/by-partner",
  asyncHandler(async (req, res) => {
    const result = await getExpensesByPartner({
      companyId: req.auth.companyId,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(result);
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
