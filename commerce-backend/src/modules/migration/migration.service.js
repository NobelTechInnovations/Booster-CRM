import { isMongoConnected } from "../../config/database.js";
import { SyncedOrder } from "../../models/synced-order.model.js";
import { SyncedCustomer } from "../../models/synced-customer.model.js";
import { getChannelById } from "../../repositories/channel.repo.js";
import { createShopifyCustomerDirect, setShopifyCustomerMarketing } from "../channels/shopify.service.js";
import { HttpError } from "../../utils/http-error.js";

// Strips Mongo/Mongoose identity fields from a .lean() document and swaps
// in the target channel's identity, so the result can be inserted as a
// brand-new document that is unmistakably a copy, not a mutation of the
// original. `externalId: migrated-<sourceId>` is what actually guarantees
// no collision — it's derived from the source document's own _id, which is
// already unique, so it can never clash with a real Shopify id or with any
// other migrated copy.
function stripIdentity(doc, { targetChannelId, targetShop }) {
  const copy = { ...doc };
  delete copy._id;
  delete copy.__v;
  delete copy.createdAt;
  delete copy.updatedAt;
  copy.channelId = targetChannelId;
  copy.shop = targetShop;
  copy.provider = "shopify";
  copy.externalId = `migrated-${doc._id}`;
  copy.migratedAt = new Date();
  return copy;
}

async function loadAndValidateChannels({ companyId, sourceChannelId, targetChannelId }) {
  if (String(sourceChannelId) === String(targetChannelId)) {
    throw new HttpError(400, "Source and target must be different channels");
  }
  const [source, target] = await Promise.all([
    getChannelById({ channelId: sourceChannelId, companyId }),
    getChannelById({ channelId: targetChannelId, companyId }),
  ]);
  if (!source || !target) {
    throw new HttpError(404, "Channel not found");
  }
  if (source.provider !== "shopify" || target.provider !== "shopify") {
    throw new HttpError(400, "Store migration only supports Shopify channels");
  }
  return { source, target };
}

// Copies not-yet-migrated orders and/or customers from the source Shopify
// channel onto the target Shopify channel, entirely inside our own
// database — no Shopify API call is made here at all, this never touches
// either real store. Safe to re-run any number of times: a source document
// that already has migratedTo*Id set is skipped, so a second run only
// picks up whatever landed on the source channel since the first run.
// includeCustomers/includeOrders (both default true) let the caller copy
// just one kind at a time — the one button on the Store Migration tab has
// a checkbox for each.
export async function copyStoreData({ companyId, sourceChannelId, targetChannelId, includeCustomers = true, includeOrders = true }) {
  if (!isMongoConnected()) {
    throw new HttpError(503, "Database is not connected");
  }

  const { source, target } = await loadAndValidateChannels({ companyId, sourceChannelId, targetChannelId });

  let customersCopied = 0;
  let customersSkipped = 0;
  if (includeCustomers) {
    const [pendingCustomers, alreadyMigratedCustomers] = await Promise.all([
      SyncedCustomer.find({ companyId, channelId: source._id, migratedToCustomerId: null }).lean(),
      SyncedCustomer.countDocuments({ companyId, channelId: source._id, migratedToCustomerId: { $ne: null } }),
    ]);
    customersSkipped = alreadyMigratedCustomers;

    for (const customer of pendingCustomers) {
      const copyDoc = stripIdentity(customer, { targetChannelId: target._id, targetShop: target.shop });
      copyDoc.migratedFromCustomerId = customer._id;

      const created = await SyncedCustomer.findOneAndUpdate(
        { companyId, channelId: target._id, externalId: copyDoc.externalId },
        { $setOnInsert: copyDoc },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      await SyncedCustomer.updateOne(
        { _id: customer._id },
        { $set: { migratedToCustomerId: created._id, migratedAt: new Date() } },
      );
      customersCopied += 1;
    }
  }

  let ordersCopied = 0;
  let ordersSkipped = 0;
  if (includeOrders) {
    const [pendingOrders, alreadyMigratedOrders] = await Promise.all([
      // Drafts never belong in a store migration — they aren't committed,
      // real orders yet (see synced-order.model.js's isDraft).
      SyncedOrder.find({ companyId, channelId: source._id, migratedToOrderId: null, isDraft: { $ne: true } }).lean(),
      SyncedOrder.countDocuments({ companyId, channelId: source._id, migratedToOrderId: { $ne: null } }),
    ]);
    ordersSkipped = alreadyMigratedOrders;

    for (const order of pendingOrders) {
      const copyDoc = stripIdentity(order, { targetChannelId: target._id, targetShop: target.shop });
      copyDoc.migratedFromOrderId = order._id;

      const created = await SyncedOrder.findOneAndUpdate(
        { companyId, channelId: target._id, externalId: copyDoc.externalId },
        { $setOnInsert: copyDoc },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      await SyncedOrder.updateOne(
        { _id: order._id },
        { $set: { migratedToOrderId: created._id, migratedAt: new Date() } },
      );
      ordersCopied += 1;
    }
  }

  return {
    source: { channelId: source._id, shop: source.shop, name: source.name },
    target: { channelId: target._id, shop: target.shop, name: target.name },
    customersCopied,
    customersSkipped,
    ordersCopied,
    ordersSkipped,
  };
}

// The one step that DOES write to a real, live Shopify store — deliberately
// separate from copyStoreData, its own explicit action, customers only
// (never orders — see the plan/commit message for why: this keeps the
// target store's own order-numbering sequence untouched by migrated data).
// For each migrated customer copy not yet pushed: first check whether a
// real customer already independently exists on the target store (matched
// by phone/email among that channel's OWN synced customers, i.e. one that
// was never itself a migration copy) so this never creates a Shopify-side
// duplicate for someone who's already ordered on the new store; only calls
// out to Shopify when nothing matches. One customer's failure is recorded
// and the batch continues — never aborts the rest over one bad record.
export async function pushMigratedCustomersToShopify({ companyId, targetChannelId }) {
  if (!isMongoConnected()) {
    throw new HttpError(503, "Database is not connected");
  }

  const target = await getChannelById({ channelId: targetChannelId, companyId });
  if (!target) throw new HttpError(404, "Channel not found");
  if (target.provider !== "shopify") throw new HttpError(400, "Only Shopify channels can be pushed to");

  const candidates = await SyncedCustomer.find({
    companyId,
    channelId: target._id,
    migratedFromCustomerId: { $ne: null },
    pushedToShopifyAt: null,
  }).lean();

  let pushed = 0;
  let alreadyExisted = 0;
  const failed = [];

  for (const customer of candidates) {
    try {
      const existing = customer.email || customer.phone
        ? await SyncedCustomer.findOne({
            companyId,
            channelId: target._id,
            migratedFromCustomerId: null, // a genuinely-synced customer, not another migration copy
            $or: [
              ...(customer.email ? [{ email: customer.email }] : []),
              ...(customer.phone ? [{ phone: customer.phone }] : []),
            ],
          }).lean()
        : null;

      // Either branch below ends with a real, non-migrated SyncedCustomer
      // doc holding the true Shopify externalId — the migrated copy's own
      // synthetic externalId can never be renamed onto that value without
      // colliding with the {companyId, channelId, externalId} unique index
      // (the real doc already occupies it), so the copy is retired instead
      // of mutated. Any CRM work already logged on the copy (follow-ups,
      // note, tags) is carried over first so it isn't lost.
      let realDocId;
      if (existing) {
        realDocId = existing._id;
        alreadyExisted += 1;
      } else {
        const [firstName, ...rest] = String(customer.name || customer.firstName || "Customer").trim().split(/\s+/);
        const { customer: created } = await createShopifyCustomerDirect({
          companyId,
          shop: target.shop,
          firstName: customer.firstName || firstName,
          lastName: customer.lastName || rest.join(" "),
          email: customer.email || undefined,
          phone: customer.phone || undefined,
          address: customer.defaultAddress,
        });
        realDocId = created._id;
        pushed += 1;
      }

      const crmUpdate = {};
      if (customer.followUps?.length) crmUpdate.$push = { followUps: { $each: customer.followUps } };
      if (customer.followUpStatus && customer.followUpStatus !== "new") crmUpdate.$set = { ...crmUpdate.$set, followUpStatus: customer.followUpStatus, nextFollowUpAt: customer.nextFollowUpAt };
      if (customer.note) crmUpdate.$set = { ...crmUpdate.$set, note: customer.note };
      if (Object.keys(crmUpdate).length) await SyncedCustomer.updateOne({ _id: realDocId }, crmUpdate);

      // Repoint the original source customer's migratedToCustomerId at the
      // real doc that now exists in the copy's place, so the chain stays
      // resolvable end-to-end instead of pointing at a deleted document.
      if (customer.migratedFromCustomerId) {
        await SyncedCustomer.updateOne({ _id: customer.migratedFromCustomerId }, { $set: { migratedToCustomerId: realDocId } });
      }
      await SyncedCustomer.deleteOne({ _id: customer._id });
    } catch (err) {
      failed.push({ customerId: String(customer._id), name: customer.name || customer.email || customer.phone || "Unknown", reason: err.message });
    }
  }

  return { pushed, alreadyExisted, failed, total: candidates.length };
}

// A customer created via createShopifyCustomerDirect (pushMigratedCustomersToShopify
// above) or one that already existed on the target store lands with
// marketing consent OFF by default — Shopify's Customer API has no
// "carry over consent from another store" concept, so this is a real,
// separate step, not part of the push itself: turns email (and, best-
// effort, SMS/WhatsApp-style — see setShopifyCustomerMarketing's own
// comment on that field's real-world meaning) marketing consent ON for
// every real, pushed customer on the target channel. One customer's
// failure is recorded and the batch continues, same pattern as the push
// step above.
export async function enableMarketingForPushedCustomers({ companyId, targetChannelId }) {
  if (!isMongoConnected()) {
    throw new HttpError(503, "Database is not connected");
  }

  const target = await getChannelById({ channelId: targetChannelId, companyId });
  if (!target) throw new HttpError(404, "Channel not found");
  if (target.provider !== "shopify") throw new HttpError(400, "Only Shopify channels are supported");

  // Every customer physically on the target channel is one of three
  // things: (a) a genuinely-synced real customer never touched by
  // migration (migratedFromCustomerId unset), (b) a migrated copy already
  // pushed for real (pushedToShopifyAt set — covers both a freshly
  // created Shopify customer AND one that turned out to already exist
  // there, matched by phone/email — see pushMigratedCustomersToShopify's
  // "already existed" branch, which deletes the copy and leaves the real,
  // pre-existing doc in its place with no pushedToShopifyAt of its own),
  // or (c) a migrated copy NOT yet pushed (synthetic externalId, nothing
  // real on Shopify to update yet). Only (c) is excluded here.
  const candidates = await SyncedCustomer.find({
    companyId,
    channelId: target._id,
    $or: [
      { migratedFromCustomerId: null },
      { pushedToShopifyAt: { $ne: null } },
    ],
  }).lean();

  let updated = 0;
  const failed = [];

  for (const customer of candidates) {
    try {
      await setShopifyCustomerMarketing({
        companyId,
        channelId: target._id,
        externalId: customer.externalId,
        acceptsMarketing: true,
        hasPhone: Boolean(customer.phone),
        hasEmail: Boolean(customer.email),
      });
      updated += 1;
    } catch (err) {
      failed.push({ customerId: String(customer._id), name: customer.name || customer.email || customer.phone || "Unknown", reason: err.message });
    }
  }

  return { updated, failed, total: candidates.length };
}
