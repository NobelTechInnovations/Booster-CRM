import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { simpleRateLimit } from "../../utils/simple-rate-limit.js";
import { listPublicOrdersByPhone, getPublicOrderDetail, getPublicCompanyBranding } from "../../repositories/public-tracking.repo.js";

// Deliberately no requireAuth anywhere in this file — this is the public,
// customer-facing "track my order" surface (see public-tracking.repo.js's
// own comment for why every response is a hand-picked shape, never a raw
// order doc). Rate-limited per IP since it's the one place in this API a
// stranger can search by phone number with no login at all.
export const publicTrackingRoutes = Router();

const trackingLimiter = simpleRateLimit({ windowMs: 10 * 60 * 1000, max: 30 });
// Looser than the phone-search limiter above — this loads once per page
// view with no phone number involved, so there's nothing sensitive to
// brute-force here, just the page's own branding.
const brandingLimiter = simpleRateLimit({ windowMs: 10 * 60 * 1000, max: 120 });

publicTrackingRoutes.get(
  "/:companySlug/branding",
  brandingLimiter,
  asyncHandler(async (req, res) => {
    const { companySlug } = req.params;
    const result = await getPublicCompanyBranding({ companySlug });
    if (result.error === "not_found") throw new HttpError(404, "Store not found");
    res.json(result);
  }),
);

publicTrackingRoutes.get(
  "/:companySlug/orders",
  trackingLimiter,
  asyncHandler(async (req, res) => {
    const { companySlug } = req.params;
    const { phone } = req.query;
    if (!phone) throw new HttpError(400, "Phone number is required");

    const result = await listPublicOrdersByPhone({ companySlug, phone: String(phone) });
    if (result.error === "not_found") throw new HttpError(404, "Store not found");
    if (result.error === "invalid_phone") throw new HttpError(400, "Enter a valid phone number");

    res.json(result);
  }),
);

publicTrackingRoutes.get(
  "/:companySlug/orders/:orderId",
  trackingLimiter,
  asyncHandler(async (req, res) => {
    const { companySlug, orderId } = req.params;
    const { phone } = req.query;
    if (!phone) throw new HttpError(400, "Phone number is required");

    const result = await getPublicOrderDetail({ companySlug, phone: String(phone), orderId });
    if (result.error === "not_found") throw new HttpError(404, "Order not found");
    if (result.error === "invalid_phone") throw new HttpError(400, "Enter a valid phone number");

    res.json(result);
  }),
);
