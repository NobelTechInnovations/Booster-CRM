import { SyncedCustomer } from "../../models/synced-customer.model.js";
import { SyncedProduct } from "../../models/synced-product.model.js";
import { isMongoConnected } from "../../config/database.js";
import { getChannelForSync } from "../../repositories/channel.repo.js";
import { saveSyncedOyklaneData } from "../../repositories/order.repo.js";
import { HttpError } from "../../utils/http-error.js";
import { createOyklaneCustomer, createOyklaneProduct, createOyklaneResource, listOyklaneProducts } from "./oyklane.service.js";
import { fetchShopifyCollections, fetchShopifyDiscounts } from "./shopify.service.js";
import { SyncedOrder } from "../../models/synced-order.model.js";

// Copies catalogue and customers already synced from one channel (e.g. a
// Shopify store) into another (Oyklane). Read-only on the source: it works
// from Booster's synced copy, never writing back to the source store.
//
// Re-runnable: anything already on the target (same SKU or title for
// products, same email/phone for customers) is skipped, so a second click
// only sends what's new — and a batch cut short by MAX_PER_RUN continues.

const MAX_PER_RUN = 150;
const TARGET_WRITERS = { oyklane: { product: createOyklaneProduct, customer: createOyklaneCustomer, listProducts: listOyklaneProducts, create: createOyklaneResource, save: saveSyncedOyklaneData } };

const norm = (value) => String(value || "").trim().toLowerCase();

// Live Oyklane POST /products shape (camelCase). No option names: a
// variant's title is its option values joined with " / ". Categories are
// ids the seller created in Oyklane, so the Shopify type goes to productType.
// Images are hotlinked, not copied — Shopify CDN links break if that store closes.
function toOyklaneProduct(product) {
  const raw = product.raw || {};
  const urls = (raw.images || []).map((image) => image.src || image.url).filter(Boolean);
  if (!urls.length && product.imageUrl) urls.push(product.imageUrl);
  const rawVariants = new Map((raw.variants || []).map((variant) => [String(variant.id), variant]));
  const status = norm(product.status) === "active" ? "active" : "draft";

  return {
    title: product.title,
    description: raw.body_html || "",
    status,
    vendor: product.vendor || undefined,
    productType: product.productType || undefined,
    category: product.productType || undefined,
    handle: product.handle || undefined,
    tags: (product.tags || []).join(", "),
    copyImages: true,
    externalId: `${product.provider}:${product.externalId}`,
    images: urls.map((url, position) => ({ url, altText: product.title, position })),
    variants: (product.variants || []).map((variant) => {
      const source = rawVariants.get(String(variant.externalId)) || {};
      const values = [source.option1, source.option2, source.option3].filter((v) => v && v !== "Default Title");
      return {
        title: values.join(" / ") || "Default",
        options: values.length ? values : undefined,
        weight: source.grams || undefined,
        sku: variant.sku || undefined,
        price: Number(variant.price) || 0,
        comparePrice: source.compare_at_price ? Number(source.compare_at_price) : undefined,
        inventoryQuantity: Math.max(0, Number(variant.inventoryQuantity) || 0),
        status,
      };
    }),
  };
}

function toOyklaneCustomer(customer) {
  const address = customer.defaultAddress || {};
  return {
    name: customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email,
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    tags: customer.tags || [],
    externalId: `${customer.provider}:${customer.externalId}`,
    address: address.address1 ? { address1: address.address1, address2: address.address2, city: address.city, province: address.province, zip: address.zip, country: address.country } : undefined,
  };
}

export async function transferChannelData({ companyId, sourceChannelId, targetChannelId, resources = ["products"], productIds }) {
  if (!isMongoConnected()) throw new HttpError(503, "Transfer needs the database");
  if (String(sourceChannelId) === String(targetChannelId)) throw new HttpError(400, "Pick two different channels");

  const [source, target] = await Promise.all([
    getChannelForSync({ channelId: sourceChannelId, companyId }),
    getChannelForSync({ channelId: targetChannelId, companyId }),
  ]);
  if (!source || !target) throw new HttpError(404, "Channel not found");
  const writer = TARGET_WRITERS[target.provider];
  if (!writer) throw new HttpError(400, `Copying into ${target.provider} isn't supported yet — Oyklane is the supported target.`);
  if (target.status !== "connected") throw new HttpError(400, "The target channel isn't connected");

  const base = { companyId, channelId: target._id, shop: target.shop };
  const result = {};
  const sourceToken = source.credentials?.accessToken;
  const requireShopify = (what) => {
    if (source.provider !== "shopify" || !sourceToken) throw new HttpError(400, `${what} can only be copied from a connected Shopify store.`);
  };

  if (resources.includes("categories")) {
    const types = await SyncedProduct.distinct("productType", { companyId, channelId: source._id });
    result.categories = await runBatch({
      items: types.filter(Boolean).map((name) => ({ name })),
      label: (c) => c.name,
      send: (c) => writer.create(target, "/categories", { name: c.name, externalId: `${source.provider}:type:${norm(c.name)}` }),
    });
  }

  if (resources.includes("products")) {
    const filter = { companyId, channelId: source._id, status: { $nin: ["deleted", "archived"] } };
    if (Array.isArray(productIds) && productIds.length) filter._id = { $in: productIds };
    const [items, existing] = await Promise.all([SyncedProduct.find(filter).lean(), writer.listProducts(target)]);
    const seenTitles = new Set(existing.map((p) => norm(p.title)));
    const seenSkus = new Set(existing.flatMap((p) => (p.variants || []).map((v) => norm(v.sku))).filter(Boolean));
    result.products = await runBatch({
      items,
      isDone: (p) => seenTitles.has(norm(p.title)) || (p.variants || []).some((v) => v.sku && seenSkus.has(norm(v.sku))),
      label: (p) => p.title,
      send: async (p) => {
        const created = await writer.product(target, toOyklaneProduct(p));
        if (created?.id) await writer.save({ ...base, products: [created] });
      },
    });
  }

  if (resources.includes("customers")) {
    const [items, existing] = await Promise.all([
      SyncedCustomer.find({ companyId, channelId: source._id }).lean(),
      SyncedCustomer.find({ companyId, channelId: target._id }).select("email phone").lean(),
    ]);
    const seen = new Set(existing.flatMap((c) => [norm(c.email), norm(c.phone)]).filter(Boolean));
    result.customers = await runBatch({
      items: items.filter((c) => c.email || c.phone),
      isDone: (c) => seen.has(norm(c.email)) || seen.has(norm(c.phone)),
      label: (c) => c.name || c.email,
      send: async (c) => {
        const response = await writer.create(target, "/customers", toOyklaneCustomer(c));
        if (response?.data?.id) await writer.save({ ...base, customers: [response.data] });
        return response;
      },
    });
  }

  if (resources.includes("collections")) {
    requireShopify("Collections");
    const collections = await fetchShopifyCollections(source.shop, sourceToken);
    result.collections = await runBatch({
      items: collections,
      label: (c) => c.title,
      send: (c) => writer.create(target, "/collections", {
        title: c.title,
        description: c.body_html || "",
        image: c.image?.src || undefined,
        productExternalIds: (c.productIds || []).map((id) => `shopify:${id}`),
        externalId: `shopify:${c.id}`,
      }),
    });
  }

  if (resources.includes("discounts")) {
    requireShopify("Discounts");
    const rules = await fetchShopifyDiscounts(source.shop, sourceToken);
    const codes = rules.flatMap((rule) => (rule.codes?.length ? rule.codes : [{ code: rule.title }]).map((code) => ({ rule, code })));
    result.discounts = await runBatch({
      items: codes,
      label: ({ code }) => code.code,
      send: ({ rule, code }) => writer.create(target, "/discounts", toOyklaneDiscount(rule, code)),
    });
  }

  if (resources.includes("orders")) {
    const orders = await SyncedOrder.find({ companyId, channelId: source._id, isTestOrder: { $ne: true } }).sort({ shopifyCreatedAt: 1 }).lean();
    result.orders = await runBatch({
      items: orders,
      label: (o) => o.name,
      send: (o) => writer.create(target, "/orders/import", toOyklaneOrder(o)),
    });
  }

  return result;
}

function toOyklaneDiscount(rule, code) {
  const freeShipping = rule.target_type === "shipping_line";
  return {
    code: code.code,
    type: freeShipping ? "free_shipping" : rule.value_type === "percentage" ? "percentage" : "fixed_amount",
    value: Math.abs(Number(rule.value) || 0),
    minSubtotal: rule.prerequisite_subtotal_range?.greater_than_or_equal_to ? Number(rule.prerequisite_subtotal_range.greater_than_or_equal_to) : undefined,
    startsAt: rule.starts_at,
    endsAt: rule.ends_at || undefined,
    usageLimit: rule.usage_limit || undefined,
    oncePerCustomer: Boolean(rule.once_per_customer),
    status: !rule.ends_at || new Date(rule.ends_at) > new Date() ? "active" : "disabled",
    externalId: `shopify:${rule.id}:${code.id || code.code}`,
  };
}

const PAYMENT_STATUS = { pending: "pending", authorized: "pending", partially_paid: "pending", paid: "paid", partially_refunded: "partially_refunded", refunded: "refunded", voided: "unpaid" };
const FULFILLMENT_STATUS = { fulfilled: "fulfilled", partial: "partial", cancelled: "cancelled", unfulfilled: "unfulfilled" };

// POST /orders/import keeps the original date/number and has no side effects
// on Oyklane (no payment, stock, emails, webhooks or commission).
function toOyklaneOrder(order) {
  const address = order.shippingAddress || {};
  return {
    number: order.orderNumber || undefined,
    email: order.email || undefined,
    phone: order.phone || undefined,
    currency: order.currency || "INR",
    createdAt: order.shopifyCreatedAt,
    paymentMethod: order.isCOD ? "cod" : "prepaid",
    paymentStatus: PAYMENT_STATUS[order.financialStatus] || "pending",
    fulfillmentStatus: order.cancelledAt ? "cancelled" : FULFILLMENT_STATUS[order.fulfillmentStatus] || "unfulfilled",
    subtotal: Number(order.subtotalPrice) || 0,
    shipping: Number(order.totalShipping) || 0,
    tax: Number(order.totalTax) || 0,
    discount: Number(order.totalDiscounts) || 0,
    total: Number(order.totalPrice) || 0,
    customer: { name: order.customerName, email: order.email, phone: order.phone },
    shippingAddress: { name: address.name, address1: address.address1, address2: address.address2, city: address.city, province: address.province, zip: address.zip, country: address.country, phone: address.phone },
    lineItems: (order.lineItems || []).map((item) => ({
      title: item.title,
      sku: item.sku || undefined,
      quantity: Number(item.quantity) || 1,
      price: Number(item.price) || 0,
      productExternalId: item.productExternalId ? `shopify:${item.productExternalId}` : undefined,
      variantSku: item.sku || undefined,
    })),
    trackingNumber: order.trackingNumber || order.awbCode || undefined,
    trackingUrl: order.trackingUrl || undefined,
    cancelledAt: order.cancelledAt || undefined,
    note: order.note || undefined,
    source: order.provider === "shopify" ? "Shopify" : order.provider,
    courier: order.trackingCompany || order.shippingProvider || undefined,
    externalId: `${order.provider}:${order.externalId}`,
  };
}

// Sends up to MAX_PER_RUN pending items. Stops on the first 404/405 (the
// target doesn't have that endpoint yet) or a key/permission error, instead
// of repeating the same failure for every item.
async function runBatch({ items, isDone = () => false, label, send }) {
  const pending = items.filter((item) => !isDone(item));
  const stats = { total: items.length, skipped: items.length - pending.length, created: 0, failed: [], remaining: Math.max(0, pending.length - MAX_PER_RUN) };

  for (const item of pending.slice(0, MAX_PER_RUN)) {
    try {
      const response = await send(item);
      if (response?.created === false) stats.skipped += 1;
      else stats.created += 1;
    } catch (error) {
      if ([404, 405].includes(error.statusCode)) {
        stats.failed.push({ title: "All", error: "Not supported by the target channel's API yet." });
        stats.remaining = pending.length;
        break;
      }
      stats.failed.push({ title: label(item), error: error.message });
      if (error.statusCode === 403 || /API key/.test(error.message)) break;
    }
  }
  return stats;
}
