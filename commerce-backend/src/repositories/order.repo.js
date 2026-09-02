import mongoose from "mongoose";
import { isMongoConnected } from "../config/database.js";
import { Channel } from "../models/channel.model.js";
import { SyncedOrder } from "../models/synced-order.model.js";
import { SyncedProduct } from "../models/synced-product.model.js";
import { SyncedCustomer } from "../models/synced-customer.model.js";
import { ProductMapping } from "../models/product-mapping.model.js";
import { memory, id, clone, now, toDate, toNumber, fullName } from "./memory-store.js";
import { listSkuCosts } from "./sku-cost.repo.js";
import { listAssetMappings, listAssets } from "./asset.repo.js";
import { parseUtmFromOrder } from "../utils/utm.js";

// ─── Normalizers ─────────────────────────────────────────────────────────────

// A real online payment gateway name — if one of these actually processed the
// order, money was genuinely collected online, regardless of what else is on
// the order (a leftover "cod" tag from the checkout-method step, a
// COD-conversion app like Fastrr, etc).
const REAL_PAYMENT_GATEWAYS = ["cashfree", "payu", "razorpay", "instamojo", "ccavenue", "paytm", "phonepe", "gpay", "upi", "card", "net banking", "netbanking", "wallet", "stripe"];

function isCodPayment(order) {
  const paymentGatewayNames = (order.payment_gateway_names || []).map((name) => String(name).toLowerCase());
  const tagsLower = String(order.tags || "").toLowerCase();

  const hasRealGateway = paymentGatewayNames.some((name) => REAL_PAYMENT_GATEWAYS.some((g) => name.includes(g)));
  const isPaidStatus = ["paid", "partially_paid", "refunded", "partially_refunded", "voided"].includes(order.financial_status);

  // Paid status + an actual payment gateway (Cashfree, PayU, ...) together
  // mean money was genuinely collected online — this is the one combination
  // that reliably means prepaid. Paid status alone is NOT enough: several
  // real orders here show financial_status "paid" with gateway "Cash on
  // Delivery (COD)" or "manual" and an explicit "✅ COD-Verified" tag — these
  // are genuinely COD, just marked "paid" for an internal workflow reason
  // unrelated to cash actually changing hands, so blindly trusting
  // financial_status alone was wrong and got reverted.
  if (isPaidStatus && hasRealGateway) return false;

  // COD-verification apps (Fastrr, Cashfree's own COD product) tag orders
  // this explicitly — trust it outright over everything else.
  const explicitCodTag = /cod[\s-]?(verified|pending)|cashfree\s*-\s*cod/.test(tagsLower);
  if (explicitCodTag) return true;

  const gatewayCodMatch = paymentGatewayNames.some((name) => name.includes("cod") || name.includes("cash") || name.includes("manual"));
  const isPending = order.financial_status === "pending";
  const tagCod = tagsLower.includes("cod");

  return gatewayCodMatch || isPending || tagCod;
}

// Shopify's own test-order flag (raw.test:true, set by the Bogus Gateway /
// "This is a test order" checkout) or a manual "test"/"test-order" tag.
// Either way this never represents real revenue or cost.
export function isTestOrderPayload(order) {
  if (order.test === true) return true;
  return String(order.tags || "").toLowerCase().split(",").some((t) => t.trim().includes("test"));
}

// Courier/3PL RTO ("Return to Origin") tag — shipment bounced back to us
// undelivered. Matches "rto", "rto_initiated", "rto-initiated" etc.
export function isRtoPayload(order) {
  return String(order.tags || "").toLowerCase().split(",").some((t) => /rto/.test(t.trim()));
}

export function normalizeOrder({ companyId, channelId, provider, shop, order }) {
  const customer        = order.customer || {};
  const shippingAddress = order.shipping_address || {};
  const customerName    = fullName(customer.first_name, customer.last_name) || shippingAddress.name || order.email || "Guest customer";
  const paymentGatewayNames = order.payment_gateway_names || [];
  const cod = isCodPayment(order);
  const totalPrice = toNumber(order.total_price);

  return {
    companyId,
    channelId,
    provider,
    shop,
    externalId:         String(order.id),
    name:               order.name,
    orderNumber:        order.order_number,
    email:              order.email || customer.email,
    phone:              order.phone || customer.phone || shippingAddress.phone,
    customerExternalId: customer.id ? String(customer.id) : undefined,
    customerName,
    financialStatus:    order.financial_status,
    fulfillmentStatus:  order.fulfillment_status || "unfulfilled",
    note:               order.note,
    tags: String(order.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
    currency:           order.currency || order.presentment_currency,
    totalPrice,
    subtotalPrice:      toNumber(order.subtotal_price),
    totalTax:           toNumber(order.total_tax),
    // Some orders (e.g. converted from a draft order — seen on real data as
    // source_name:"shopify_draft_order") don't carry a top-level
    // total_discounts field at all, even when a real discount was applied —
    // it showed as undefined while line_items[].total_discount correctly
    // had the real per-item amount ("99.00" on a fully-discounted line).
    // Fall back to summing line-item discounts when the order-level field
    // is genuinely absent, so a real discount doesn't silently show as ₹0.
    totalDiscounts: order.total_discounts !== undefined
      ? toNumber(order.total_discounts)
      : (order.line_items || []).reduce((sum, item) => sum + (toNumber(item.total_discount) || 0), 0),
    // What the customer paid for shipping — see totalShipping's schema
    // comment. Prefer the modern money-set field; fall back to summing
    // shipping_lines for older orders/API versions that only carry that.
    totalShipping: order.total_shipping_price_set?.shop_money?.amount !== undefined
      ? toNumber(order.total_shipping_price_set.shop_money.amount)
      : (order.shipping_lines || []).reduce((sum, line) => sum + (toNumber(line.price) || 0), 0),
    paymentGatewayNames,
    isCOD:     cod,
    codAmount:  cod ? totalPrice : 0,
    isTestOrder: isTestOrderPayload(order),
    isRTO:       isRtoPayload(order),
    shippingAddress: {
      name:         shippingAddress.name,
      address1:     shippingAddress.address1,
      address2:     shippingAddress.address2,
      city:         shippingAddress.city,
      province:     shippingAddress.province,
      provinceCode: shippingAddress.province_code,
      country:      shippingAddress.country,
      countryCode:  shippingAddress.country_code,
      zip:          shippingAddress.zip,
      phone:        shippingAddress.phone,
    },
    lineItems: (order.line_items || []).map((item) => ({
      externalId:        item.id ? String(item.id) : undefined,
      productExternalId: item.product_id ? String(item.product_id) : undefined,
      variantExternalId: item.variant_id ? String(item.variant_id) : undefined,
      title:             item.title,
      variantTitle:      item.variant_title,
      sku:               item.sku,
      quantity:          item.quantity,
      price:             toNumber(item.price),
      grams:             toNumber(item.grams),
      vendor:            item.vendor,
      requiresShipping:  item.requires_shipping !== false,
    })),
    omsStatus:        "pending",
    shopifyCreatedAt: toDate(order.created_at),
    processedAt:      toDate(order.processed_at),
    cancelledAt:      toDate(order.cancelled_at),
    ...extractShopifyTracking(order),
    raw:              order,
  };
}

// Pulls tracking number/url/courier from Shopify's fulfillments array — covers orders
// fulfilled via the Shopify admin or another channel/app, not just our own ship flow.
function extractShopifyTracking(order) {
  const fulfillments = Array.isArray(order.fulfillments) ? order.fulfillments : [];
  if (!fulfillments.length) return { fulfillments: [] };

  const events = fulfillments.map((f) => ({
    status:          f.status,
    shipmentStatus:  f.shipment_status,
    trackingNumber:  f.tracking_number || (f.tracking_numbers || [])[0],
    trackingUrl:     f.tracking_url || (f.tracking_urls || [])[0],
    trackingCompany: f.tracking_company,
    createdAt:       toDate(f.created_at),
    updatedAt:       toDate(f.updated_at),
  }));

  // Shopify's fulfillments array is append-only — a cancelled fulfillment
  // stays in it forever with status:"cancelled", it doesn't get removed. The
  // most-recent-by-array-position used to be promoted to the top-level
  // trackingNumber/trackingUrl/trackingCompany fields unconditionally, so a
  // cancelled AWB kept showing as if it were live tracking on an order that
  // had gone back to unfulfilled. Only promote the latest fulfillment that
  // isn't itself cancelled — and explicitly null the fields (not just omit
  // them) when none qualifies, so a stale value from a prior sync actually
  // clears instead of lingering forever under $set's partial-update semantics.
  const latestActive = [...events].reverse().find((f) => f.status !== "cancelled");

  return {
    fulfillments:    events,
    trackingNumber:  latestActive?.trackingNumber || null,
    trackingUrl:     latestActive?.trackingUrl || null,
    trackingCompany: latestActive?.trackingCompany || null,
  };
}

function normalizeProduct({ companyId, channelId, provider, shop, product }) {
  const variants = product.variants || [];
  return {
    companyId, channelId, provider, shop,
    externalId:      String(product.id),
    title:           product.title,
    handle:          product.handle,
    status:          product.status,
    vendor:          product.vendor,
    productType:     product.product_type,
    tags:            String(product.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
    imageUrl:        product.image?.src || product.images?.[0]?.src,
    totalInventory:  variants.reduce((total, v) => total + toNumber(v.inventory_quantity), 0),
    variants:        variants.map((v) => ({
      externalId:        v.id ? String(v.id) : undefined,
      title:             v.title,
      sku:               v.sku,
      price:             toNumber(v.price),
      inventoryQuantity: toNumber(v.inventory_quantity),
      barcode:           v.barcode,
    })),
    shopifyCreatedAt: toDate(product.created_at),
    shopifyUpdatedAt: toDate(product.updated_at),
    publishedAt:      toDate(product.published_at),
    raw:              product,
  };
}

function normalizeCustomer({ companyId, channelId, provider, shop, customer }) {
  const defaultAddress = customer.default_address || {};
  const name = fullName(customer.first_name, customer.last_name) || customer.email || customer.phone || "Shopify customer";
  return {
    companyId, channelId, provider, shop,
    externalId: String(customer.id),
    email:      customer.email,
    phone:      customer.phone,
    firstName:  customer.first_name,
    lastName:   customer.last_name,
    name,
    state:      customer.state,
    tags:       String(customer.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
    note:       customer.note,
    ordersCount: toNumber(customer.orders_count),
    totalSpent:  toNumber(customer.total_spent),
    currency:    customer.currency,
    defaultAddress: {
      address1: defaultAddress.address1,
      address2: defaultAddress.address2,
      city:     defaultAddress.city,
      province: defaultAddress.province,
      country:  defaultAddress.country,
      zip:      defaultAddress.zip,
    },
    shopifyCreatedAt: toDate(customer.created_at),
    shopifyUpdatedAt: toDate(customer.updated_at),
    raw: customer,
  };
}

// Amazon normalizers
function normalizeAmazonOrder({ companyId, channelId, shop, order }) {
  const buyer           = order.BuyerInfo || {};
  const shippingAddress = order.ShippingAddress || {};
  const orderTotal      = order.OrderTotal || {};
  const purchaseDate    = toDate(order.PurchaseDate);
  const isCanceled      = order.OrderStatus === "Canceled";
  const isFulfilled     = ["Shipped", "PartiallyShipped"].includes(order.OrderStatus);

  return {
    companyId, channelId, provider: "amazon", shop,
    externalId:         String(order.AmazonOrderId),
    name:               order.AmazonOrderId,
    email:              buyer.BuyerEmail,
    phone:              shippingAddress.Phone,
    customerExternalId: buyer.BuyerEmail || buyer.BuyerName || order.AmazonOrderId,
    customerName:       buyer.BuyerName || buyer.BuyerEmail || "Amazon customer",
    financialStatus:    isCanceled ? "voided" : order.OrderStatus === "Pending" ? "pending" : "paid",
    fulfillmentStatus:  isCanceled ? "cancelled" : isFulfilled ? "fulfilled" : "unfulfilled",
    tags:               [order.SalesChannel, order.FulfillmentChannel, order.OrderType].filter(Boolean),
    currency:           orderTotal.CurrencyCode || order.BuyerTaxInfo?.CurrencyCode,
    totalPrice:         toNumber(orderTotal.Amount),
    subtotalPrice:      toNumber(orderTotal.Amount),
    totalTax:           0,
    isCOD:              false,
    codAmount:          0,
    paymentGatewayNames: [order.PaymentMethod].filter(Boolean),
    lineItems:          [],
    shippingAddress: {
      name:        shippingAddress.Name,
      address1:    shippingAddress.AddressLine1,
      city:        shippingAddress.City,
      province:    shippingAddress.StateOrRegion,
      country:     shippingAddress.CountryCode,
      countryCode: shippingAddress.CountryCode,
      zip:         shippingAddress.PostalCode,
    },
    omsStatus:        "pending",
    shopifyCreatedAt: purchaseDate,
    processedAt:      purchaseDate,
    cancelledAt:      isCanceled ? toDate(order.LastUpdateDate) || purchaseDate : undefined,
    raw:              order,
  };
}

function normalizeAmazonCustomer({ companyId, channelId, shop, order }) {
  const buyer           = order.BuyerInfo || {};
  const shippingAddress = order.ShippingAddress || {};
  const externalId      = buyer.BuyerEmail || buyer.BuyerName || order.AmazonOrderId;
  return {
    companyId, channelId, provider: "amazon", shop,
    externalId: String(externalId),
    email:      buyer.BuyerEmail,
    phone:      shippingAddress.Phone,
    name:       buyer.BuyerName || buyer.BuyerEmail || "Amazon customer",
    state:      order.OrderStatus,
    tags:       [order.SalesChannel, order.FulfillmentChannel].filter(Boolean),
    ordersCount: 1,
    totalSpent:  toNumber(order.OrderTotal?.Amount),
    currency:    order.OrderTotal?.CurrencyCode,
    defaultAddress: {
      address1: shippingAddress.AddressLine1,
      address2: shippingAddress.AddressLine2,
      city:     shippingAddress.City,
      province: shippingAddress.StateOrRegion,
      country:  shippingAddress.CountryCode,
      zip:      shippingAddress.PostalCode,
    },
    shopifyCreatedAt: toDate(order.PurchaseDate),
    shopifyUpdatedAt: toDate(order.LastUpdateDate),
    raw: order,
  };
}

function normalizeAmazonProduct({ companyId, channelId, shop, listing }) {
  const summary = listing.summaries?.[0] || {};
  const offer   = listing.offers?.[0] || {};
  const availability = listing.fulfillmentAvailability?.[0] || {};
  const price = offer.price?.amount ?? offer.listingPrice?.amount;
  const sku = listing.sku || summary.sellerSku;
  const title = summary.itemName || sku || "Amazon listing";
  const imageUrl = summary.mainImage?.link || summary.mainImage?.url;
  return {
    companyId, channelId, provider: "amazon", shop,
    externalId:  String(sku || summary.asin || listing.asin),
    title,
    handle:      summary.asin || listing.asin,
    status:      Array.isArray(summary.status) ? summary.status.join(", ") : summary.status,
    vendor:      summary.brandName,
    productType: summary.productType || listing.productType,
    tags:        [summary.asin || listing.asin, summary.fulfillmentChannelCode].filter(Boolean),
    imageUrl,
    totalInventory: toNumber(availability.quantity),
    variants: [{ externalId: String(sku || summary.asin || listing.asin), title, sku: sku || "", price: toNumber(price), inventoryQuantity: toNumber(availability.quantity) }],
    shopifyCreatedAt: toDate(summary.createdDate),
    shopifyUpdatedAt: toDate(summary.lastUpdatedDate) || new Date(),
    publishedAt:      toDate(summary.createdDate),
    raw:              listing,
  };
}

// ─── Bulk Upsert ─────────────────────────────────────────────────────────────

function recordFilter(r) {
  const compIdStr = String(r.companyId || "");
  const compFilter = mongoose.Types.ObjectId.isValid(compIdStr)
    ? { $in: [compIdStr, new mongoose.Types.ObjectId(compIdStr)] }
    : compIdStr;

  const chanIdStr = r.channelId ? String(r.channelId) : "";
  const chanFilter = chanIdStr && mongoose.Types.ObjectId.isValid(chanIdStr)
    ? { $in: [chanIdStr, new mongoose.Types.ObjectId(chanIdStr)] }
    : chanIdStr ? chanIdStr : { $exists: true };

  return {
    companyId:  compFilter,
    channelId:  chanFilter,
    externalId: String(r.externalId),
  };
}

async function bulkUpsert(model, records, filterForRecord, { preserveOnUpdate = [] } = {}) {
  if (!records.length) return;
  await model.bulkWrite(
    records.map((record) => {
      const updateDoc = { ...record };
      delete updateDoc._id;

      // Fields we own in our own OMS (e.g. omsStatus) should only be set on first
      // insert — a re-sync from Shopify must never stomp on shipped/cancelled state
      // we've already recorded locally.
      const setOnInsert = {};
      for (const field of preserveOnUpdate) {
        if (field in updateDoc) {
          setOnInsert[field] = updateDoc[field];
          delete updateDoc[field];
        }
      }

      const update = { $set: updateDoc };
      if (Object.keys(setOnInsert).length) update.$setOnInsert = setOnInsert;

      return {
        updateOne: { filter: filterForRecord(record), update, upsert: true },
      };
    }),
    { ordered: false },
  );
}

// Customers: never overwrite CRM-only follow-up fields on re-sync
async function customerBulkUpsert(records, filterForRecord) {
  if (!records.length) return;
  const CRM_FIELDS = ["followUps", "followUpStatus", "nextFollowUpAt"];
  await SyncedCustomer.bulkWrite(
    records.map((record) => {
      const updateDoc = { ...record };
      delete updateDoc._id;
      // Remove CRM fields from $set so they are never reset by Shopify sync
      const setOnInsert = {};
      for (const f of CRM_FIELDS) {
        if (f in updateDoc) {
          setOnInsert[f] = updateDoc[f];
          delete updateDoc[f];
        }
      }
      const update = { $set: updateDoc };
      if (Object.keys(setOnInsert).length) update.$setOnInsert = setOnInsert;
      return {
        updateOne: { filter: filterForRecord(record), update, upsert: true },
      };
    }),
    { ordered: false },
  );
}

const orderFilter    = recordFilter;
const productFilter  = recordFilter;
const customerFilter = recordFilter;

// Defense-in-depth: if two documents ever exist for the same (companyId, externalId)
// — e.g. a webhook-created partial record racing a full sync, or any residual data
// from before the Mixed-type companyId/channelId write-filter fix — prefer the one
// with a fuller Shopify payload (note_attributes present, needed for UTM/ad
// attribution) instead of whichever happened to come first in sort order.
function deduplicateRecords(records) {
  const bestByKey = new Map();
  for (const r of records) {
    const key = `${String(r.companyId)}::${String(r.externalId || r.id || r._id)}`;
    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, r);
      continue;
    }
    const existingScore = existing.raw?.note_attributes?.length ? 1 : 0;
    const candidateScore = r.raw?.note_attributes?.length ? 1 : 0;
    if (candidateScore > existingScore) bestByKey.set(key, r);
  }
  return [...bestByKey.values()];
}

// ─── Shopify Sync ─────────────────────────────────────────────────────────────

export async function saveSyncedShopifyData({ companyId, channelId, shop, orders = [], products = [], customers = [] }) {
  const provider    = "shopify";
  const normOrders  = orders.map((o) => normalizeOrder({ companyId, channelId, provider, shop, order: o }));
  const normProds   = products.map((p) => normalizeProduct({ companyId, channelId, provider, shop, product: p }));
  const normCusts   = customers.map((c) => normalizeCustomer({ companyId, channelId, provider, shop, customer: c }));

  if (isMongoConnected()) {
    await Promise.all([
      bulkUpsert(SyncedOrder, normOrders, orderFilter, { preserveOnUpdate: ["omsStatus"] }),
      bulkUpsert(SyncedProduct, normProds, productFilter),
      customerBulkUpsert(normCusts, customerFilter),
    ]);

    const compIdStr = String(companyId);
    const compFilter = mongoose.Types.ObjectId.isValid(compIdStr)
      ? { $in: [compIdStr, new mongoose.Types.ObjectId(compIdStr)] }
      : compIdStr;

    const [dbOrders, dbProducts, dbCustomers] = await Promise.all([
      normOrders.length ? SyncedOrder.find({ companyId: compFilter, externalId: { $in: normOrders.map((o) => o.externalId) } }).lean() : [],
      normProds.length ? SyncedProduct.find({ companyId: compFilter, externalId: { $in: normProds.map((p) => p.externalId) } }).lean() : [],
      normCusts.length ? SyncedCustomer.find({ companyId: compFilter, externalId: { $in: normCusts.map((c) => c.externalId) } }).lean() : [],
    ]);

    return {
      orders: dbOrders.length ? dbOrders : normOrders,
      products: dbProducts.length ? dbProducts : normProds,
      customers: dbCustomers.length ? dbCustomers : normCusts,
    };
  } else {
    for (const o of normOrders)  memory.orders.set(`${companyId}:${channelId}:${o.externalId}`, clone(o));
    for (const p of normProds)   memory.products.set(`${companyId}:${channelId}:${p.externalId}`, clone(p));
    for (const c of normCusts)   memory.customers.set(`${companyId}:${channelId}:${c.externalId}`, clone(c));
  }

  return { orders: normOrders, products: normProds, customers: normCusts };
}

// Upsert a single order (used by webhook handlers)
export async function upsertSingleOrder({ companyId, channelId, provider, shop, order }) {
  const normalized = provider === "shopify"
    ? normalizeOrder({ companyId, channelId, provider, shop, order })
    : normalizeAmazonOrder({ companyId, channelId, shop, order });

  // omsStatus is owned by our own fulfillment flow (shipped/cancelled/etc) — never
  // let a webhook re-sync stomp on it after the first insert.
  const { omsStatus, ...updateFields } = normalized;

  if (isMongoConnected()) {
    return SyncedOrder.findOneAndUpdate(
      orderFilter(normalized),
      { $set: updateFields, $setOnInsert: { omsStatus } },
      { new: true, upsert: true },
    ).lean();
  }

  const key = `${companyId}:${channelId}:${normalized.externalId}`;
  const existing = memory.orders.get(key);
  const stored = existing ? { ...existing, ...updateFields } : { _id: id(), ...normalized };
  memory.orders.set(key, clone(stored));
  return clone(stored);
}

// Creates an order entirely inside the panel — no Shopify/Amazon channel
// involved (phone/WhatsApp orders, walk-ins, anything not placed through a
// connected sales channel). Lands with omsStatus:"pending", so it shows up in
// the exact same Fulfillment "ready to ship" queue as every synced order —
// the whole ship/track/cancel pipeline downstream is unchanged, this only
// adds a second way to get an order INTO that queue.
export async function createLocalOrder({ companyId, customer = {}, shippingAddress = {}, lineItems = [], isCOD = true, note = "" }) {
  const cleanItems = (lineItems || [])
    .filter((item) => item && item.title)
    .map((item) => ({
      title: String(item.title).trim(),
      sku: item.sku || "",
      quantity: Math.max(1, Number(item.quantity) || 1),
      price: Math.max(0, Number(item.price) || 0),
      grams: Number(item.grams) || 0,
      requiresShipping: item.requiresShipping !== false,
    }));

  if (!cleanItems.length) return { error: "At least one line item is required" };
  if (!shippingAddress.zip) return { error: "Shipping address PIN code is required" };

  const totalPrice = cleanItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const externalId = `local-${id()}`;
  const shortCode = Date.now().toString(36).toUpperCase().slice(-6);

  const orderDoc = {
    companyId,
    channelId: undefined,
    provider: "local",
    shop: "local",
    externalId,
    name: `#LC-${shortCode}`,
    email: customer.email || "",
    phone: customer.phone || shippingAddress.phone || "",
    customerName: customer.name || shippingAddress.name || "Customer",
    financialStatus: isCOD ? "pending" : "paid",
    fulfillmentStatus: "unfulfilled",
    note,
    currency: "INR",
    totalPrice,
    subtotalPrice: totalPrice,
    isCOD,
    codAmount: isCOD ? totalPrice : 0,
    shippingAddress: {
      name: shippingAddress.name || customer.name || "",
      address1: shippingAddress.address1 || "",
      address2: shippingAddress.address2 || "",
      city: shippingAddress.city || "",
      province: shippingAddress.province || "",
      country: shippingAddress.country || "India",
      zip: String(shippingAddress.zip || ""),
      phone: shippingAddress.phone || customer.phone || "",
    },
    lineItems: cleanItems,
    omsStatus: "pending",
    shopifyCreatedAt: new Date(),
    raw: { manualCreate: true },
    tags: ["local-order"],
  };

  if (isMongoConnected()) {
    const order = await SyncedOrder.create(orderDoc);
    return { order: order.toObject() };
  }

  const stored = { _id: id(), ...orderDoc, createdAt: now(), updatedAt: now() };
  memory.orders.set(`${companyId}:local:${externalId}`, stored);
  return { order: clone(stored) };
}

export async function updateOrderOmsStatus({ companyId, shopifyOrderId, update }) {
  if (isMongoConnected()) {
    const compIdStr = String(companyId || "");
    const compFilter = mongoose.Types.ObjectId.isValid(compIdStr)
      ? { $in: [compIdStr, new mongoose.Types.ObjectId(compIdStr)] }
      : compIdStr;
    return SyncedOrder.findOneAndUpdate(
      { companyId: compFilter, externalId: shopifyOrderId },
      { $set: update },
      { new: true },
    ).lean();
  }

  for (const order of memory.orders.values()) {
    if (String(order.companyId) === String(companyId) && order.externalId === shopifyOrderId) {
      Object.assign(order, update, { updatedAt: now() });
      return clone(order);
    }
  }
  return null;
}

// ─── Amazon Sync ─────────────────────────────────────────────────────────────

export async function saveSyncedAmazonData({ companyId, channelId, shop, orders = [], products = [] }) {
  const normOrders   = orders.map((o) => normalizeAmazonOrder({ companyId, channelId, shop, order: o }));
  const customerMap  = new Map();
  orders.forEach((o) => {
    const c = normalizeAmazonCustomer({ companyId, channelId, shop, order: o });
    if (c.externalId) {
      const ex = customerMap.get(c.externalId);
      customerMap.set(c.externalId, { ...c, ordersCount: toNumber(ex?.ordersCount) + 1, totalSpent: toNumber(ex?.totalSpent) + toNumber(c.totalSpent) });
    }
  });
  const normCusts  = [...customerMap.values()];
  const normProds  = products.map((p) => normalizeAmazonProduct({ companyId, channelId, shop, listing: p })).filter((p) => p.externalId && p.title);

  if (isMongoConnected()) {
    await Promise.all([
      bulkUpsert(SyncedOrder, normOrders, orderFilter, { preserveOnUpdate: ["omsStatus"] }),
      bulkUpsert(SyncedProduct, normProds, productFilter),
      bulkUpsert(SyncedCustomer, normCusts, customerFilter),
    ]);
  } else {
    for (const o of normOrders) memory.orders.set(`${companyId}:${channelId}:${o.externalId}`, clone(o));
    for (const p of normProds)  memory.products.set(`${companyId}:${channelId}:${p.externalId}`, clone(p));
    for (const c of normCusts)  memory.customers.set(`${companyId}:${channelId}:${c.externalId}`, clone(c));
  }

  return { orders: normOrders, products: normProds, customers: normCusts };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

// Layers manualDiscount/manualExtraCharge on top of the channel-reported
// totalPrice at READ time — never persisted back into totalPrice itself, so
// a Shopify re-sync (which re-writes totalPrice straight from the live
// order on every poll/webhook) can never silently wipe out an adjustment.
// originalTotalPrice is kept on the returned object too, so the UI can show
// "₹499 (adjusted from ₹549)" instead of hiding that a manual edit happened.
function applyManualAdjustments(order) {
  const discount = toNumber(order.manualDiscount);
  const extraCharge = toNumber(order.manualExtraCharge);
  if (!discount && !extraCharge) return order;

  const originalTotalPrice = toNumber(order.totalPrice);
  return {
    ...order,
    originalTotalPrice,
    totalPrice: Math.max(0, originalTotalPrice - discount + extraCharge),
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
    return {
      orders: deduplicateRecords(orders).map(applyManualAdjustments),
      products: deduplicateRecords(products),
      customers: deduplicateRecords(customers),
      channels,
    };
  }

  const owned = (e) => String(e.companyId) === String(companyId);
  return {
    orders:    deduplicateRecords([...memory.orders.values()].filter(owned).sort((a, b) => new Date(b.shopifyCreatedAt || 0) - new Date(a.shopifyCreatedAt || 0))).map(applyManualAdjustments),
    products:  deduplicateRecords([...memory.products.values()].filter(owned).sort((a, b) => new Date(b.shopifyUpdatedAt || 0) - new Date(a.shopifyUpdatedAt || 0))),
    customers: deduplicateRecords([...memory.customers.values()].filter(owned).sort((a, b) => new Date(b.shopifyUpdatedAt || 0) - new Date(a.shopifyUpdatedAt || 0))),
    channels:  [...memory.channels.values()].filter(owned).map(withoutCredentials),
  };
}

function publicSyncedRecord(record, channels = []) {
  const copy    = clone(record);
  const channel = channels.find((ch) => String(ch._id) === String(copy.channelId));
  copy.id           = copy._id || copy.externalId;
  copy.channelName  = channel?.name || copy.provider;
  copy.channelStatus = channel?.status || "connected";
  copy.channelShop  = channel?.shop || copy.shop;

  // Orders carry their full Shopify payload in `raw` (landing_site,
  // referring_site, note_attributes) — parseUtmFromOrder already derives
  // campaign attribution from it for ad-spend matching, but nothing ever
  // surfaced those fields on the order itself, and `raw` is deleted right
  // below before this goes to the frontend. orders-view.jsx has always
  // read order.utmSource/utmCampaign/order.landingSite expecting them to
  // exist — they never did, so that "which campaign was this order from"
  // card never rendered for any order. Deriving it here (from the same
  // `raw` data attribution already uses) fixes that for every order,
  // historical included, with no backfill needed.
  if (copy.raw && (copy.provider === "shopify" || copy.externalId)) {
    const utm = parseUtmFromOrder(copy);
    copy.utmSource = utm.source || "";
    copy.utmMedium = utm.medium || "";
    copy.utmCampaign = utm.campaign || "";
    copy.utmContent = utm.content || "";
    copy.landingSite = copy.raw?.landing_site || "";
  }

  // What the CUSTOMER was actually charged for shipping at Shopify checkout
  // — never captured into its own field on sync (see totalShipping's schema
  // comment), so it silently disappeared into totalPrice with nothing to
  // show it on the order or its invoice. Same fix as the UTM block above:
  // derive it from the raw payload already stored on every order, at read
  // time, so it appears immediately for existing orders too — no resync or
  // backfill needed. Shopify's modern orders carry total_shipping_price_set;
  // older ones only have shipping_lines, so fall back to summing those.
  if (copy.raw && copy.totalShipping === undefined) {
    const raw = copy.raw;
    const fromSet = Number(raw.total_shipping_price_set?.shop_money?.amount);
    const fromLines = Array.isArray(raw.shipping_lines)
      ? raw.shipping_lines.reduce((sum, line) => sum + (Number(line.price) || 0), 0)
      : 0;
    copy.totalShipping = Number.isFinite(fromSet) && fromSet > 0 ? fromSet : fromLines;
  }

  // Same gap on customers: normalizeCustomer never mapped address1/address2
  // from Shopify's default_address into our own defaultAddress (only
  // city/province/country/zip), even though the schema had fields for them
  // and the full address was sitting right there in raw the whole time — so
  // "Create Order" pre-filled city but left the street address blank for
  // every customer synced before that mapping was added. Same read-time
  // derivation as above, so it's fixed immediately with no resync needed.
  if (copy.raw && copy.defaultAddress && !copy.defaultAddress.address1) {
    const rawAddress = copy.raw.default_address || {};
    if (rawAddress.address1) {
      copy.defaultAddress = { ...copy.defaultAddress, address1: rawAddress.address1, address2: rawAddress.address2 };
    }
  }

  delete copy.raw;
  return copy.totalPrice !== undefined ? applyManualAdjustments(copy) : copy;
}

function modelForResource(resource) {
  if (resource === "orders")    return SyncedOrder;
  if (resource === "products")  return SyncedProduct;
  if (resource === "customers") return SyncedCustomer;
  return null;
}

function memoryMapForResource(resource) {
  if (resource === "orders")    return memory.orders;
  if (resource === "products")  return memory.products;
  if (resource === "customers") return memory.customers;
  return null;
}

export async function listCommerceRecords({ companyId, resource, page = 1, limit = 200 }) {
  const model     = modelForResource(resource);
  const memoryMap = memoryMapForResource(resource);
  if (!model || !memoryMap) return null;

  if (isMongoConnected()) {
    const [records, channels] = await Promise.all([
      model.find({ companyId })
        .sort(resource === "orders" ? { shopifyCreatedAt: -1 } : { updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Channel.find({ companyId }).lean(),
    ]);
    return deduplicateRecords(records.map((r) => publicSyncedRecord(r, channels)));
  }

  const channels = [...memory.channels.values()].filter((ch) => String(ch.companyId) === String(companyId));
  return deduplicateRecords(
    [...memoryMap.values()]
      .filter((r) => String(r.companyId) === String(companyId))
      .map((r) => publicSyncedRecord(r, channels)),
  );
}

export async function getCommerceRecordForUpdate({ companyId, resource, recordId }) {
  const model     = modelForResource(resource);
  const memoryMap = memoryMapForResource(resource);
  if (!model || !memoryMap) return null;

  if (isMongoConnected()) {
    const isObjectId = mongoose.Types.ObjectId.isValid(recordId);
    const filter = isObjectId
      ? { $or: [{ _id: recordId }, { externalId: String(recordId) }], companyId }
      : { externalId: String(recordId), companyId };

    const record = await model.findOne(filter).lean();
    if (!record) return null;
    const isChanObjId = mongoose.Types.ObjectId.isValid(record.channelId);
    const chanFilter = isChanObjId
      ? { $or: [{ _id: record.channelId }, { provider: record.provider, companyId }], companyId }
      : { provider: record.provider, companyId };
    const channel = await Channel.findOne(chanFilter).select("+credentials.accessToken").lean();
    if (!channel) return null;
    return { record, channel };
  }

  const record = [...memoryMap.values()].find(
    (e) => (String(e._id) === String(recordId) || String(e.externalId) === String(recordId)) && String(e.companyId) === String(companyId),
  );
  if (!record) return null;
  const channel = memory.channels.get(record.channelId);
  if (!channel || String(channel.companyId) !== String(companyId)) return null;
  return { record: clone(record), channel: clone(channel) };
}

export async function getOrderById({ companyId, orderId }) {
  if (!orderId) return null;

  if (isMongoConnected()) {
    const isObjectId = mongoose.Types.ObjectId.isValid(orderId);
    const filter = isObjectId
      ? { $or: [{ _id: orderId }, { externalId: String(orderId) }], companyId }
      : { externalId: String(orderId), companyId };

    return SyncedOrder.findOne(filter).lean();
  }

  return clone(
    [...memory.orders.values()].find(
      (o) => String(o.companyId) === String(companyId) && (String(o._id) === String(orderId) || String(o.externalId) === String(orderId)),
    ) || null,
  );
}

export async function listPendingOrders(companyId, { page = 1, limit = 100 } = {}) {
  if (isMongoConnected()) {
    const orders = await SyncedOrder.find({
      companyId,
      omsStatus: { $in: ["pending", "awaiting_shipment"] },
      cancelledAt: null,
      // Exclude orders that Shopify already marked as fulfilled (e.g. fulfilled via another channel or Shopify admin)
      fulfillmentStatus: { $nin: ["fulfilled", "partial"] },
    })
      .sort({ shopifyCreatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return deduplicateRecords(orders);
  }
  return deduplicateRecords(
    [...memory.orders.values()]
      .filter((o) =>
        String(o.companyId) === String(companyId) &&
        ["pending", "awaiting_shipment"].includes(o.omsStatus) &&
        !o.cancelledAt &&
        !["fulfilled", "partial"].includes(o.fulfillmentStatus),
      )
      .sort((a, b) => new Date(b.shopifyCreatedAt || 0) - new Date(a.shopifyCreatedAt || 0)),
  );
}

export async function listFulfilledOrders(companyId, { page = 1, limit = 200 } = {}) {
  if (isMongoConnected()) {
    const orders = await SyncedOrder.find({
      companyId,
      $or: [
        { fulfillmentStatus: { $in: ["fulfilled", "partial"] } },
        { omsStatus: "shipped" },
      ],
    })
      .sort({ shopifyCreatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return deduplicateRecords(orders);
  }
  return deduplicateRecords(
    [...memory.orders.values()]
      .filter((o) =>
        String(o.companyId) === String(companyId) &&
        (["fulfilled", "partial"].includes(o.fulfillmentStatus) || o.omsStatus === "shipped"),
      )
      .sort((a, b) => new Date(b.shopifyCreatedAt || 0) - new Date(a.shopifyCreatedAt || 0)),
  );
}

export async function listActiveShipmentOrders(companyId) {
  if (isMongoConnected()) {
    return SyncedOrder.find({ companyId, omsStatus: "shipped" }).sort({ shopifyCreatedAt: -1 }).limit(500).lean();
  }
  return [...memory.orders.values()]
    .filter((o) => String(o.companyId) === String(companyId) && o.omsStatus === "shipped")
    .sort((a, b) => new Date(b.shopifyCreatedAt || 0) - new Date(a.shopifyCreatedAt || 0));
}

// ─── Dashboard Summary Helper ───────────────────────────────────────────────

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDate(left, right) {
  return startOfDay(left).getTime() === startOfDay(right).getTime();
}

// Always the full rupee value with 2 decimals, never abbreviated (no k/L) —
// matches the app-wide formatMoney convention in lib/utils.js on the frontend.
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

// Maps the topbar period selector to a concrete date range. The trend chart /
// channel mix / recent orders sections scope to this range — the Today /
// Yesterday / Monthly KPI cards stay fixed since those are inherently
// period-labeled and shouldn't rename themselves when the selector changes.
function resolvePeriodRange(period, today) {
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  if (period === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const yEnd = new Date(y);
    yEnd.setHours(23, 59, 59, 999);
    return { start: y, end: yEnd };
  }
  if (period === "month") {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end };
  }
  if (period === "last90") {
    const start = new Date(today);
    start.setDate(start.getDate() - 89);
    return { start, end };
  }
  if (period === "lifetime") {
    return { start: new Date("2000-01-01"), end };
  }
  // "today" / default
  return { start: today, end };
}

// Real per-order profit — replaces what used to be a flat "totalPrice × 18%"
// guess everywhere it was shown (this dashboard's trend chart and Recent
// Orders table). Cost = each line item's SKU buying price (SkuCost) + its
// mapped packaging cost (Asset unitCost via AssetMapping), both ₹0 until
// actually set — never a guessed percentage. Same "never fabricate" rule
// getMfgCostTotal already follows for Finance.
async function buildOrderCostLookup(companyId) {
  const [skuCosts, assetMappings, assets] = await Promise.all([
    listSkuCosts(companyId),
    listAssetMappings(companyId),
    listAssets(companyId),
  ]);

  // Each SKU carries the current price PLUS a sorted history of past prices.
  // priceAtDate(sku, orderDate) walks that history to find the buying price
  // that was in effect on the order's date — so a price change today doesn't
  // silently rewrite profit on orders that shipped months ago.
  const skuCostMap = new Map(skuCosts.map((c) => [c.sku, c]));

  function priceAtDate(sku, orderDate) {
    const cost = skuCostMap.get(sku);
    if (!cost) return 0;
    const current = toNumber(cost.buyingPrice);
    if (!orderDate || !(cost.priceHistory?.length)) return current;
    // priceHistory entries record the OLD price and when it was replaced.
    // If the order is before the earliest price-change date, use the oldest
    // historical price. Otherwise use current.
    const sorted = [...(cost.priceHistory || [])].sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));
    const orderTs = new Date(orderDate).getTime();
    for (const entry of sorted) {
      if (orderTs < new Date(entry.changedAt).getTime()) {
        return toNumber(entry.buyingPrice);
      }
    }
    return current;
  }

  const assetCostById = new Map(assets.map((a) => [String(a._id || a.id), toNumber(a.unitCost)]));
  const packagingCostBySku = new Map();
  for (const mapping of assetMappings) {
    const cost = (mapping.consumes || []).reduce(
      (sum, c) => sum + (assetCostById.get(String(c.assetId)) || 0) * toNumber(c.quantity),
      0,
    );
    packagingCostBySku.set(mapping.sku, cost);
  }

  // Keep a current-price map too (used by inventory/costing pages that don't
  // have an order date to anchor to).
  const buyingPriceBySku = new Map(skuCosts.map((c) => [c.sku, toNumber(c.buyingPrice)]));

  return { buyingPriceBySku, packagingCostBySku, priceAtDate };
}

// Cost only counts for line items with a real Shopify SKU — items without
// one (synthetic "novar-..." identifiers used elsewhere for costing) can't
// be matched from an order's own line-item data, same limitation
// getMfgCostTotal already has. Uncosted items contribute ₹0 cost, same as
// there — this can overstate profit for products you haven't priced yet,
// never understate it with a guess.
// orderDate is used for historical buying-price lookup; if omitted the
// current price is used.
function computeOrderCost(order, { buyingPriceBySku, packagingCostBySku, priceAtDate }) {
  const orderDate = order.shopifyCreatedAt || order.createdAt;
  let cost = 0;
  for (const item of order.lineItems || []) {
    if (!item.sku) continue;
    const qty = toNumber(item.quantity) || 1;
    // Use historical price if available, fall back to current-price map.
    const bp = priceAtDate ? priceAtDate(item.sku, orderDate) : (buyingPriceBySku.get(item.sku) || 0);
    const pp = packagingCostBySku.get(item.sku) || 0;
    cost += (bp + pp) * qty;
  }
  return cost;
}

export async function getDashboardSummary(companyId, { period } = {}) {
  const [{ orders, products, customers, channels }, costLookup] = await Promise.all([
    getSavedCommerceData(companyId),
    buildOrderCostLookup(companyId),
  ]);
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const currency = orders.find((order) => order.currency)?.currency || channels.find((channel) => channel.metrics?.currency)?.metrics?.currency || "INR";

  const periodRange = resolvePeriodRange(period, today);
  // Trend chart needs at least a handful of points to be readable — a single-day
  // period (Today/Yesterday) falls back to a 7-day trailing window ending on
  // that day instead of rendering one lonely bar.
  const rangeSpanDays = Math.round((periodRange.end - periodRange.start) / 86400000) + 1;
  const trendStart = rangeSpanDays >= 3
    ? periodRange.start
    : (() => { const d = new Date(periodRange.end); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d; })();
  const trendDays = Math.max(1, Math.round((periodRange.end - trendStart) / 86400000) + 1);

  // Exclude cancelled/voided/refunded/RTO orders and Shopify test orders from
  // revenue — none of these are real sales. getSavedCommerceData deliberately
  // doesn't pre-filter test orders (Orders/Fulfillment still need to show and
  // manage them operationally), so isTestOrder is excluded here explicitly.
  const revenueOrders = orders.filter((o) => isRevenueOrder(o) && !o.isTestOrder);
  const salesTotal = revenueOrders.reduce((total, order) => total + toNumber(order.totalPrice), 0);
  const todaySales = revenueOrders
    .filter((order) => order.shopifyCreatedAt && isSameDate(new Date(order.shopifyCreatedAt), today))
    .reduce((total, order) => total + toNumber(order.totalPrice), 0);
  const yesterdaySales = revenueOrders
    .filter((order) => order.shopifyCreatedAt && isSameDate(new Date(order.shopifyCreatedAt), yesterday))
    .reduce((total, order) => total + toNumber(order.totalPrice), 0);
  const monthlySales = revenueOrders
    .filter((order) => order.shopifyCreatedAt && new Date(order.shopifyCreatedAt) >= monthStart)
    .reduce((total, order) => total + toNumber(order.totalPrice), 0);
  const pendingOrders = orders.filter((order) => order.fulfillmentStatus === "unfulfilled" && !order.cancelledAt).length;
  const cancelledOrders = orders.filter((order) => order.cancelledAt || order.financialStatus === "voided").length;
  const deliveredOrders = orders.filter((order) => order.fulfillmentStatus === "fulfilled").length;
  const lowStockProducts = products.filter((product) => toNumber(product.totalInventory) <= 5).length;

  // Trend chart: daily buckets for shorter windows, weekly buckets once the
  // selected period gets wide (Last 90 Days) so the chart stays readable.
  const useWeeklyBuckets = trendDays > 31;
  const trendBucketCount = useWeeklyBuckets ? Math.ceil(trendDays / 7) : trendDays;
  const salesTrend = [...Array(trendBucketCount)].map((_, index) => {
    const bucketStart = new Date(trendStart);
    bucketStart.setDate(trendStart.getDate() + index * (useWeeklyBuckets ? 7 : 1));
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketStart.getDate() + (useWeeklyBuckets ? 6 : 0));
    bucketEnd.setHours(23, 59, 59, 999);

    // Use revenueOrders so cancelled orders don't skew the chart
    const bucketOrders = revenueOrders.filter((order) => {
      if (!order.shopifyCreatedAt) return false;
      const d = new Date(order.shopifyCreatedAt);
      return d >= bucketStart && d <= bucketEnd;
    });
    const sales = bucketOrders.reduce((total, order) => total + toNumber(order.totalPrice), 0);
    const bucketCost = bucketOrders.reduce((total, order) => total + computeOrderCost(order, costLookup), 0);

    return {
      day: useWeeklyBuckets
        ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(bucketStart)
        : (trendDays <= 7 ? dayLabel(bucketStart) : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(bucketStart)),
      sales,
      profit: Math.round(sales - bucketCost),
      orders: bucketOrders.length,
    };
  });

  // Channel mix + recent orders scope to the selected period (defaults to "today").
  const periodOrders = revenueOrders.filter((order) => {
    if (!order.shopifyCreatedAt) return false;
    const d = new Date(order.shopifyCreatedAt);
    return d >= periodRange.start && d <= periodRange.end;
  });

  const salesByChannel = channels.map((channel) => {
    const channelOrders = periodOrders.filter((order) => String(order.channelId) === String(channel._id));
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
      { label: "Today's Sales", value: formatMoney(todaySales, currency), change: `${revenueOrders.filter((order) => order.shopifyCreatedAt && isSameDate(new Date(order.shopifyCreatedAt), today)).length} orders`, tone: "green" },
      { label: "Yesterday Sales", value: formatMoney(yesterdaySales, currency), change: `${revenueOrders.filter((order) => order.shopifyCreatedAt && isSameDate(new Date(order.shopifyCreatedAt), yesterday)).length} orders`, tone: "blue" },
      { label: "Monthly Revenue", value: formatMoney(monthlySales, currency), change: `${revenueOrders.length} paid orders`, tone: "green" },
      { label: "Lifetime Revenue", value: formatMoney(salesTotal, currency), change: `${revenueOrders.length} paid orders all-time`, tone: "indigo" },
      { label: "Total Orders", value: orders.length.toLocaleString("en-IN"), change: `${pendingOrders} pending`, tone: "blue" },
      { label: "Avg Order Value", value: formatMoney(revenueOrders.length ? salesTotal / revenueOrders.length : 0, currency), change: "lifetime AOV", tone: "indigo" },
      { label: "Pending Orders", value: pendingOrders.toLocaleString("en-IN"), change: pendingOrders ? "needs shipping" : "all clear", tone: pendingOrders ? "amber" : "green" },
      { label: "Products", value: products.length.toLocaleString("en-IN"), change: `${lowStockProducts} low stock`, tone: lowStockProducts ? "amber" : "green" },
      { label: "Customers", value: customers.length.toLocaleString("en-IN"), change: `${channels.filter((channel) => channel.status === "connected").length} channels`, tone: "teal" },
      { label: "Connected Channels", value: channels.filter((channel) => channel.status === "connected").length.toLocaleString("en-IN"), change: `${channels.length} total linked`, tone: "teal" },
      { label: "Delivered", value: deliveredOrders.toLocaleString("en-IN"), change: `${orders.length ? Math.round((deliveredOrders / orders.length) * 100) : 0}% fulfilment`, tone: "green" },
      { label: "Cancelled", value: cancelledOrders.toLocaleString("en-IN"), change: `${orders.length ? Math.round((cancelledOrders / orders.length) * 100) : 0}% orders`, tone: cancelledOrders ? "rose" : "green" },
    ],
    period: period || "today",
    periodSales: periodOrders.reduce((total, order) => total + toNumber(order.totalPrice), 0),
    periodOrderCount: periodOrders.length,
    salesTrend,
    channelMix: channelMix.length ? channelMix : [{ name: "No synced sales", value: 100 }],
    recentOrders: periodOrders.slice(0, 8).map((order) => ({
      id: order.name || order.externalId,
      customer: order.customerName || "Guest customer",
      channel: channels.find((channel) => String(channel._id) === String(order.channelId))?.name || order.provider,
      status: order.fulfillmentStatus || order.financialStatus || "open",
      payment: order.financialStatus || "unknown",
      courier: order.fulfillmentStatus === "fulfilled" ? "Fulfilled" : "Pending",
      total: formatMoney(order.totalPrice, order.currency || currency),
      profit: formatMoney(toNumber(order.totalPrice) - computeOrderCost(order, costLookup), order.currency || currency),
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

// ─── Sales Analytics (Finance module) ───────────────────────────────────────

function parseDateRange({ from, to }) {
  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = from ? new Date(from) : new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export function bucketKey(date, groupBy) {
  const d = new Date(date);
  if (groupBy === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (groupBy === "week") {
    const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
    const pastDays = (d - firstDayOfYear) / 86400000;
    const week = Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return d.toISOString().slice(0, 10);
}

export function bucketLabel(key, groupBy) {
  if (groupBy === "month") {
    const [year, month] = key.split("-");
    return new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" }).format(new Date(Number(year), Number(month) - 1, 1));
  }
  if (groupBy === "week") return key;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(key));
}

// Every Finance function (revenue, shipping cost, refunds, mfg cost, ads
// attribution) is built on this — excluding test orders here means they can
// never leak into any expense/sales total anywhere, without having to
// remember to filter them at each call site.
export async function getOrdersInRange({ companyId, from, to, channelId }) {
  const { start, end } = parseDateRange({ from, to });

  if (isMongoConnected()) {
    const compIdStr = String(companyId);
    const compFilter = mongoose.Types.ObjectId.isValid(compIdStr)
      ? { $in: [compIdStr, new mongoose.Types.ObjectId(compIdStr)] }
      : compIdStr;
    const filter = {
      companyId: compFilter,
      shopifyCreatedAt: { $gte: start, $lte: end },
      isTestOrder: { $ne: true },
      ...(channelId ? { channelId } : {}),
    };
    const orders = await SyncedOrder.find(filter).sort({ shopifyCreatedAt: 1 }).limit(20000).lean();
    return { orders: deduplicateRecords(orders).map(applyManualAdjustments), start, end };
  }

  const owned = (o) =>
    String(o.companyId) === String(companyId) &&
    o.shopifyCreatedAt &&
    new Date(o.shopifyCreatedAt) >= start &&
    new Date(o.shopifyCreatedAt) <= end &&
    !o.isTestOrder &&
    (!channelId || String(o.channelId) === String(channelId));

  const orders = deduplicateRecords([...memory.orders.values()].filter(owned)).sort(
    (a, b) => new Date(a.shopifyCreatedAt) - new Date(b.shopifyCreatedAt),
  ).map(applyManualAdjustments);

  return { orders, start, end };
}

// An order counts as "clean revenue" only if it wasn't cancelled/voided/
// refunded and isn't a courier RTO ("Return to Origin" — shipment bounced
// back to us undelivered, tagged rto/rto_initiated). RTO is functionally a
// return, so its value is excluded from sales exactly like a refund.
export function isRevenueOrder(order) {
  return !order.cancelledAt
    && order.financialStatus !== "voided"
    && order.financialStatus !== "refunded"
    && !order.isRTO;
}

// Same historical/manually-imported fallback labels as channelReport() in
// reports.repo.js — orders with no live channelId (imported before a
// channel connection existed, or from a provider that's since been
// disconnected) still get a readable label instead of "Unknown".
const CHANNEL_PROVIDER_LABELS = { local: "Local Shop", website: "Website (Historical)", flipkart: "Flipkart", shopdeck: "Shopdeck", amazon: "Amazon", shopify: "Shopify" };

export async function getSalesAnalytics({ companyId, from, to, groupBy = "day", channelId }) {
  const [{ orders, start, end }, channels] = await Promise.all([
    getOrdersInRange({ companyId, from, to, channelId }),
    Channel.find({ companyId }).lean(),
  ]);
  const validOrders = orders.filter(isRevenueOrder);
  const channelNameById = new Map(channels.map((c) => [String(c._id), c.name || c.provider]));

  const currency = orders.find((o) => o.currency)?.currency || "INR";
  const revenue = validOrders.reduce((sum, o) => sum + toNumber(o.totalPrice), 0);
  const orderCount = validOrders.length;
  const aov = orderCount ? revenue / orderCount : 0;

  const buckets = new Map();
  for (const order of validOrders) {
    const key = bucketKey(order.shopifyCreatedAt, groupBy);
    const bucket = buckets.get(key) || { key, revenue: 0, orders: 0 };
    bucket.revenue += toNumber(order.totalPrice);
    bucket.orders += 1;
    buckets.set(key, bucket);
  }

  const trend = [...buckets.values()]
    .sort((a, b) => (a.key > b.key ? 1 : -1))
    .map((bucket) => ({
      period: bucketLabel(bucket.key, groupBy),
      key: bucket.key,
      revenue: Math.round(bucket.revenue),
      orders: bucket.orders,
      aov: bucket.orders ? Math.round(bucket.revenue / bucket.orders) : 0,
    }));

  const productTotals = new Map();
  const channelTotals = new Map();
  // City/state come straight from each order's real shipping address — the
  // same field the courier actually ships to — never inferred/guessed.
  // Grouped case-insensitively since Shopify/Amazon addresses arrive with
  // inconsistent capitalization ("Mumbai" vs "MUMBAI" vs "mumbai").
  const cityTotals = new Map();
  const stateTotals = new Map();
  for (const order of validOrders) {
    for (const item of order.lineItems || []) {
      const key = item.title || item.sku || "Unknown";
      const entry = productTotals.get(key) || { title: key, revenue: 0, quantity: 0 };
      entry.revenue += toNumber(item.price) * toNumber(item.quantity || 1);
      entry.quantity += toNumber(item.quantity || 1);
      productTotals.set(key, entry);
    }

    const channelKey = order.channelId ? String(order.channelId) : `provider:${order.provider}`;
    const channelEntry = channelTotals.get(channelKey) || {
      channelId: order.channelId ? String(order.channelId) : null,
      // channelBreakdown never carried a resolved name before — the frontend
      // had nothing to render but order counts, so "which channel" was
      // never actually visible. Same lookup+fallback pattern as
      // reports.repo.js's channelReport.
      channelName: (order.channelId && channelNameById.get(String(order.channelId))) || CHANNEL_PROVIDER_LABELS[order.provider] || "Unknown",
      revenue: 0,
      orders: 0,
    };
    channelEntry.revenue += toNumber(order.totalPrice);
    channelEntry.orders += 1;
    channelTotals.set(channelKey, channelEntry);

    const addr = order.shippingAddress || {};
    const rawCity = String(addr.city || "").trim();
    const rawState = String(addr.province || "").trim();
    if (rawCity) {
      const cityKey = rawCity.toLowerCase();
      const cityEntry = cityTotals.get(cityKey) || { city: rawCity, province: rawState, revenue: 0, orders: 0 };
      cityEntry.revenue += toNumber(order.totalPrice);
      cityEntry.orders += 1;
      cityTotals.set(cityKey, cityEntry);
    }
    if (rawState) {
      const stateKey = rawState.toLowerCase();
      const stateEntry = stateTotals.get(stateKey) || { province: rawState, revenue: 0, orders: 0 };
      stateEntry.revenue += toNumber(order.totalPrice);
      stateEntry.orders += 1;
      stateTotals.set(stateKey, stateEntry);
    }
  }

  const topProducts = [...productTotals.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((product) => ({ ...product, revenue: Math.round(product.revenue) }));

  const topCities = [...cityTotals.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((c) => ({ ...c, revenue: Math.round(c.revenue) }));

  const topStates = [...stateTotals.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((s) => ({ ...s, revenue: Math.round(s.revenue) }));

  const geoTaggedOrders = validOrders.filter((o) => o.shippingAddress?.city || o.shippingAddress?.province).length;

  return {
    range: { from: start.toISOString(), to: end.toISOString(), groupBy },
    totals: { currency, revenue: Math.round(revenue), orders: orderCount, aov: Math.round(aov) },
    trend,
    topProducts,
    topCities,
    topStates,
    // So the UI can be honest about coverage — e.g. historical-import orders
    // sometimes only captured a state, or neither, and that's not the same
    // as "zero orders from anywhere".
    geoTaggedOrders,
    // `key` is the Map's own grouping key (unique per row, unlike channelId
    // which is null for every provider-fallback row) — the frontend list
    // key needs it since two different providers can both have channelId:null.
    channelBreakdown: [...channelTotals.entries()].map(([key, channel]) => ({ ...channel, key, revenue: Math.round(channel.revenue) })),
  };
}

export async function getSalesTotal({ companyId, from, to }) {
  const { orders } = await getOrdersInRange({ companyId, from, to });
  const validOrders = orders.filter(isRevenueOrder);

  return {
    revenue: validOrders.reduce((sum, o) => sum + toNumber(o.totalPrice), 0),
    orders: validOrders.length,
  };
}

// Real per-order shipping cost only exists for Amazon (fixed at import, from
// what Amazon actually displayed for that order). Shopify shipments go
// through a prepaid courier wallet — the courier deducts per shipment from a
// balance we top up in bulk, so there is no clean per-order figure to trust
// or ask the user to enter one-by-one. Shopify's contribution to shipping
// cost instead comes entirely from Expense{category:"shipping"} rows (the
// wallet recharge amount, logged manually) — summed in finance.repo.js's
// getFinanceSummary alongside this Amazon-only total, never inside it (that
// would double count against expenseTotal, which already includes those
// same Expense rows once).
export async function getShippingCostTotal({ companyId, from, to }) {
  const { orders } = await getOrdersInRange({ companyId, from, to });
  return orders
    .filter((o) => !o.cancelledAt && o.provider === "amazon")
    .reduce((sum, o) => sum + toNumber(o.shippingCost), 0);
}

// The order rows behind getShippingCostTotal — powers the Finance tab's
// "Shipping Cost" card drilling into an order-wise table. Amazon only (see
// getShippingCostTotal) — Shopify orders aren't listed here since there's no
// real per-order figure to show or correct; their shipping cost is tracked
// as a lump-sum "shipping" Expense (wallet recharge) instead.
export async function listOrdersWithShippingCost({ companyId, from, to }) {
  const { orders } = await getOrdersInRange({ companyId, from, to });
  return orders
    .filter((o) => !o.cancelledAt && o.provider === "amazon")
    .sort((a, b) => new Date(b.shopifyCreatedAt) - new Date(a.shopifyCreatedAt));
}

// Manual override/entry for an order's real shipping cost — Amazon only (see
// getShippingCostTotal above for why Shopify orders don't get this).
export async function updateOrderShippingCost({ companyId, orderId, shippingCost }) {
  const order = await getOrderById({ companyId, orderId });
  if (!order) return null;
  if (order.provider !== "amazon") {
    return { error: "Shipping cost is only tracked per-order for Amazon. Log Shopify's courier-wallet recharge as a \"Shipping\" expense instead." };
  }
  return updateOrderOmsStatus({
    companyId,
    shopifyOrderId: order.externalId,
    update: { shippingCost: Math.max(0, toNumber(shippingCost)), shippingCostSource: "manual" },
  });
}

// Manual discount/extra-charge adjustment on any synced order (Shopify,
// Amazon, or manually-created) — unlike shipping cost above, this works for
// every provider, since it's the general "I want to give this customer an
// extra discount" / "add a packaging/handling charge" case, not tied to
// Amazon's per-order shipping fee specifically. Stored separately from
// totalPrice (see applyManualAdjustments) so it survives future re-syncs.
export async function updateOrderManualAdjustments({ companyId, orderId, discount, extraCharge, note }) {
  const order = await getOrderById({ companyId, orderId });
  if (!order) return null;

  const update = {
    manualDiscount: Math.max(0, toNumber(discount)),
    manualExtraCharge: Math.max(0, toNumber(extraCharge)),
    manualAdjustmentNote: String(note || "").slice(0, 500),
  };

  const updated = await updateOrderOmsStatus({ companyId, shopifyOrderId: order.externalId, update });
  return updated ? applyManualAdjustments(updated) : null;
}

// Customer-confirmation gate — set from the order row's Confirm/Decline
// buttons after someone actually reaches the customer (WhatsApp/call) to
// verify the order before it goes to fulfillment. Purely a status flag:
// doesn't block shipOrder() itself, since some sellers ship COD orders
// without ever calling to confirm — it's a visible signal, not a hard gate.
export async function updateOrderConfirmation({ companyId, orderId, status }) {
  if (!["pending", "confirmed", "declined"].includes(status)) {
    return { error: "Invalid confirmation status" };
  }
  const order = await getOrderById({ companyId, orderId });
  if (!order) return null;

  const update = {
    confirmationStatus: status,
    confirmedAt: status === "confirmed" ? new Date() : null,
  };
  const updated = await updateOrderOmsStatus({ companyId, shopifyOrderId: order.externalId, update });
  return updated ? applyManualAdjustments(updated) : null;
}

// Revenue that was refunded/cancelled/returned in this period — kept separate
// from the main revenue total so it can be shown as its own line item. RTO
// ("Return to Origin" — courier-tagged undelivered/bounced-back shipment) is
// included here too: functionally identical to a refund for sales purposes.
export async function getRefundedRevenueTotal({ companyId, from, to }) {
  const { orders } = await getOrdersInRange({ companyId, from, to });
  return orders
    .filter((o) => o.cancelledAt || o.financialStatus === "refunded" || o.financialStatus === "voided" || o.isRTO)
    .reduce((sum, o) => sum + toNumber(o.totalPrice), 0);
}

// The actual order rows behind getRefundedRevenueTotal — powers the
// Finance tab's "Refunded/Returned Revenue" card drilling down into a table
// instead of just showing a bare number.
export async function listRefundedOrders({ companyId, from, to }) {
  const { orders } = await getOrdersInRange({ companyId, from, to });
  return orders
    .filter((o) => o.cancelledAt || o.financialStatus === "refunded" || o.financialStatus === "voided" || o.isRTO)
    .map((o) => ({ ...o, returnReason: o.isRTO ? "rto" : (o.cancelledAt ? "cancelled" : o.financialStatus) }))
    .sort((a, b) => new Date(b.cancelledAt || b.shopifyCreatedAt) - new Date(a.cancelledAt || a.shopifyCreatedAt));
}

// Manufacturing/procurement cost of items actually sold in this period, using
// each SKU's buying price from Inventory & Costing. SKUs the user hasn't
// costed yet contribute ₹0 — this number gets more accurate as costs are
// filled in, it never guesses a cost that wasn't explicitly set.
export async function getMfgCostTotal({ companyId, from, to }) {
  const [{ orders }, skuCosts] = await Promise.all([
    getOrdersInRange({ companyId, from, to }),
    listSkuCosts(companyId),
  ]);
  const costBySku = new Map(skuCosts.map((c) => [c.sku, toNumber(c.buyingPrice)]));

  let total = 0;
  let costedUnits = 0;
  let uncostedUnits = 0;
  for (const order of orders) {
    if (order.cancelledAt) continue;
    for (const item of order.lineItems || []) {
      const qty = toNumber(item.quantity) || 1;
      const unitCost = item.sku ? costBySku.get(item.sku) : undefined;
      if (unitCost) {
        total += unitCost * qty;
        costedUnits += qty;
      } else {
        uncostedUnits += qty;
      }
    }
  }
  return { total, costedUnits, uncostedUnits };
}

// ─── Product Mappings ─────────────────────────────────────────────────────────

export async function listProductMappingOptions(companyId) {
  const products = await listCommerceRecords({ companyId, resource: "products" });
  return (products || []).flatMap((product) =>
    (product.variants?.length ? product.variants : [{ sku: "", externalId: "", title: "" }]).map((variant) => ({
      provider:      product.provider,
      channelId:     product.channelId,
      channelName:   product.channelName,
      productId:     product.externalId,
      productTitle:  product.title,
      variantId:     variant.externalId,
      variantTitle:  variant.title,
      sku:           variant.sku || "",
      label:         `${product.channelName || product.provider} / ${variant.sku || "No SKU"} / ${product.title}`,
    })),
  );
}

export async function listProductMappings(companyId) {
  if (isMongoConnected()) return ProductMapping.find({ companyId }).sort({ updatedAt: -1 }).lean();
  return [...memory.productMappings.values()].filter((m) => String(m.companyId) === String(companyId)).map(clone);
}

export async function saveProductMapping({ companyId, masterName, mappings }) {
  const cleanedName = String(masterName || "").trim();
  const cleanedMappings = (mappings || [])
    .filter((m) => m?.provider && (m.productId || m.sku))
    .map((m) => ({ provider: m.provider, channelId: m.channelId, productId: m.productId, productTitle: m.productTitle, sku: m.sku }));

  if (!cleanedName) return { error: "Master product name is required" };
  if (cleanedMappings.length < 2) return { error: "Select at least two channel products or SKUs to map" };

  if (isMongoConnected()) {
    const mapping = await ProductMapping.findOneAndUpdate(
      { companyId, masterName: cleanedName },
      { $set: { companyId, masterName: cleanedName, mappings: cleanedMappings } },
      { returnDocument: "after", upsert: true },
    ).lean();
    return { mapping };
  }

  const existing = [...memory.productMappings.values()].find(
    (m) => String(m.companyId) === String(companyId) && m.masterName === cleanedName,
  );
  const mapping = { _id: existing?._id || id(), companyId, masterName: cleanedName, mappings: cleanedMappings, createdAt: existing?.createdAt || now(), updatedAt: now() };
  memory.productMappings.set(mapping._id, mapping);
  return { mapping: clone(mapping) };
}
