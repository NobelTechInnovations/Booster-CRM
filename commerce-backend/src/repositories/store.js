import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { isMongoConnected } from "../config/database.js";
import { Channel } from "../models/channel.model.js";
import { Company } from "../models/company.model.js";
import { ProductMapping } from "../models/product-mapping.model.js";
import { SyncedCustomer } from "../models/synced-customer.model.js";
import { SyncedOrder } from "../models/synced-order.model.js";
import { SyncedProduct } from "../models/synced-product.model.js";
import { User } from "../models/user.model.js";
import { Shipment } from "../models/shipment.model.js";
import { Warehouse } from "../models/warehouse.model.js";
import { upsertWarehouseRecord, listWarehouses as listWarehousesRepo } from "./warehouse.repo.js";
import { assertLimitNotExceeded } from "../utils/feature-gate.js";

const memory = {
  companies: new Map(),
  users: new Map(),
  channels: new Map(),
  orders: new Map(),
  products: new Map(),
  customers: new Map(),
  productMappings: new Map(),
  warehouses: new Map(),
  shipments: new Map(),
};

function id() {
  return crypto.randomUUID();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function withoutCredentials(channel) {
  if (!channel) return channel;
  const copy = clone(channel);
  copy.id = copy._id;
  delete copy.credentials;
  return copy;
}

function publicUser(user, { actorUserId, company } = {}) {
  if (!user) return user;
  const copy = clone(user);
  copy.id = copy._id;
  copy.isSelf = actorUserId ? String(copy._id) === String(actorUserId) : false;
  copy.isPrimaryOwner = company?.ownerUserId ? String(copy._id) === String(company.ownerUserId) : false;
  copy.canEdit = !copy.isSelf && !copy.isPrimaryOwner;
  delete copy.passwordHash;
  return copy;
}

function toDate(value) {
  return value ? new Date(value) : undefined;
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function fullName(...parts) {
  return parts.filter(Boolean).join(" ").trim();
}

function normalizeOrder({ companyId, channelId, provider, shop, order }) {
  const customer = order.customer || {};
  const shippingAddress = order.shipping_address || {};
  const customerName = fullName(customer.first_name, customer.last_name) || shippingAddress.name || order.email || "Guest customer";

  return {
    companyId,
    channelId,
    provider,
    shop,
    externalId: String(order.id),
    name: order.name,
    orderNumber: order.order_number,
    email: order.email || customer.email,
    phone: order.phone || customer.phone || shippingAddress.phone,
    customerExternalId: customer.id ? String(customer.id) : undefined,
    customerName,
    financialStatus: order.financial_status,
    fulfillmentStatus: order.fulfillment_status || "unfulfilled",
    note: order.note,
    tags: String(order.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    currency: order.currency || order.presentment_currency,
    totalPrice: toNumber(order.total_price),
    subtotalPrice: toNumber(order.subtotal_price),
    totalTax: toNumber(order.total_tax),
    paymentGatewayNames: order.payment_gateway_names || [],
    lineItems: (order.line_items || []).map((item) => ({
      externalId: item.id ? String(item.id) : undefined,
      productExternalId: item.product_id ? String(item.product_id) : undefined,
      variantExternalId: item.variant_id ? String(item.variant_id) : undefined,
      title: item.title,
      sku: item.sku,
      quantity: item.quantity,
      price: toNumber(item.price),
    })),
    shippingAddress: {
      name: shippingAddress.name,
      city: shippingAddress.city,
      province: shippingAddress.province,
      country: shippingAddress.country,
      zip: shippingAddress.zip,
    },
    shopifyCreatedAt: toDate(order.created_at),
    processedAt: toDate(order.processed_at),
    cancelledAt: toDate(order.cancelled_at),
    raw: order,
  };
}

function normalizeProduct({ companyId, channelId, provider, shop, product }) {
  const variants = product.variants || [];

  return {
    companyId,
    channelId,
    provider,
    shop,
    externalId: String(product.id),
    title: product.title,
    handle: product.handle,
    status: product.status,
    vendor: product.vendor,
    productType: product.product_type,
    tags: String(product.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    imageUrl: product.image?.src || product.images?.[0]?.src,
    totalInventory: variants.reduce((total, variant) => total + toNumber(variant.inventory_quantity), 0),
    variants: variants.map((variant) => ({
      externalId: variant.id ? String(variant.id) : undefined,
      title: variant.title,
      sku: variant.sku,
      price: toNumber(variant.price),
      inventoryQuantity: toNumber(variant.inventory_quantity),
      barcode: variant.barcode,
    })),
    shopifyCreatedAt: toDate(product.created_at),
    shopifyUpdatedAt: toDate(product.updated_at),
    publishedAt: toDate(product.published_at),
    raw: product,
  };
}

function normalizeCustomer({ companyId, channelId, provider, shop, customer }) {
  const defaultAddress = customer.default_address || {};
  const name = fullName(customer.first_name, customer.last_name) || customer.email || customer.phone || "Shopify customer";

  return {
    companyId,
    channelId,
    provider,
    shop,
    externalId: String(customer.id),
    email: customer.email,
    phone: customer.phone,
    firstName: customer.first_name,
    lastName: customer.last_name,
    name,
    state: customer.state,
    tags: String(customer.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    note: customer.note,
    ordersCount: toNumber(customer.orders_count),
    totalSpent: toNumber(customer.total_spent),
    currency: customer.currency,
    defaultAddress: {
      address1: defaultAddress.address1,
      address2: defaultAddress.address2,
      city: defaultAddress.city,
      province: defaultAddress.province,
      country: defaultAddress.country,
      zip: defaultAddress.zip,
    },
    shopifyCreatedAt: toDate(customer.created_at),
    shopifyUpdatedAt: toDate(customer.updated_at),
    raw: customer,
  };
}

function normalizeAmazonOrder({ companyId, channelId, shop, order }) {
  const buyer = order.BuyerInfo || {};
  const shippingAddress = order.ShippingAddress || {};
  const orderTotal = order.OrderTotal || {};
  const purchaseDate = toDate(order.PurchaseDate);
  const isCanceled = order.OrderStatus === "Canceled";
  const isFulfilled = ["Shipped", "PartiallyShipped"].includes(order.OrderStatus);

  return {
    companyId,
    channelId,
    provider: "amazon",
    shop,
    externalId: String(order.AmazonOrderId),
    name: order.AmazonOrderId,
    email: buyer.BuyerEmail,
    phone: shippingAddress.Phone,
    customerExternalId: buyer.BuyerEmail || buyer.BuyerName || order.AmazonOrderId,
    customerName: buyer.BuyerName || buyer.BuyerEmail || "Amazon customer",
    financialStatus: isCanceled ? "voided" : order.OrderStatus === "Pending" ? "pending" : "paid",
    fulfillmentStatus: isCanceled ? "cancelled" : isFulfilled ? "fulfilled" : "unfulfilled",
    tags: [order.SalesChannel, order.FulfillmentChannel, order.OrderType].filter(Boolean),
    currency: orderTotal.CurrencyCode || order.BuyerTaxInfo?.CurrencyCode,
    totalPrice: toNumber(orderTotal.Amount),
    subtotalPrice: toNumber(orderTotal.Amount),
    totalTax: 0,
    paymentGatewayNames: [order.PaymentMethod].filter(Boolean),
    lineItems: [],
    shippingAddress: {
      name: shippingAddress.Name,
      city: shippingAddress.City,
      province: shippingAddress.StateOrRegion,
      country: shippingAddress.CountryCode,
      zip: shippingAddress.PostalCode,
    },
    shopifyCreatedAt: purchaseDate,
    processedAt: purchaseDate,
    cancelledAt: isCanceled ? toDate(order.LastUpdateDate) || purchaseDate : undefined,
    raw: order,
  };
}

function normalizeAmazonCustomer({ companyId, channelId, shop, order }) {
  const buyer = order.BuyerInfo || {};
  const shippingAddress = order.ShippingAddress || {};
  const externalId = buyer.BuyerEmail || buyer.BuyerName || order.AmazonOrderId;

  return {
    companyId,
    channelId,
    provider: "amazon",
    shop,
    externalId: String(externalId),
    email: buyer.BuyerEmail,
    phone: shippingAddress.Phone,
    name: buyer.BuyerName || buyer.BuyerEmail || "Amazon customer",
    state: order.OrderStatus,
    tags: [order.SalesChannel, order.FulfillmentChannel].filter(Boolean),
    ordersCount: 1,
    totalSpent: toNumber(order.OrderTotal?.Amount),
    currency: order.OrderTotal?.CurrencyCode,
    defaultAddress: {
      city: shippingAddress.City,
      province: shippingAddress.StateOrRegion,
      country: shippingAddress.CountryCode,
      zip: shippingAddress.PostalCode,
    },
    shopifyCreatedAt: toDate(order.PurchaseDate),
    shopifyUpdatedAt: toDate(order.LastUpdateDate),
    raw: order,
  };
}

function normalizeAmazonProduct({ companyId, channelId, shop, listing }) {
  const summary = listing.summaries?.[0] || {};
  const offer = listing.offers?.[0] || {};
  const availability = listing.fulfillmentAvailability?.[0] || {};
  const price = offer.price?.amount ?? offer.listingPrice?.amount;
  const sku = listing.sku || summary.sellerSku || listing.attributes?.merchant_suggested_asin?.[0]?.value;
  const title = summary.itemName || listing.attributes?.item_name?.[0]?.value || sku || "Amazon listing";
  const imageUrl = summary.mainImage?.link || summary.mainImage?.url;

  return {
    companyId,
    channelId,
    provider: "amazon",
    shop,
    externalId: String(sku || summary.asin || listing.asin),
    title,
    handle: summary.asin || listing.asin,
    status: Array.isArray(summary.status) ? summary.status.join(", ") : summary.status,
    vendor: summary.brandName || listing.attributes?.brand?.[0]?.value,
    productType: summary.productType || listing.productType,
    tags: [summary.asin || listing.asin, summary.fulfillmentChannelCode].filter(Boolean),
    imageUrl,
    totalInventory: toNumber(availability.quantity),
    variants: [
      {
        externalId: String(sku || summary.asin || listing.asin),
        title,
        sku: sku || "",
        price: toNumber(price),
        inventoryQuantity: toNumber(availability.quantity),
      },
    ],
    shopifyCreatedAt: toDate(summary.createdDate),
    shopifyUpdatedAt: toDate(summary.lastUpdatedDate) || new Date(),
    publishedAt: toDate(summary.createdDate),
    raw: listing,
  };
}

function cleanCompanyPayload(payload) {
  return {
    name: String(payload.name || "").trim(),
    legalName: String(payload.legalName || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    phone: String(payload.phone || "").trim(),
    website: String(payload.website || "").trim(),
    businessType: String(payload.businessType || "").trim(),
    gstin: String(payload.gstin || "").trim().toUpperCase(),
    pan: String(payload.pan || "").trim().toUpperCase(),
    address: {
      line1: String(payload.address?.line1 || "").trim(),
      line2: String(payload.address?.line2 || "").trim(),
      city: String(payload.address?.city || "").trim(),
      state: String(payload.address?.state || "").trim(),
      pincode: String(payload.address?.pincode || "").trim(),
      country: String(payload.address?.country || "India").trim(),
    },
  };
}

function cleanKycPayload(payload) {
  return {
    legalName: String(payload.legalName || "").trim(),
    gstin: String(payload.gstin || "").trim().toUpperCase(),
    pan: String(payload.pan || "").trim().toUpperCase(),
    registeredAddress: String(payload.registeredAddress || "").trim(),
    bankAccountName: String(payload.bankAccountName || "").trim(),
    bankAccountNumber: String(payload.bankAccountNumber || "").trim(),
    ifsc: String(payload.ifsc || "").trim().toUpperCase(),
  };
}

function ensureDevCompany() {
  const slug = "sukirti-naturals";
  const existing = [...memory.companies.values()].find((company) => company.slug === slug);

  if (existing) return existing;

  const company = {
    _id: id(),
    name: "Sukirti Naturals",
    slug,
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  };

  memory.companies.set(company._id, company);
  return company;
}

export function getStoreMode() {
  return isMongoConnected() ? "mongodb" : "memory";
}

export async function getOrCreateDevSession({ email, name }) {
  if (isMongoConnected()) {
    const company = await Company.findOneAndUpdate(
      { slug: "sukirti-naturals" },
      { $setOnInsert: { name: "Sukirti Naturals", slug: "sukirti-naturals" } },
      { returnDocument: "after", upsert: true },
    );

    const user = await User.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          companyId: company._id,
          email,
          name,
          passwordHash: "dev-login-no-password",
          role: "Owner",
        },
      },
      { new: true, upsert: true },
    );

    return { company, user };
  }

  const company = ensureDevCompany();
  const existing = [...memory.users.values()].find((user) => user.email === email);

  if (existing) {
    return { company, user: existing };
  }

  const user = {
    _id: id(),
    companyId: company._id,
    email,
    name,
    role: "Owner",
    passwordHash: "dev-login-no-password",
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  };

  memory.users.set(user._id, user);
  return { company, user };
}

export async function createCompanyOwner({ companyName, name, email, passwordHash }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCompanyName = String(companyName || "").trim();
  const slugBase = slugify(normalizedCompanyName);

  if (isMongoConnected()) {
    let slug = slugBase;
    let suffix = 1;
    while (await Company.findOne({ slug }).lean()) {
      suffix += 1;
      slug = `${slugBase}-${suffix}`;
    }

    const company = await Company.create({
      name: normalizedCompanyName,
      slug,
    });

    const user = await User.create({
      companyId: company._id,
      name,
      email: normalizedEmail,
      passwordHash,
      role: "Owner",
    });

    company.ownerUserId = user._id;
    await company.save();

    return { company, user };
  }

  let slug = slugBase;
  let suffix = 1;
  while ([...memory.companies.values()].some((company) => company.slug === slug)) {
    suffix += 1;
    slug = `${slugBase}-${suffix}`;
  }

  const company = {
    _id: id(),
    name: normalizedCompanyName,
    slug,
    ownerUserId: null,
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  };
  memory.companies.set(company._id, company);

  const user = {
    _id: id(),
    companyId: company._id,
    email: normalizedEmail,
    name,
    role: "Owner",
    passwordHash,
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  };
  memory.users.set(user._id, user);
  company.ownerUserId = user._id;
  company.updatedAt = now();

  return { company, user };
}

export async function findUserByEmailWithPassword(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (isMongoConnected()) {
    return User.find({ email: normalizedEmail }).select("+passwordHash").lean();
  }

  return [...memory.users.values()].filter((entry) => entry.email === normalizedEmail).map(clone);
}

export async function getUserAndCompany({ userId, companyId }) {
  if (isMongoConnected()) {
    const user = await User.findById(userId).lean();
    const company = await Company.findById(companyId).lean();
    return { user, company };
  }

  return {
    user: clone(memory.users.get(userId) || null),
    company: clone(memory.companies.get(companyId) || null),
  };
}

export async function getCompany(companyId) {
  if (isMongoConnected()) {
    return Company.findById(companyId).lean();
  }

  return clone(memory.companies.get(companyId) || null);
}

// ─── Multi-brand support ────────────────────────────────────────────────────
// Same login email can own multiple companies (brands). Each User document
// pairs one email with one companyId (see the {companyId, email} unique index
// on the User model) — so "adding a brand" just creates a new Company plus a
// new User row for the same email, and "switching" re-issues a JWT for a
// different companyId the email already has a User row for.

export async function listUserCompanies(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (isMongoConnected()) {
    const users = await User.find({ email: normalizedEmail, status: "active" }).lean();
    if (!users.length) return [];
    const companies = await Company.find({ _id: { $in: users.map((u) => u.companyId) } }).lean();
    const companyMap = new Map(companies.map((c) => [String(c._id), c]));
    return users.map((u) => ({
      companyId: String(u.companyId),
      companyName: companyMap.get(String(u.companyId))?.name || "Unknown",
      role: u.role,
    }));
  }

  return [...memory.users.values()]
    .filter((u) => u.email === normalizedEmail && u.status !== "disabled")
    .map((u) => ({
      companyId: String(u.companyId),
      companyName: memory.companies.get(u.companyId)?.name || "Unknown",
      role: u.role,
    }));
}

export async function createAdditionalCompany({ email, companyName }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const existingUsers = await findUserByEmailWithPassword(normalizedEmail);

  if (!existingUsers.length) {
    return { error: "No existing account found for this email" };
  }

  const primary = existingUsers[0];
  return createCompanyOwner({
    companyName,
    name: primary.name,
    email: normalizedEmail,
    passwordHash: primary.passwordHash,
  });
}

export async function findUserForCompanySwitch({ email, companyId }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (isMongoConnected()) {
    const user = await User.findOne({ email: normalizedEmail, companyId, status: "active" }).lean();
    if (!user) return null;
    const company = await Company.findById(companyId).lean();
    return { user, company };
  }

  const user = [...memory.users.values()].find(
    (u) => u.email === normalizedEmail && String(u.companyId) === String(companyId) && u.status !== "disabled",
  );
  if (!user) return null;
  return { user: clone(user), company: clone(memory.companies.get(user.companyId) || null) };
}

export async function getAmazonConfig(companyId, { includeSecret = false } = {}) {
  if (isMongoConnected()) {
    const query = Company.findById(companyId);
    if (includeSecret) {
      query.select("+integrations.amazon.clientSecret");
    }

    const company = await query.lean();
    return company?.integrations?.amazon || null;
  }

  return clone(memory.companies.get(companyId)?.integrations?.amazon || null);
}

export async function updateAmazonConfig({ companyId, payload }) {
  const applicationId = String(payload.applicationId || "").trim();
  const existing = await getAmazonConfig(companyId, { includeSecret: true });
  const amazon = {
    applicationId,
    clientId: String(payload.clientId || "").trim(),
    clientSecret: String(payload.clientSecret || existing?.clientSecret || "").trim(),
    sellerCentralUrl: String(payload.sellerCentralUrl || "https://sellercentral.amazon.in").trim().replace(/\/$/, ""),
    marketplaceId: String(payload.marketplaceId || "A21TJRUUN4KGV").trim(),
    spApiEndpoint: String(payload.spApiEndpoint || "https://sellingpartnerapi-eu.amazon.com").trim().replace(/\/$/, ""),
    syncDays: Math.max(1, Math.min(90, Number(payload.syncDays || existing?.syncDays || 30))),
    draftMode: payload.draftMode !== false,
  };

  if (!amazon.applicationId || !amazon.clientId || !amazon.clientSecret) {
    return { error: "Amazon application ID, LWA client ID, and LWA client secret are required" };
  }

  if (!/^amzn1\.(sellerapps\.app|sp\.solution)\.[a-z0-9-]+$/i.test(applicationId)) {
    return {
      error: "Amazon application ID must look like amzn1.sellerapps.app.xxxxx or amzn1.sp.solution.xxxxx. Do not use the LWA client ID.",
    };
  }

  if (isMongoConnected()) {
    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: { "integrations.amazon": amazon } },
      { returnDocument: "after" },
    ).lean();
    return {
      config: {
        ...company.integrations.amazon,
        clientSecret: undefined,
      },
    };
  }

  const company = memory.companies.get(companyId);
  if (!company) return { error: "Company not found" };

  company.integrations = {
    ...company.integrations,
    amazon,
  };
  company.updatedAt = now();

  return {
    config: {
      ...amazon,
      clientSecret: undefined,
    },
  };
}

export async function updateCompanyProfile({ companyId, payload }) {
  const update = cleanCompanyPayload(payload);

  if (!update.name) {
    return { error: "Company name is required" };
  }

  if (isMongoConnected()) {
    const company = await Company.findByIdAndUpdate(
      companyId,
      { $set: update },
      { new: true, runValidators: true },
    ).lean();
    return { company };
  }

  const company = memory.companies.get(companyId);
  if (!company) return { error: "Company not found" };

  Object.assign(company, update, { updatedAt: now() });
  return { company: clone(company) };
}

// Separate from updateCompanyProfile above so uploading/removing a logo
// never requires re-submitting the whole company form, and never trips
// that function's "name is required" gate. Accepts a data: URI produced by
// FileReader on the frontend (see company-view.jsx) — validated here
// rather than trusted, since this same payload gets embedded straight into
// invoice PDFs (invoice-pdf.js) and shown on the public tracking page with
// no further checks downstream. logoDataUrl: "" removes the logo.
const MAX_LOGO_BYTES = 600 * 1024; // ~600KB decoded — comfortably under the app's 1MB JSON body cap with room for the rest of the request
// PNG/JPEG only, deliberately narrower than "any browser-displayable
// image" — pdf-lib (invoice-pdf.js's embedPng/embedJpg) can only embed
// these two formats, and the logo needs to render identically wherever
// it's used (settings preview, public tracking page, print invoice, PDF
// invoice). Accepting webp/gif here would silently fail only in the PDF.
const LOGO_DATA_URL_PATTERN = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/]+={0,2})$/;

export async function updateCompanyLogo({ companyId, logoDataUrl }) {
  const value = String(logoDataUrl || "").trim();

  if (value) {
    const match = value.match(LOGO_DATA_URL_PATTERN);
    if (!match) {
      return { error: "Logo must be a PNG or JPEG image" };
    }
    const decodedBytes = Buffer.from(match[2], "base64").length;
    if (decodedBytes > MAX_LOGO_BYTES) {
      return { error: `Logo is too large (${Math.round(decodedBytes / 1024)}KB) — please use an image under ${Math.round(MAX_LOGO_BYTES / 1024)}KB` };
    }
  }

  if (isMongoConnected()) {
    const company = await Company.findByIdAndUpdate(companyId, { $set: { logoUrl: value } }, { new: true }).lean();
    if (!company) return { error: "Company not found" };
    return { company };
  }

  const company = memory.companies.get(companyId);
  if (!company) return { error: "Company not found" };
  company.logoUrl = value;
  company.updatedAt = now();
  return { company: clone(company) };
}

export async function updateCompanyKyc({ companyId, payload }) {
  const kyc = cleanKycPayload(payload);
  const status = payload.submit ? "submitted" : "draft";
  const submittedAt = payload.submit ? now() : undefined;

  if (isMongoConnected()) {
    const update = {
      kyc: {
        ...kyc,
        status,
        submittedAt: submittedAt ? new Date(submittedAt) : undefined,
      },
    };
    const company = await Company.findByIdAndUpdate(companyId, { $set: update }, { new: true }).lean();
    return { company };
  }

  const company = memory.companies.get(companyId);
  if (!company) return { error: "Company not found" };

  company.kyc = {
    ...company.kyc,
    ...kyc,
    status,
    submittedAt,
  };
  company.updatedAt = now();

  return { company: clone(company) };
}

function cleanTaxSettings(payload = {}) {
  return {
    gstRate: Number.isFinite(Number(payload.gstRate)) ? Number(payload.gstRate) : 5,
    invoicePrefix: String(payload.invoicePrefix || "INV").trim().toUpperCase(),
    invoiceStartNumber: Number.isFinite(Number(payload.invoiceStartNumber)) ? Number(payload.invoiceStartNumber) : 1,
    placeOfSupply: String(payload.placeOfSupply || "").trim(),
  };
}

function cleanNotificationSettings(payload = {}) {
  return {
    lowStockAlerts: Boolean(payload.lowStockAlerts),
    newOrderAlerts: Boolean(payload.newOrderAlerts),
    dailySummaryEmail: Boolean(payload.dailySummaryEmail),
    lowStockThreshold: Number.isFinite(Number(payload.lowStockThreshold)) ? Number(payload.lowStockThreshold) : 5,
  };
}

export async function updateCompanyTaxSettings({ companyId, payload }) {
  const taxSettings = cleanTaxSettings(payload);

  if (isMongoConnected()) {
    const company = await Company.findByIdAndUpdate(companyId, { $set: { taxSettings } }, { new: true }).lean();
    return { company };
  }

  const company = memory.companies.get(companyId);
  if (!company) return { error: "Company not found" };
  company.taxSettings = taxSettings;
  company.updatedAt = now();
  return { company: clone(company) };
}

export async function updateCompanyNotificationSettings({ companyId, payload }) {
  const notificationSettings = cleanNotificationSettings(payload);

  if (isMongoConnected()) {
    const company = await Company.findByIdAndUpdate(companyId, { $set: { notificationSettings } }, { new: true }).lean();
    return { company };
  }

  const company = memory.companies.get(companyId);
  if (!company) return { error: "Company not found" };
  company.notificationSettings = notificationSettings;
  company.updatedAt = now();
  return { company: clone(company) };
}

export async function listCompanyUsers({ companyId, actorUserId }) {
  const company = await getCompany(companyId);

  if (isMongoConnected()) {
    const users = await User.find({ companyId }).sort({ createdAt: -1 }).lean();
    return users.map((user) => publicUser(user, { actorUserId, company }));
  }

  return [...memory.users.values()]
    .filter((user) => String(user.companyId) === String(companyId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((user) => publicUser(user, { actorUserId, company }));
}

export async function createCompanyUser({ companyId, invitedBy, name, email, passwordHash, role }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (isMongoConnected()) {
    const existingUser = await User.findOne({ companyId, email: normalizedEmail }).lean();
    if (existingUser) return { error: "Email is already registered" };

    const company = await getCompany(companyId);
    const currentCount = await User.countDocuments({ companyId });
    assertLimitNotExceeded({ company, limitKey: "maxUsers", currentCount, label: "team members" });

    const user = await User.create({
      companyId,
      invitedBy,
      name,
      email: normalizedEmail,
      passwordHash,
      role,
      status: "active",
    });

    return { user: publicUser(user.toObject(), { actorUserId: invitedBy, company }) };
  }

  const existingUser = [...memory.users.values()].find(
    (user) => String(user.companyId) === String(companyId) && user.email === normalizedEmail,
  );
  if (existingUser) return { error: "Email is already registered" };

  {
    const company = await getCompany(companyId);
    const currentCount = [...memory.users.values()].filter((u) => String(u.companyId) === String(companyId)).length;
    assertLimitNotExceeded({ company, limitKey: "maxUsers", currentCount, label: "team members" });
  }

  const user = {
    _id: id(),
    companyId,
    invitedBy,
    email: normalizedEmail,
    name,
    role,
    passwordHash,
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  };
  memory.users.set(user._id, user);

  const company = await getCompany(companyId);
  return { user: publicUser(user, { actorUserId: invitedBy, company }) };
}

export async function updateCompanyUser({ companyId, userId, actorUserId, role, status }) {
  if (String(userId) === String(actorUserId)) {
    return { error: "You cannot edit your own user row from Users page" };
  }

  const company = await getCompany(companyId);

  if (company?.ownerUserId && String(userId) === String(company.ownerUserId)) {
    return { error: "Primary owner role/status cannot be edited" };
  }

  if (isMongoConnected()) {
    const user = await User.findOneAndUpdate(
      { _id: userId, companyId },
      { $set: { role, status } },
      { new: true, runValidators: true },
    ).lean();
    return { user: publicUser(user, { actorUserId, company }) };
  }

  const user = memory.users.get(userId);
  if (!user || String(user.companyId) !== String(companyId)) {
    return { user: null };
  }

  user.role = role;
  user.status = status;
  user.updatedAt = now();

  return { user: publicUser(user, { actorUserId, company }) };
}

export async function changeOwnPassword({ userId, currentPassword, newPassword }) {
  if (String(newPassword || "").length < 8) {
    return { error: "New password must be at least 8 characters" };
  }

  if (isMongoConnected()) {
    const user = await User.findById(userId).select("+passwordHash");
    if (!user) return { error: "User not found" };

    const matches = await bcrypt.compare(String(currentPassword || ""), user.passwordHash || "");
    if (!matches) return { error: "Current password is incorrect" };

    user.passwordHash = await bcrypt.hash(String(newPassword), 12);
    await user.save();
    return { success: true };
  }

  const user = memory.users.get(userId);
  if (!user) return { error: "User not found" };

  const matches = await bcrypt.compare(String(currentPassword || ""), user.passwordHash || "");
  if (!matches) return { error: "Current password is incorrect" };

  user.passwordHash = await bcrypt.hash(String(newPassword), 12);
  user.updatedAt = now();
  return { success: true };
}

export async function listChannels(companyId) {
  if (isMongoConnected()) {
    return Channel.find({ companyId }).sort({ updatedAt: -1 }).lean();
  }

  return [...memory.channels.values()]
    .filter((channel) => String(channel.companyId) === String(companyId))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(withoutCredentials);
}

export async function upsertShopifyChannel({ companyId, userId, shop, shopDetails, scopes, accessToken }) {
  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { companyId, provider: "shopify", shop },
      {
        $set: {
          provider: "shopify",
          companyId,
          shop,
          name: shopDetails.name || shop,
          status: "connected",
          scopes,
          credentials: { accessToken },
          external: {
            shopId: shopDetails.id ? String(shopDetails.id) : undefined,
            email: shopDetails.email,
            domain: shopDetails.domain,
            myshopifyDomain: shopDetails.myshopify_domain,
            currency: shopDetails.currency,
            timezone: shopDetails.iana_timezone || shopDetails.timezone,
          },
          connectedBy: userId,
          disconnectedAt: null,
        },
      },
      { new: true, upsert: true },
    ).lean();
  }

  const existing = [...memory.channels.values()].find(
    (channel) =>
      String(channel.companyId) === String(companyId) &&
      channel.provider === "shopify" &&
      channel.shop === shop,
  );

  const channel = {
    _id: existing?._id || id(),
    provider: "shopify",
    companyId,
    shop,
    name: shopDetails.name || shop,
    status: "connected",
    scopes,
    credentials: { accessToken },
    external: {
      shopId: shopDetails.id ? String(shopDetails.id) : undefined,
      email: shopDetails.email,
      domain: shopDetails.domain,
      myshopifyDomain: shopDetails.myshopify_domain,
      currency: shopDetails.currency,
      timezone: shopDetails.iana_timezone || shopDetails.timezone,
    },
    sync: existing?.sync || {
      products: "idle",
      orders: "idle",
      inventory: "idle",
      customers: "idle",
    },
    metrics: existing?.metrics || {
      orderCount: 0,
      salesTotal: 0,
      currency: shopDetails.currency,
    },
    connectedBy: userId,
    disconnectedAt: null,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };

  memory.channels.set(channel._id, channel);
  return clone(channel);
}

export async function upsertAmazonChannel({ companyId, userId, sellingPartnerId, marketplaceId, refreshToken, accessToken }) {
  const shop = `amazon-${sellingPartnerId}`.toLowerCase();

  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { companyId, provider: "amazon", shop },
      {
        $set: {
          provider: "amazon",
          companyId,
          shop,
          name: "Amazon",
          status: "connected",
          scopes: ["selling_partner_api"],
          credentials: { refreshToken, accessToken },
          external: {
            sellingPartnerId,
            marketplaceId,
          },
          connectedBy: userId,
          disconnectedAt: null,
          sync: {
            products: "idle",
            orders: "idle",
            inventory: "idle",
            customers: "idle",
            lastSyncAt: new Date(),
            lastError: undefined,
          },
        },
      },
      { returnDocument: "after", upsert: true },
    ).lean();
  }

  const existing = [...memory.channels.values()].find(
    (channel) => String(channel.companyId) === String(companyId) && channel.provider === "amazon" && channel.shop === shop,
  );
  const channel = {
    _id: existing?._id || id(),
    provider: "amazon",
    companyId,
    shop,
    name: "Amazon",
    status: "connected",
    scopes: ["selling_partner_api"],
    credentials: { refreshToken, accessToken },
    external: { sellingPartnerId, marketplaceId },
    sync: existing?.sync || {
      products: "idle",
      orders: "idle",
      inventory: "idle",
      customers: "idle",
      lastSyncAt: now(),
    },
    connectedBy: userId,
    disconnectedAt: null,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };

  memory.channels.set(channel._id, channel);
  return clone(channel);
}

export async function queueChannelSync({ channelId, companyId }) {
  if (isMongoConnected()) {
    const channel = await Channel.findOne({ _id: channelId, companyId });
    if (!channel) return null;

    channel.sync = {
      products: "queued",
      orders: "queued",
      inventory: "queued",
      customers: "queued",
      lastSyncAt: new Date(),
      lastError: undefined,
    };

    await channel.save();
    return channel.toObject();
  }

  const channel = memory.channels.get(channelId);

  if (!channel || String(channel.companyId) !== String(companyId)) {
    return null;
  }

  channel.sync = {
    products: "queued",
    orders: "queued",
    inventory: "queued",
    customers: "queued",
    lastSyncAt: now(),
  };
  channel.updatedAt = now();

  return clone(channel);
}

export async function getChannelForSync({ channelId, companyId }) {
  if (isMongoConnected()) {
    return Channel.findOne({ _id: channelId, companyId }).select("+credentials.accessToken +credentials.refreshToken").lean();
  }

  const channel = memory.channels.get(channelId);

  if (!channel || String(channel.companyId) !== String(companyId)) {
    return null;
  }

  return clone(channel);
}

export async function updateChannelSyncState({ channelId, companyId, sync, metrics, status }) {
  const update = {
    ...(sync ? { sync } : {}),
    ...(metrics ? { metrics } : {}),
    ...(status ? { status } : {}),
  };

  if (isMongoConnected()) {
    return Channel.findOneAndUpdate({ _id: channelId, companyId }, { $set: update }, { returnDocument: "after" }).lean();
  }

  const channel = memory.channels.get(channelId);

  if (!channel || String(channel.companyId) !== String(companyId)) {
    return null;
  }

  Object.assign(channel, update, { updatedAt: now() });
  return withoutCredentials(channel);
}

async function bulkUpsert(model, records, filterForRecord) {
  if (!records.length) return;

  await model.bulkWrite(
    records.map((record) => {
      const filter = filterForRecord(record);
      // Clean undefined keys from filter and handle $set record without overwriting non-empty fields with null
      const updateDoc = { ...record };
      delete updateDoc._id;

      return {
        updateOne: {
          filter,
          update: { $set: updateDoc },
          upsert: true,
        },
      };
    }),
    { ordered: false },
  );
}

export async function saveSyncedShopifyData({ companyId, channelId, shop, orders = [], products = [], customers = [] }) {
  const provider = "shopify";
  const normalizedOrders = orders.map((order) => normalizeOrder({ companyId, channelId, provider, shop, order }));
  const normalizedProducts = products.map((product) => normalizeProduct({ companyId, channelId, provider, shop, product }));
  const normalizedCustomers = customers.map((customer) => normalizeCustomer({ companyId, channelId, provider, shop, customer }));

  if (isMongoConnected()) {
    const buildFilter = (record) => ({
      companyId: { $in: [String(record.companyId), record.companyId] },
      externalId: String(record.externalId),
    });

    await Promise.all([
      bulkUpsert(SyncedOrder, normalizedOrders, buildFilter),
      bulkUpsert(SyncedProduct, normalizedProducts, buildFilter),
      bulkUpsert(SyncedCustomer, normalizedCustomers, buildFilter),
    ]);

    const [dbOrders, dbProducts, dbCustomers] = await Promise.all([
      normalizedOrders.length ? SyncedOrder.find({ companyId, externalId: { $in: normalizedOrders.map((o) => o.externalId) } }).lean() : [],
      normalizedProducts.length ? SyncedProduct.find({ companyId, externalId: { $in: normalizedProducts.map((p) => p.externalId) } }).lean() : [],
      normalizedCustomers.length ? SyncedCustomer.find({ companyId, externalId: { $in: normalizedCustomers.map((c) => c.externalId) } }).lean() : [],
    ]);

    return {
      orders: dbOrders.length ? dbOrders : normalizedOrders,
      products: dbProducts.length ? dbProducts : normalizedProducts,
      customers: dbCustomers.length ? dbCustomers : normalizedCustomers,
    };
  } else {
    for (const order of normalizedOrders) {
      order._id = order._id || order.externalId;
      memory.orders.set(`${companyId}:${channelId}:${order.externalId}`, clone(order));
    }
    for (const product of normalizedProducts) {
      product._id = product._id || product.externalId;
      memory.products.set(`${companyId}:${channelId}:${product.externalId}`, clone(product));
    }
    for (const customer of normalizedCustomers) {
      customer._id = customer._id || customer.externalId;
      memory.customers.set(`${companyId}:${channelId}:${customer.externalId}`, clone(customer));
    }
  }

  return {
    orders: normalizedOrders,
    products: normalizedProducts,
    customers: normalizedCustomers,
  };
}

export async function saveSyncedAmazonData({ companyId, channelId, shop, orders = [], products = [] }) {
  const normalizedOrders = orders.map((order) => normalizeAmazonOrder({ companyId, channelId, shop, order }));
  const customerByExternalId = new Map();
  orders.forEach((order) => {
    const customer = normalizeAmazonCustomer({ companyId, channelId, shop, order });
    if (customer.externalId) {
      const existing = customerByExternalId.get(customer.externalId);
      customerByExternalId.set(customer.externalId, {
        ...customer,
        ordersCount: toNumber(existing?.ordersCount) + 1,
        totalSpent: toNumber(existing?.totalSpent) + toNumber(customer.totalSpent),
      });
    }
  });
  const normalizedCustomers = [...customerByExternalId.values()];
  const normalizedProducts = products
    .map((product) => normalizeAmazonProduct({ companyId, channelId, shop, listing: product }))
    .filter((product) => product.externalId && product.title);

  if (isMongoConnected()) {
    await Promise.all([
      bulkUpsert(SyncedOrder, normalizedOrders, (record) => ({
        companyId: record.companyId,
        channelId: record.channelId,
        externalId: record.externalId,
      })),
      bulkUpsert(SyncedProduct, normalizedProducts, (record) => ({
        companyId: record.companyId,
        channelId: record.channelId,
        externalId: record.externalId,
      })),
      bulkUpsert(SyncedCustomer, normalizedCustomers, (record) => ({
        companyId: record.companyId,
        channelId: record.channelId,
        externalId: record.externalId,
      })),
    ]);
  } else {
    for (const order of normalizedOrders) {
      order._id = order._id || order.externalId;
      memory.orders.set(`${companyId}:${channelId}:${order.externalId}`, clone(order));
    }
    for (const product of normalizedProducts) {
      product._id = product._id || product.externalId;
      memory.products.set(`${companyId}:${channelId}:${product.externalId}`, clone(product));
    }
    for (const customer of normalizedCustomers) {
      customer._id = customer._id || customer.externalId;
      memory.customers.set(`${companyId}:${channelId}:${customer.externalId}`, clone(customer));
    }
  }

  return {
    orders: normalizedOrders,
    products: normalizedProducts,
    customers: normalizedCustomers,
  };
}

export async function getSavedCommerceData(companyId) {
  if (isMongoConnected()) {
    const [orders, products, customers, channels] = await Promise.all([
      SyncedOrder.find({ companyId }).sort({ shopifyCreatedAt: -1 }).limit(5000).lean(),
      SyncedProduct.find({ companyId }).sort({ shopifyUpdatedAt: -1 }).limit(5000).lean(),
      SyncedCustomer.find({ companyId }).sort({ shopifyUpdatedAt: -1 }).limit(5000).lean(),
      Channel.find({ companyId }).sort({ updatedAt: -1 }).lean(),
    ]);

    return { orders, products, customers, channels };
  }

  const owned = (entry) => String(entry.companyId) === String(companyId);

  return {
    orders: [...memory.orders.values()].filter(owned).sort((a, b) => new Date(b.shopifyCreatedAt || 0) - new Date(a.shopifyCreatedAt || 0)),
    products: [...memory.products.values()].filter(owned).sort((a, b) => new Date(b.shopifyUpdatedAt || 0) - new Date(a.shopifyUpdatedAt || 0)),
    customers: [...memory.customers.values()].filter(owned).sort((a, b) => new Date(b.shopifyUpdatedAt || 0) - new Date(a.shopifyUpdatedAt || 0)),
    channels: [...memory.channels.values()].filter(owned).map(withoutCredentials),
  };
}

function modelForResource(resource) {
  if (resource === "orders") return SyncedOrder;
  if (resource === "products") return SyncedProduct;
  if (resource === "customers") return SyncedCustomer;
  return null;
}

function memoryMapForResource(resource) {
  if (resource === "orders") return memory.orders;
  if (resource === "products") return memory.products;
  if (resource === "customers") return memory.customers;
  return null;
}

function publicSyncedRecord(record, channels = []) {
  const copy = clone(record);
  const channel = channels.find((entry) => String(entry._id) === String(copy.channelId));
  copy.id = copy._id || copy.externalId;
  copy.channelName = channel?.name || copy.provider;
  copy.channelStatus = channel?.status || "connected";
  copy.channelShop = channel?.shop || copy.shop;
  delete copy.raw;
  return copy;
}

export async function listCommerceRecords({ companyId, resource }) {
  const model = modelForResource(resource);
  const memoryMap = memoryMapForResource(resource);

  if (!model || !memoryMap) {
    return null;
  }

  if (isMongoConnected()) {
    const [records, channels] = await Promise.all([
      model
        .find({ companyId })
        .sort(resource === "orders" ? { shopifyCreatedAt: -1 } : { updatedAt: -1 })
        .limit(1000)
        .lean(),
      Channel.find({ companyId }).lean(),
    ]);

    return records.map((record) => publicSyncedRecord(record, channels));
  }

  const channels = [...memory.channels.values()].filter((channel) => String(channel.companyId) === String(companyId));
  return [...memoryMap.values()]
    .filter((record) => String(record.companyId) === String(companyId))
    .map((record) => publicSyncedRecord(record, channels));
}

export async function getCommerceRecordForUpdate({ companyId, resource, recordId }) {
  const model = modelForResource(resource);
  const memoryMap = memoryMapForResource(resource);

  if (!model || !memoryMap) {
    return null;
  }

  if (isMongoConnected()) {
    const record = await model.findOne({ _id: recordId, companyId }).lean();
    if (!record) return null;

    const channel = await Channel.findOne({ _id: record.channelId, companyId }).select("+credentials.accessToken").lean();
    if (!channel) return null;

    return { record, channel };
  }

  const record = [...memoryMap.values()].find(
    (entry) =>
      (String(entry._id) === String(recordId) || String(entry.externalId) === String(recordId)) &&
      String(entry.companyId) === String(companyId),
  );
  if (!record) return null;

  const channel = memory.channels.get(record.channelId);
  if (!channel || String(channel.companyId) !== String(companyId)) return null;

  return { record: clone(record), channel: clone(channel) };
}

export async function listProductMappingOptions(companyId) {
  const products = await listCommerceRecords({ companyId, resource: "products" });

  return (products || []).flatMap((product) =>
    (product.variants?.length ? product.variants : [{ sku: "", externalId: "", title: "" }]).map((variant) => ({
      provider: product.provider,
      channelId: product.channelId,
      channelName: product.channelName,
      productId: product.externalId,
      productTitle: product.title,
      variantId: variant.externalId,
      variantTitle: variant.title,
      sku: variant.sku || "",
      label: `${product.channelName || product.provider} / ${variant.sku || "No SKU"} / ${product.title}`,
    })),
  );
}

export async function listProductMappings(companyId) {
  if (isMongoConnected()) {
    return ProductMapping.find({ companyId }).sort({ updatedAt: -1 }).lean();
  }

  return [...memory.productMappings.values()].filter((mapping) => String(mapping.companyId) === String(companyId)).map(clone);
}

export async function saveProductMapping({ companyId, masterName, mappings }) {
  const cleanedName = String(masterName || "").trim();
  const cleanedMappings = (mappings || [])
    .filter((mapping) => mapping?.provider && (mapping.productId || mapping.sku))
    .map((mapping) => ({
      provider: mapping.provider,
      channelId: mapping.channelId,
      productId: mapping.productId,
      productTitle: mapping.productTitle,
      sku: mapping.sku,
    }));

  if (!cleanedName) {
    return { error: "Master product name is required" };
  }

  if (cleanedMappings.length < 2) {
    return { error: "Select at least two channel products or SKUs to map" };
  }

  if (isMongoConnected()) {
    const mapping = await ProductMapping.findOneAndUpdate(
      { companyId, masterName: cleanedName },
      { $set: { companyId, masterName: cleanedName, mappings: cleanedMappings } },
      { returnDocument: "after", upsert: true },
    ).lean();
    return { mapping };
  }

  const existing = [...memory.productMappings.values()].find(
    (mapping) => String(mapping.companyId) === String(companyId) && mapping.masterName === cleanedName,
  );
  const mapping = {
    _id: existing?._id || id(),
    companyId,
    masterName: cleanedName,
    mappings: cleanedMappings,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };
  memory.productMappings.set(mapping._id, mapping);
  return { mapping: clone(mapping) };
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDate(left, right) {
  return startOfDay(left).getTime() === startOfDay(right).getTime();
}

function formatMoney(value, currency = "INR") {
  const amount = Number(value) || 0;

  if (currency === "INR") {
    return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return `${currency} ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dayLabel(date) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(date);
}

export async function getDashboardSummary(companyId) {
  const { orders, products, customers, channels } = await getSavedCommerceData(companyId);
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const currency = orders.find((order) => order.currency)?.currency || channels.find((channel) => channel.metrics?.currency)?.metrics?.currency || "INR";

  const salesTotal = orders.reduce((total, order) => total + toNumber(order.totalPrice), 0);
  const todaySales = orders
    .filter((order) => order.shopifyCreatedAt && isSameDate(new Date(order.shopifyCreatedAt), today))
    .reduce((total, order) => total + toNumber(order.totalPrice), 0);
  const yesterdaySales = orders
    .filter((order) => order.shopifyCreatedAt && isSameDate(new Date(order.shopifyCreatedAt), yesterday))
    .reduce((total, order) => total + toNumber(order.totalPrice), 0);
  const monthlySales = orders
    .filter((order) => order.shopifyCreatedAt && new Date(order.shopifyCreatedAt) >= monthStart)
    .reduce((total, order) => total + toNumber(order.totalPrice), 0);
  const pendingOrders = orders.filter((order) => order.fulfillmentStatus === "unfulfilled" && !order.cancelledAt).length;
  const cancelledOrders = orders.filter((order) => order.cancelledAt || order.financialStatus === "voided").length;
  const deliveredOrders = orders.filter((order) => order.fulfillmentStatus === "fulfilled").length;
  const lowStockProducts = products.filter((product) => toNumber(product.totalInventory) <= 5).length;

  const salesTrend = [...Array(7)].map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const dayOrders = orders.filter((order) => order.shopifyCreatedAt && isSameDate(new Date(order.shopifyCreatedAt), date));
    const sales = dayOrders.reduce((total, order) => total + toNumber(order.totalPrice), 0);

    return {
      day: dayLabel(date),
      sales,
      profit: Math.round(sales * 0.18),
      orders: dayOrders.length,
    };
  });

  const salesByChannel = channels.map((channel) => {
    const channelOrders = orders.filter((order) => String(order.channelId) === String(channel._id));
    return {
      name: channel.name || channel.provider,
      value: channelOrders.reduce((total, order) => total + toNumber(order.totalPrice), 0),
    };
  });
  const channelTotal = salesByChannel.reduce((total, item) => total + item.value, 0);
  const channelMix = salesByChannel
    .filter((item) => item.value > 0)
    .map((item) => ({
      name: item.name,
      value: channelTotal ? Math.round((item.value / channelTotal) * 100) : 0,
    }));

  return {
    summary: {
      currency,
      salesTotal,
      todaySales,
      yesterdaySales,
      monthlySales,
      orderCount: orders.length,
      productCount: products.length,
      customerCount: customers.length,
      pendingOrders,
      deliveredOrders,
      cancelledOrders,
      lowStockProducts,
      connectedChannelCount: channels.filter((channel) => channel.status === "connected").length,
      lastSyncAt: channels
        .map((channel) => channel.sync?.lastSyncAt)
        .filter(Boolean)
        .sort()
        .at(-1),
    },
    kpis: [
      { label: "Today's Sales", value: formatMoney(todaySales, currency), change: `${orders.filter((order) => order.shopifyCreatedAt && isSameDate(new Date(order.shopifyCreatedAt), today)).length} orders`, tone: "green" },
      { label: "Yesterday Sales", value: formatMoney(yesterdaySales, currency), change: `${orders.filter((order) => order.shopifyCreatedAt && isSameDate(new Date(order.shopifyCreatedAt), yesterday)).length} orders`, tone: "blue" },
      { label: "Monthly Sales", value: formatMoney(monthlySales, currency), change: `${orders.length} synced total`, tone: "green" },
      { label: "Total Orders", value: orders.length.toLocaleString("en-IN"), change: `${pendingOrders} pending`, tone: "blue" },
      { label: "Products", value: products.length.toLocaleString("en-IN"), change: `${lowStockProducts} low stock`, tone: lowStockProducts ? "amber" : "green" },
      { label: "Customers", value: customers.length.toLocaleString("en-IN"), change: `${channels.filter((channel) => channel.status === "connected").length} channels`, tone: "teal" },
      { label: "Delivered", value: deliveredOrders.toLocaleString("en-IN"), change: `${orders.length ? Math.round((deliveredOrders / orders.length) * 100) : 0}% fulfilment`, tone: "green" },
      { label: "Cancelled", value: cancelledOrders.toLocaleString("en-IN"), change: `${orders.length ? Math.round((cancelledOrders / orders.length) * 100) : 0}% orders`, tone: cancelledOrders ? "rose" : "green" },
    ],
    salesTrend,
    channelMix: channelMix.length ? channelMix : [{ name: "No synced sales", value: 100 }],
    recentOrders: orders.slice(0, 8).map((order) => ({
      id: order.name || order.externalId,
      customer: order.customerName || "Guest customer",
      channel: channels.find((channel) => String(channel._id) === String(order.channelId))?.name || order.provider,
      status: order.fulfillmentStatus || order.financialStatus || "open",
      payment: order.financialStatus || "unknown",
      courier: order.fulfillmentStatus === "fulfilled" ? "Fulfilled" : "Pending",
      total: formatMoney(order.totalPrice, order.currency || currency),
      profit: formatMoney(toNumber(order.totalPrice) * 0.18, order.currency || currency),
    })),
    inventory: products.slice(0, 8).map((product) => ({
      sku: product.variants?.find((variant) => variant.sku)?.sku || product.handle || product.externalId,
      product: product.title || "Shopify product",
      available: toNumber(product.totalInventory),
      reserved: 0,
      raw: product.productType || product.vendor || "Shopify",
      alert: toNumber(product.totalInventory) <= 0 ? "Low" : toNumber(product.totalInventory) <= 5 ? "Watch" : "Healthy",
    })),
  };
}

export async function disconnectChannel({ channelId, companyId }) {
  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { _id: channelId, companyId },
      {
        $set: {
          status: "disconnected",
          disconnectedAt: new Date(),
          "credentials.accessToken": undefined,
        },
      },
      { returnDocument: "after" },
    ).lean();
  }

  const channel = memory.channels.get(channelId);

  if (!channel || String(channel.companyId) !== String(companyId)) {
    return null;
  }

  channel.status = "disconnected";
  channel.disconnectedAt = now();
  channel.updatedAt = now();
  delete channel.credentials?.accessToken;

  return withoutCredentials(channel);
}

export async function getVelocityChannel(companyId) {
  if (isMongoConnected()) {
    return Channel.findOne({ companyId, provider: "velocity" })
      .select("+credentials.username +credentials.password +credentials.token +credentials.tokenExpiresAt")
      .lean();
  }

  const channel = [...memory.channels.values()].find(
    (entry) => String(entry.companyId) === String(companyId) && entry.provider === "velocity",
  );

  return channel ? clone(channel) : null;
}

export async function upsertVelocityChannel({ companyId, userId, username, password, token, tokenExpiresAt }) {
  const shop = "velocity";

  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { companyId, provider: "velocity", shop },
      {
        $set: {
          provider: "velocity",
          companyId,
          shop,
          name: "Velocity Shipping",
          status: "connected",
          credentials: { username, password, token, tokenExpiresAt },
          connectedBy: userId,
          disconnectedAt: null,
        },
      },
      { new: true, upsert: true },
    ).lean();
  }

  const existing = [...memory.channels.values()].find(
    (channel) => String(channel.companyId) === String(companyId) && channel.provider === "velocity" && channel.shop === shop,
  );

  const channel = {
    _id: existing?._id || id(),
    provider: "velocity",
    companyId,
    shop,
    name: "Velocity Shipping",
    status: "connected",
    credentials: { username, password, token, tokenExpiresAt },
    connectedBy: userId,
    disconnectedAt: null,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };

  memory.channels.set(channel._id, channel);
  return clone(channel);
}

export async function updateVelocityToken({ channelId, companyId, token, tokenExpiresAt }) {
  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { _id: channelId, companyId },
      { $set: { "credentials.token": token, "credentials.tokenExpiresAt": tokenExpiresAt } },
      { new: true },
    )
      .select("+credentials.username +credentials.password +credentials.token +credentials.tokenExpiresAt")
      .lean();
  }

  const channel = memory.channels.get(channelId);
  if (!channel || String(channel.companyId) !== String(companyId)) return null;

  channel.credentials = { ...channel.credentials, token, tokenExpiresAt };
  channel.updatedAt = now();

  return clone(channel);
}

export async function createWarehouseRecord({ companyId, channelId, warehouseId, payload }) {
  return upsertWarehouseRecord({
    companyId,
    channelId,
    provider: "velocity",
    externalWarehouseId: String(warehouseId || payload.warehouse_id || payload.id || ""),
    data: payload,
  });
}

export async function listWarehouses({ companyId, provider }) {
  return listWarehousesRepo({ companyId, provider });
}

export async function createShipmentRecord(fields) {
  const record = { provider: "velocity", isReturn: false, status: "created", codAmount: 0, ...fields };

  if (isMongoConnected()) {
    return Shipment.create(record);
  }

  const stored = { _id: id(), ...record, createdAt: now(), updatedAt: now() };
  memory.shipments.set(stored._id, stored);
  return clone(stored);
}

export async function listShipments({ companyId, provider = "velocity" }) {
  if (isMongoConnected()) {
    return Shipment.find({ companyId, provider }).sort({ createdAt: -1 }).limit(500).lean();
  }

  return [...memory.shipments.values()]
    .filter((entry) => String(entry.companyId) === String(companyId) && entry.provider === provider)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(clone);
}

export async function updateShipmentsByAwb({ companyId, awbCodes, update }) {
  if (isMongoConnected()) {
    await Shipment.updateMany({ companyId, awbCode: { $in: awbCodes } }, { $set: update });
    return Shipment.find({ companyId, awbCode: { $in: awbCodes } }).lean();
  }

  const updated = [];
  for (const entry of memory.shipments.values()) {
    if (String(entry.companyId) === String(companyId) && awbCodes.includes(entry.awbCode)) {
      Object.assign(entry, update, { updatedAt: now() });
      updated.push(clone(entry));
    }
  }
  return updated;
}
