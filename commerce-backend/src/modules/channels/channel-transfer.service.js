import { SyncedCustomer } from "../../models/synced-customer.model.js";
import { SyncedProduct } from "../../models/synced-product.model.js";
import { isMongoConnected } from "../../config/database.js";
import { getChannelForSync } from "../../repositories/channel.repo.js";
import { saveSyncedOyklaneData } from "../../repositories/order.repo.js";
import { HttpError } from "../../utils/http-error.js";
import { createOyklaneCustomer, createOyklaneProduct, listOyklaneProducts } from "./oyklane.service.js";

// Copies catalogue and customers already synced from one channel (e.g. a
// Shopify store) into another (Oyklane). Read-only on the source: it works
// from Booster's synced copy, never writing back to the source store.
//
// Re-runnable: anything already on the target (same SKU or title for
// products, same email/phone for customers) is skipped, so a second click
// only sends what's new — and a batch cut short by MAX_PER_RUN continues.

const MAX_PER_RUN = 150;
const TARGET_WRITERS = { oyklane: { product: createOyklaneProduct, customer: createOyklaneCustomer, listProducts: listOyklaneProducts, save: saveSyncedOyklaneData } };

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
    tags: (product.tags || []).join(", "),
    images: urls.map((url, position) => ({ url, altText: product.title, position })),
    variants: (product.variants || []).map((variant) => {
      const source = rawVariants.get(String(variant.externalId)) || {};
      const values = [source.option1, source.option2, source.option3].filter((v) => v && v !== "Default Title");
      return {
        title: values.join(" / ") || "Default",
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

  const result = {};
  const base = { companyId, channelId: target._id, shop: target.shop };

  if (resources.includes("products")) {
    const filter = { companyId, channelId: source._id, status: { $nin: ["deleted", "archived"] } };
    if (Array.isArray(productIds) && productIds.length) filter._id = { $in: productIds };
    const [items, existing] = await Promise.all([SyncedProduct.find(filter).lean(), writer.listProducts(target)]);
    const seenTitles = new Set(existing.map((p) => norm(p.title)));
    const seenSkus = new Set(existing.flatMap((p) => (p.variants || []).map((v) => norm(v.sku))).filter(Boolean));

    const pending = items.filter((p) => !seenTitles.has(norm(p.title)) && !(p.variants || []).some((v) => v.sku && seenSkus.has(norm(v.sku))));
    result.products = { total: items.length, skipped: items.length - pending.length, created: 0, failed: [], remaining: Math.max(0, pending.length - MAX_PER_RUN) };

    for (const product of pending.slice(0, MAX_PER_RUN)) {
      try {
        const created = await writer.product(target, toOyklaneProduct(product));
        if (created?.id) await writer.save({ ...base, products: [created] });
        result.products.created += 1;
      } catch (error) {
        result.products.failed.push({ title: product.title, error: error.message });
        if (error.statusCode === 403 || /API key/.test(error.message)) break;
      }
    }
  }

  if (resources.includes("customers")) {
    const [items, existing] = await Promise.all([
      SyncedCustomer.find({ companyId, channelId: source._id }).lean(),
      SyncedCustomer.find({ companyId, channelId: target._id }).select("email phone").lean(),
    ]);
    const seen = new Set(existing.flatMap((c) => [norm(c.email), norm(c.phone)]).filter(Boolean));
    const pending = items.filter((c) => (c.email || c.phone) && !seen.has(norm(c.email)) && !seen.has(norm(c.phone)));
    result.customers = { total: items.length, skipped: items.length - pending.length, created: 0, failed: [], remaining: Math.max(0, pending.length - MAX_PER_RUN) };

    for (const customer of pending.slice(0, MAX_PER_RUN)) {
      try {
        const created = await writer.customer(target, toOyklaneCustomer(customer));
        if (created?.id) await writer.save({ ...base, customers: [created] });
        result.customers.created += 1;
      } catch (error) {
        // Oyklane's API may not expose customer creation yet — stop at once
        // rather than repeating the same failure for every customer.
        if ([404, 405].includes(error.statusCode)) {
          result.customers.failed.push({ title: "All customers", error: "Oyklane doesn't accept customer creation via API yet." });
          break;
        }
        result.customers.failed.push({ title: customer.name || customer.email, error: error.message });
        if (error.statusCode === 403 || /API key/.test(error.message)) break;
      }
    }
  }

  return result;
}
