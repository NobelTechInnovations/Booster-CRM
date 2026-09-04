import mongoose from "mongoose";
import { isMongoConnected } from "../config/database.js";
import { Company } from "../models/company.model.js";
import { SyncedOrder } from "../models/synced-order.model.js";
import { memory, toNumber } from "./memory-store.js";
import { computeOrderStage } from "../utils/order-stage.js";

// SyncedOrder.companyId is declared Mixed (some records store it as a plain
// string, some as a real ObjectId — see the identical fix already applied
// throughout order.repo.js) so an equality match against a bare ObjectId
// silently matches nothing for the string-stored rows. Same $in-both-forms
// fix as everywhere else in this codebase.
export function companyIdFilter(companyId) {
  const str = String(companyId);
  return mongoose.Types.ObjectId.isValid(str) ? { $in: [str, new mongoose.Types.ObjectId(str)] } : str;
}

// No-auth, customer-facing order lookup — scoped by the company's own
// public slug (e.g. /track/sukirti-naturals) since this platform is
// multi-tenant: a bare phone number alone has no way to say which
// company's orders to search, and searching across every company would
// leak one seller's customer data into another's storefront. Every
// function here returns a deliberately narrow, hand-picked shape — never
// the raw SyncedOrder doc — so a public route can never leak manual
// discount notes, internal cost/margin data, or another customer's info.

// Phone numbers arrive in whatever shape the channel reported them in
// ("+919876543210", "919876543210", "9876543210", with spaces/dashes) —
// same normalize-to-candidates approach already used for WhatsApp/lead
// phone matching elsewhere in this codebase (see whatsapp.repo.js).
export function phoneCandidates(rawPhone) {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return [];
  const last10 = digits.slice(-10);
  return [...new Set([digits, last10, `91${last10}`, `+91${last10}`])];
}

// Exported for reuse by any other no-login, company-slug-scoped public
// surface (see public-support.repo.js) — same "which company" resolution
// every one of these needs, kept in exactly one place.
export async function getActiveCompanyBySlug(companySlug) {
  const slug = String(companySlug || "").toLowerCase().trim();
  if (!slug) return null;
  if (isMongoConnected()) {
    return Company.findOne({ slug, status: "active" }).lean();
  }
  for (const c of memory.companies.values()) {
    if (c.slug === slug && c.status !== "disabled") return c;
  }
  return null;
}

function publicOrderSummary(order) {
  const lineItems = order.lineItems || [];
  return {
    id: order._id,
    name: order.name,
    date: order.shopifyCreatedAt || order.createdAt,
    stage: computeOrderStage(order),
    itemCount: lineItems.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
    itemsPreview: lineItems.slice(0, 3).map((i) => i.title).filter(Boolean),
    totalPrice: toNumber(order.totalPrice),
    currency: order.currency || "INR",
    trackingNumber: order.trackingNumber || order.awbCode || "",
    trackingCompany: order.trackingCompany || order.shippingProvider || "",
  };
}

function publicOrderDetail(order) {
  return {
    ...publicOrderSummary(order),
    lineItems: (order.lineItems || []).map((i) => ({
      title: i.title,
      variantTitle: i.variantTitle || "",
      sku: i.sku || "",
      quantity: i.quantity,
      price: i.price,
    })),
    shippingAddress: order.shippingAddress
      ? {
          name: order.shippingAddress.name || order.customerName || "",
          address1: order.shippingAddress.address1 || "",
          address2: order.shippingAddress.address2 || "",
          city: order.shippingAddress.city || "",
          province: order.shippingAddress.province || "",
          country: order.shippingAddress.country || "",
          zip: order.shippingAddress.zip || "",
        }
      : null,
    trackingUrl: order.trackingUrl || order.labelUrl || "",
    isCOD: Boolean(order.isCOD),
    codAmount: toNumber(order.codAmount),
    markedFulfilledAt: order.markedFulfilledAt || null,
    deliveredAt: order.deliveredAt || null,
    cancelledAt: order.cancelledAt || null,
  };
}

// Just the brand identity (name + logo) for a store's public tracking
// page — no phone number needed, so the page can show the real brand
// immediately on load instead of only after a search. Same narrow,
// hand-picked shape as everywhere else in this file.
export async function getPublicCompanyBranding({ companySlug }) {
  const company = await getActiveCompanyBySlug(companySlug);
  if (!company) return { error: "not_found" };
  return { company: { name: company.name, slug: company.slug, logoUrl: company.logoUrl || "" } };
}

// Never returns drafts (isDraft:true) — a draft isn't a real, committed
// order yet, so a customer has no business seeing it on a public page.
// Phone or email — same "either one, whichever the customer has handy"
// flexibility as the support-ticket lookup (listPublicTicketsByContact).
export async function listPublicOrdersByContact({ companySlug, phone, email }) {
  const company = await getActiveCompanyBySlug(companySlug);
  if (!company) return { error: "not_found" };

  const candidates = phoneCandidates(phone);
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!candidates.length && !cleanEmail) return { error: "contact_required" };

  const or = [];
  if (candidates.length) or.push({ phone: { $in: candidates } }, { "shippingAddress.phone": { $in: candidates } });
  if (cleanEmail) or.push({ email: cleanEmail });

  let orders;
  if (isMongoConnected()) {
    orders = await SyncedOrder.find({
      companyId: companyIdFilter(company._id),
      isDraft: { $ne: true },
      $or: or,
    })
      .sort({ shopifyCreatedAt: -1 })
      .limit(100)
      .lean();
  } else {
    orders = [...memory.orders.values()].filter(
      (o) =>
        String(o.companyId) === String(company._id) &&
        !o.isDraft &&
        (candidates.includes(o.phone) || candidates.includes(o.shippingAddress?.phone) || (cleanEmail && o.email?.toLowerCase() === cleanEmail)),
    );
  }

  return {
    company: { name: company.name, slug: company.slug, logoUrl: company.logoUrl || "" },
    orders: orders.map(publicOrderSummary),
  };
}

// Re-validates the phone/email against the specific order (not just "some
// order in this company matched at list time") so an order id can never be
// opened without also knowing the contact it belongs to — a stolen or
// guessed order id alone reveals nothing.
export async function getPublicOrderDetail({ companySlug, phone, email, orderId }) {
  const company = await getActiveCompanyBySlug(companySlug);
  if (!company) return { error: "not_found" };

  const candidates = phoneCandidates(phone);
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!candidates.length && !cleanEmail) return { error: "contact_required" };

  let order;
  if (isMongoConnected()) {
    order = await SyncedOrder.findOne({ _id: orderId, companyId: companyIdFilter(company._id), isDraft: { $ne: true } }).lean();
  } else {
    order = [...memory.orders.values()].find(
      (o) => String(o._id) === String(orderId) && String(o.companyId) === String(company._id) && !o.isDraft,
    );
  }

  if (!order) return { error: "not_found" };
  const orderMatches =
    candidates.includes(order.phone) ||
    candidates.includes(order.shippingAddress?.phone) ||
    (cleanEmail && order.email?.toLowerCase() === cleanEmail);
  if (!orderMatches) return { error: "not_found" };

  return { company: { name: company.name, slug: company.slug, logoUrl: company.logoUrl || "" }, order: publicOrderDetail(order) };
}
