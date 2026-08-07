import mongoose from "mongoose";
import { isMongoConnected } from "../config/database.js";
import { Channel } from "../models/channel.model.js";
import { SyncedOrder } from "../models/synced-order.model.js";
import { SyncedProduct } from "../models/synced-product.model.js";
import { SyncedCustomer } from "../models/synced-customer.model.js";
import { ProductMapping } from "../models/product-mapping.model.js";
import { memory, id, clone, now, toDate, toNumber, fullName } from "./memory-store.js";

// ─── Normalizers ─────────────────────────────────────────────────────────────

function isCodPayment(order) {
  const paymentGatewayNames = order.payment_gateway_names || [];
  const gatewayMatch = paymentGatewayNames.some((name) =>
    String(name).toLowerCase().includes("cod") ||
    String(name).toLowerCase().includes("cash") ||
    String(name).toLowerCase().includes("manual"),
  );

  const isPending = order.financial_status === "pending";
  const tagCod = String(order.tags || "").toLowerCase().includes("cod");

  return gatewayMatch || isPending || tagCod;
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
    totalDiscounts:     toNumber(order.total_discounts),
    paymentGatewayNames,
    isCOD:     cod,
    codAmount:  cod ? totalPrice : 0,
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
    raw:              order,
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

async function bulkUpsert(model, records, filterForRecord) {
  if (!records.length) return;
  await model.bulkWrite(
    records.map((record) => {
      const updateDoc = { ...record };
      delete updateDoc._id;

      return {
        updateOne: { filter: filterForRecord(record), update: { $set: updateDoc }, upsert: true },
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

function deduplicateRecords(records) {
  const seen = new Set();
  return records.filter((r) => {
    const key = `${String(r.companyId)}::${String(r.externalId || r.id || r._id)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Shopify Sync ─────────────────────────────────────────────────────────────

export async function saveSyncedShopifyData({ companyId, channelId, shop, orders = [], products = [], customers = [] }) {
  const provider    = "shopify";
  const normOrders  = orders.map((o) => normalizeOrder({ companyId, channelId, provider, shop, order: o }));
  const normProds   = products.map((p) => normalizeProduct({ companyId, channelId, provider, shop, product: p }));
  const normCusts   = customers.map((c) => normalizeCustomer({ companyId, channelId, provider, shop, customer: c }));

  if (isMongoConnected()) {
    await Promise.all([
      bulkUpsert(SyncedOrder, normOrders, orderFilter),
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

  if (isMongoConnected()) {
    return SyncedOrder.findOneAndUpdate(
      orderFilter(normalized),
      { $set: normalized },
      { new: true, upsert: true },
    ).lean();
  }

  const stored = { _id: id(), ...normalized };
  memory.orders.set(`${companyId}:${channelId}:${normalized.externalId}`, clone(stored));
  return clone(stored);
}

export async function updateOrderOmsStatus({ companyId, shopifyOrderId, update }) {
  if (isMongoConnected()) {
    return SyncedOrder.findOneAndUpdate(
      { companyId, externalId: shopifyOrderId },
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
      bulkUpsert(SyncedOrder, normOrders, orderFilter),
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

export async function getSavedCommerceData(companyId) {
  if (isMongoConnected()) {
    const [orders, products, customers, channels] = await Promise.all([
      SyncedOrder.find({ companyId }).sort({ shopifyCreatedAt: -1 }).limit(5000).lean(),
      SyncedProduct.find({ companyId }).sort({ shopifyUpdatedAt: -1 }).limit(5000).lean(),
      SyncedCustomer.find({ companyId }).sort({ shopifyUpdatedAt: -1 }).limit(5000).lean(),
      Channel.find({ companyId }).sort({ updatedAt: -1 }).lean(),
    ]);
    return {
      orders: deduplicateRecords(orders),
      products: deduplicateRecords(products),
      customers: deduplicateRecords(customers),
      channels,
    };
  }

  const owned = (e) => String(e.companyId) === String(companyId);
  return {
    orders:    deduplicateRecords([...memory.orders.values()].filter(owned).sort((a, b) => new Date(b.shopifyCreatedAt || 0) - new Date(a.shopifyCreatedAt || 0))),
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
  delete copy.raw;
  return copy;
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
    const orders = await SyncedOrder.find({ companyId, omsStatus: { $in: ["pending", "awaiting_shipment"] }, cancelledAt: null })
      .sort({ shopifyCreatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return deduplicateRecords(orders);
  }
  return deduplicateRecords(
    [...memory.orders.values()]
      .filter((o) => String(o.companyId) === String(companyId) && ["pending", "awaiting_shipment"].includes(o.omsStatus) && !o.cancelledAt)
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

function formatMoney(value, currency = "INR") {
  const rounded = Math.round(value || 0);
  if (currency === "INR") {
    if (rounded >= 100000) return `₹${(rounded / 100000).toFixed(1)}L`;
    if (rounded >= 1000) return `₹${Math.round(rounded / 1000)}k`;
    return `₹${rounded}`;
  }
  return `${currency} ${rounded.toLocaleString("en-IN")}`;
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
