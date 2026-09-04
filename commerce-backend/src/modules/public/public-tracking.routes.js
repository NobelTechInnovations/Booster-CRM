import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { simpleRateLimit } from "../../utils/simple-rate-limit.js";
import { listPublicOrdersByContact, getPublicOrderDetail, getPublicCompanyBranding } from "../../repositories/public-tracking.repo.js";

// Deliberately no requireAuth anywhere in this file — this is the public,
// customer-facing "track my order" surface (see public-tracking.repo.js's
// own comment for why every response is a hand-picked shape, never a raw
// order doc). Rate-limited per IP since it's the one place in this API a
// stranger can search by phone number with no login at all.
export const publicTrackingRoutes = Router();

// 60/10min (bumped up from 30) — the order-detail page now silently polls
// itself every ~25s while open (see order-tracking-view.jsx) so it reflects
// a status change (e.g. shipped → delivered) without the customer having
// to refresh; the old 30/10min budget left no headroom for that on top of
// the initial branding/list/detail calls a normal visit already makes.
const trackingLimiter = simpleRateLimit({ windowMs: 10 * 60 * 1000, max: 60 });
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
    const { phone, email } = req.query;

    const result = await listPublicOrdersByContact({ companySlug, phone: phone ? String(phone) : "", email: email ? String(email) : "" });
    if (result.error === "not_found") throw new HttpError(404, "Store not found");
    if (result.error === "contact_required") throw new HttpError(400, "Enter a phone number or email");

    res.json(result);
  }),
);

publicTrackingRoutes.get(
  "/:companySlug/orders/:orderId",
  trackingLimiter,
  asyncHandler(async (req, res) => {
    const { companySlug, orderId } = req.params;
    const { phone, email } = req.query;

    const result = await getPublicOrderDetail({ companySlug, phone: phone ? String(phone) : "", email: email ? String(email) : "", orderId });
    if (result.error === "not_found") throw new HttpError(404, "Order not found");
    if (result.error === "contact_required") throw new HttpError(400, "Enter a phone number or email");

    res.json(result);
  }),
);
