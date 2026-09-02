import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import {
  listOfferablePlans,
  getMyBilling,
  startWalletRecharge,
  startPlanUpgrade,
  verifyCheckout,
  handleWebhook,
} from "./billing.service.js";

export const billingRoutes = Router();

// Company-facing — every route here reads/writes only req.auth.companyId,
// never another company's data. Deliberately separate from
// /api/platform-admin, which is the cross-tenant admin surface.

billingRoutes.get(
  "/plans",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const plans = await listOfferablePlans();
    res.json({ plans });
  }),
);

billingRoutes.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await getMyBilling({ companyId: req.auth.companyId });
    res.json(result);
  }),
);

billingRoutes.post(
  "/wallet/recharge",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await startWalletRecharge({ companyId: req.auth.companyId, amount: req.body?.amount, userEmail: req.auth.email });
    res.json(result);
  }),
);

billingRoutes.post(
  "/upgrade",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.body?.planId) throw new HttpError(400, "planId is required");
    const result = await startPlanUpgrade({ companyId: req.auth.companyId, planId: req.body.planId, userEmail: req.auth.email });
    res.json(result);
  }),
);

billingRoutes.post(
  "/verify",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await verifyCheckout({
      companyId: req.auth.companyId,
      razorpayOrderId: req.body?.razorpayOrderId,
      razorpayPaymentId: req.body?.razorpayPaymentId,
      razorpaySignature: req.body?.razorpaySignature,
    });
    res.json(result);
  }),
);

// Public — Razorpay's own server calling in, verified by signature over the
// raw body (req.rawBody is already captured globally in app.js's
// express.json() verify callback), not by auth header.
billingRoutes.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    await handleWebhook({ rawBody: req.rawBody, signature: req.headers["x-razorpay-signature"] });
    res.json({ ok: true });
  }),
);
