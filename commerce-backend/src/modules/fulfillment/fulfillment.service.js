import { getOrderById, listPendingOrders, listFulfilledOrders, updateOrderOmsStatus, createLocalOrder, updateDraftOrder, deleteDraftOrder, finalizeOrder } from "../../repositories/order.repo.js";
import { getWarehouseByExternalId, listWarehouses } from "../../repositories/warehouse.repo.js";
import { getShippingProvider } from "../shipping/shipping-registry.js";
import { getShopifyChannelByShop } from "../../repositories/channel.repo.js";
import { updateShipmentsByAwb, updateShipmentById, getShipmentByAwb, listShipmentsByIds, markLabelsDownloaded } from "../../repositories/shipment.repo.js";
import { PDFDocument } from "pdf-lib";
import { deductAssetsForOrder } from "../../repositories/asset.repo.js";
import { chargeWalletForFulfillment } from "../../repositories/wallet.repo.js";
import { HttpError } from "../../utils/http-error.js";
import { env } from "../../config/env.js";

/**
 * List orders ready for fulfillment in OMS
 */
export async function getFulfillmentOrders(companyId, { page = 1, limit = 100 } = {}) {
  const [orders, warehouses] = await Promise.all([
    listPendingOrders(companyId, { page, limit }),
    listWarehouses({ companyId }),
  ]);

  return { orders, warehouses };
}

/**
 * List orders that are already fulfilled (via Shopify or our shipping flow)
 */
export async function getFulfilledOrders(companyId, { page = 1, limit = 200 } = {}) {
  const orders = await listFulfilledOrders(companyId, { page, limit });

  // labelDownloaded lives on the Shipment record (it's shipment-specific,
  // not order-specific — a re-shipped order gets a fresh label to print),
  // not on the order itself — attach it here so the bulk-print UI can show
  // which orders still need printing without a second round trip per row.
  const shipmentIds = orders.map((o) => o.shipmentId).filter(Boolean);
  const shipments = await listShipmentsByIds({ companyId, shipmentIds });
  const byId = new Map(shipments.map((s) => [String(s._id), s]));

  const enriched = orders.map((o) => {
    const shipment = o.shipmentId ? byId.get(String(o.shipmentId)) : null;
    return { ...o, labelDownloaded: shipment?.labelDownloaded || false };
  });

  return { orders: enriched };
}

/**
 * Creates an order directly in the panel — no Shopify/Amazon involved (phone
 * orders, walk-ins, anything placed outside a connected sales channel). It
 * lands in the same "ready to ship" queue as every synced order, so from
 * here on it's shipped exactly the way any other order is — via shipOrder()
 * below, same Ship Order flow, same providers, same everything.
 */
export async function createManualOrder({ companyId, customer, shippingAddress, lineItems, isCOD, note, isDraft }) {
  const result = await createLocalOrder({ companyId, customer, shippingAddress, lineItems, isCOD, note, isDraft });
  if (result.error) throw new HttpError(400, result.error);
  return result.order;
}

// Edit a draft's own contents (items/address/payment mode/note) — see
// updateDraftOrder's own comment in order.repo.js for why this is separate
// from the manual-adjustments discount/extra-charge editor.
export async function editDraftOrder({ companyId, orderId, customer, shippingAddress, lineItems, isCOD, note }) {
  const result = await updateDraftOrder({ companyId, orderId, customer, shippingAddress, lineItems, isCOD, note });
  if (!result) throw new HttpError(404, "Order not found");
  if (result.error) throw new HttpError(400, result.error);
  return result;
}

// Discard a draft that never went anywhere — permanent, but only ever
// touches orders still flagged isDraft (see deleteDraftOrder's own guard).
export async function discardDraftOrder({ companyId, orderId }) {
  const result = await deleteDraftOrder({ companyId, orderId });
  if (result.error) throw new HttpError(400, result.error);
  return result;
}

/**
 * Marks an order shipped WITHOUT creating a real shipment through one of
 * our integrated shipping providers — for when the seller booked the
 * courier directly (their own Delhivery/Shiprocket dashboard, a local
 * courier with no API here, WhatsApp order handed to a rider, etc) and just
 * needs Booster to reflect what already happened: the tracking number the
 * courier gave them, and who's carrying it. Runs the exact same downstream
 * side effects a real shipOrder() does (Shopify fulfillment push, packaging
 * deduction, per-order wallet fee) since those depend on the order having
 * shipped, not on how it shipped.
 */
export async function markOrderShippedManually({ companyId, orderId, trackingNumber, trackingCompany, trackingUrl }) {
  const order = await getOrderById({ companyId, orderId });
  if (!order) throw new HttpError(404, "Order not found");
  if (!trackingNumber?.trim()) throw new HttpError(400, "Tracking number is required");
  if (["shipped", "delivered", "cancelled", "returned"].includes(order.omsStatus)) {
    throw new HttpError(400, "This order has already moved past pending fulfillment");
  }

  let updatedOrder = await updateOrderOmsStatus({
    companyId,
    shopifyOrderId: order.externalId,
    update: {
      omsStatus: "shipped",
      shippingProvider: "manual",
      trackingNumber: trackingNumber.trim(),
      trackingCompany: (trackingCompany || "").trim(),
      trackingUrl: (trackingUrl || "").trim(),
      markedFulfilledAt: new Date(),
    },
  });

  // Same fulfillment-push contract as shipOrder() — only mark fulfilled
  // locally once Shopify actually confirms it, so a failed push can't leave
  // our own record claiming something Shopify doesn't agree with.
  let shopifyPushError = null;
  if (order.provider === "shopify" && order.shop) {
    try {
      await markShopifyOrderFulfilled({
        shop: order.shop,
        shopifyOrderId: order.externalId,
        awbCode: trackingNumber.trim(),
        trackingUrl: trackingUrl || undefined,
        courierName: trackingCompany || "Courier",
      });
      updatedOrder = await updateOrderOmsStatus({ companyId, shopifyOrderId: order.externalId, update: { fulfillmentStatus: "fulfilled" } });
    } catch (err) {
      shopifyPushError = err.message;
      console.warn(`[Fulfillment] Shopify auto-fulfillment update failed for ${order.name}:`, err.message);
    }
  } else {
    updatedOrder = await updateOrderOmsStatus({ companyId, shopifyOrderId: order.externalId, update: { fulfillmentStatus: "fulfilled" } });
  }

  try {
    await deductAssetsForOrder({ companyId, order: updatedOrder });
  } catch (err) {
    console.warn(`[Fulfillment] Asset deduction failed for ${order.name}:`, err.message);
  }

  try {
    await chargeWalletForFulfillment({ companyId, order: updatedOrder });
  } catch (err) {
    console.warn(`[Fulfillment] Wallet charge failed for ${order.name}:`, err.message);
  }

  return { order: finalizeOrder(updatedOrder), shopifyPushError };
}

// Manual delivery-status marking — "delivered" (or reverting back to
// "shipped" if marked by mistake). Purely a panel-side record: no courier
// integration reports "delivered" back to us for every provider (and none
// at all for a manually-tracked third-party shipment), and Shopify itself
// has no "delivered" fulfillment event to push this to.
export async function updateOrderDeliveryStatus({ companyId, orderId, delivered }) {
  const order = await getOrderById({ companyId, orderId });
  if (!order) throw new HttpError(404, "Order not found");
  if (!["shipped", "delivered"].includes(order.omsStatus)) {
    throw new HttpError(400, "Order must be shipped before it can be marked delivered");
  }

  const update = delivered
    ? { omsStatus: "delivered", deliveredAt: new Date() }
    : { omsStatus: "shipped", deliveredAt: null };
  const updatedOrder = await updateOrderOmsStatus({ companyId, shopifyOrderId: order.externalId, update });
  return finalizeOrder(updatedOrder);
}

/**
 * Ship a synced order through a chosen shipping provider and pickup warehouse.
 * Zero manual data entry — all customer, address, and line item data is automatically mapped.
 */
export async function shipOrder({ companyId, orderId, providerName, warehouseId, courierId, options = {} }) {
  const order = await getOrderById({ companyId, orderId });

  if (!order) {
    throw new HttpError(404, "Order not found");
  }

  if (order.omsStatus === "shipped") {
    throw new HttpError(400, "Order has already been shipped");
  }

  if (!order.shippingAddress || !order.shippingAddress.zip) {
    throw new HttpError(400, "Order missing valid shipping address PIN code");
  }

  // 1. Get Shipping Provider Instance
  const shippingProvider = getShippingProvider(providerName, { companyId });

  // 2. Get Pickup Warehouse
  let warehouse;
  if (warehouseId) {
    warehouse = await getWarehouseByExternalId({ companyId, provider: providerName, externalWarehouseId: warehouseId });
  }

  if (!warehouse) {
    const warehouses = await listWarehouses({ companyId, provider: providerName });
    warehouse = warehouses[0];
  }

  if (!warehouse) {
    throw new HttpError(400, `No active pickup warehouse found for ${providerName}. Connect ${providerName} or create a warehouse first.`);
  }

  // 3. Build Provider-Specific Payload Automatically
  const payload = shippingProvider.buildShipmentPayload(order, warehouse, {
    courierId,
    ...options,
  });

  // 4. Create Shipment on Shipping Provider API
  const shipment = await shippingProvider.createForwardOrder(payload, {
    syncedOrderId: order._id || order.id,
    shopifyOrderId: order.externalId,
    shopifyOrderName: order.name,
  });

  // 5. Update Synced Order in Local OMS Database — the courier shipment
  // genuinely exists now (real AWB), so omsStatus:"shipped" is true
  // regardless of what happens next. fulfillmentStatus is deliberately NOT
  // set here — that field mirrors Shopify's own state, and step 6 below is
  // the only place that's actually confirmed true or false.
  const updatedOrder = await updateOrderOmsStatus({
    companyId,
    shopifyOrderId: order.externalId,
    update: {
      omsStatus: "shipped",
      shippingProvider: providerName,
      shipmentId: shipment._id || shipment.id,
      awbCode: shipment.awbCode,
      labelUrl: shipment.labelUrl,
      // The courier rate the user picked in the Ship Order modal — varies by
      // destination/weight per order, so this is the real per-order freight cost.
      shippingCost: Number(options.rate) || 0,
      shippingCostSource: "auto",
    },
  });

  // 6. Push fulfillment status back to Shopify. Only mark fulfillmentStatus
  // "fulfilled" locally once Shopify actually confirms it — this used to be
  // set optimistically in step 5 regardless of whether this push succeeded,
  // which meant a failed push left our DB claiming "fulfilled" while Shopify
  // genuinely didn't. The next routine sync would then correctly revert
  // fulfillmentStatus back to "unfulfilled" from Shopify's real state, but
  // omsStatus stayed "shipped" forever (it's deliberately preserved across
  // syncs) — the order got stuck showing "Fulfilled" on the Fulfillment page
  // with no way to tell why, and no record of the push ever having failed.
  let shopifyPushError = null;
  if (order.provider === "shopify" && order.shop) {
    try {
      const fulfillResult = await markShopifyOrderFulfilled({
        shop: order.shop,
        shopifyOrderId: order.externalId,
        awbCode: shipment.awbCode,
        trackingUrl: shipment.trackingUrl || shipment.labelUrl,
        courierName: shipment.courierName || providerName,
      });
      await updateOrderOmsStatus({ companyId, shopifyOrderId: order.externalId, update: { fulfillmentStatus: "fulfilled" } });
      updatedOrder.fulfillmentStatus = "fulfilled";
      // Save the Shopify fulfillment's own ID so cancelShipment() can later
      // undo it there too, not just with the courier.
      const shopifyFulfillmentId = fulfillResult?.fulfillment?.id;
      if (shopifyFulfillmentId) {
        await updateShipmentById({ shipmentId: shipment._id || shipment.id, companyId, update: { shopifyFulfillmentId: String(shopifyFulfillmentId) } });
      }
    } catch (err) {
      shopifyPushError = err.message;
      console.warn(`[Fulfillment] Shopify auto-fulfillment update failed for ${order.name}:`, err.message);
    }
  } else {
    // Non-Shopify orders (local/manual, Amazon import) have no external
    // fulfillment system to confirm against — our own record is authoritative.
    await updateOrderOmsStatus({ companyId, shopifyOrderId: order.externalId, update: { fulfillmentStatus: "fulfilled" } });
    updatedOrder.fulfillmentStatus = "fulfilled";
  }

  // Packaging assets (jars/stickers/etc) get deducted right here — the real
  // "this order physically left the building" moment. Best-effort and never
  // allowed to fail the actual shipment: a missing SKU->asset mapping just
  // means that line item's consumption isn't tracked yet.
  try {
    await deductAssetsForOrder({ companyId, order: updatedOrder });
  } catch (err) {
    console.warn(`[Fulfillment] Asset deduction failed for ${order.name}:`, err.message);
  }

  // Per-order plan fee (e.g. ₹2 on Premium) — same best-effort contract as
  // asset deduction right above: never allowed to fail the real shipment.
  try {
    await chargeWalletForFulfillment({ companyId, order: updatedOrder });
  } catch (err) {
    console.warn(`[Fulfillment] Wallet charge failed for ${order.name}:`, err.message);
  }

  return { shipment, order: updatedOrder, shopifyPushError };
}

/**
 * Ships many orders in one go through the same provider + warehouse —
 * courier is left to that provider's automatic assignment per order (same
 * as leaving carrier_id blank in the single-order flow), since asking the
 * user to confirm a rate for each of N orders one at a time defeats the
 * point of "bulk". Each order is shipped independently so one failure
 * (missing PIN, provider rejects it, etc.) doesn't block the rest — the
 * caller gets a per-order breakdown to show exactly what happened.
 */
export async function shipOrdersBulk({ companyId, orderIds, providerName, warehouseId }) {
  if (!orderIds?.length) throw new HttpError(400, "No orders selected");

  const succeeded = [];
  const failed = [];

  for (const orderId of orderIds) {
    try {
      const result = await shipOrder({ companyId, orderId, providerName, warehouseId, options: {} });
      succeeded.push({ orderId, orderName: result.order.name, awbCode: result.shipment.awbCode, shopifyPushError: result.shopifyPushError });
    } catch (err) {
      failed.push({ orderId, error: err.message });
    }
  }

  return {
    message: `Shipped ${succeeded.length} of ${orderIds.length} order${orderIds.length === 1 ? "" : "s"}${failed.length ? `, ${failed.length} failed` : ""}`,
    succeeded,
    failed,
  };
}

/**
 * Merges every selected shipment's label PDF into a single downloadable
 * file — a real "print all at once", not just opening N tabs — and marks
 * each as downloaded so the fulfillment list can show which ones still
 * need printing. A label whose URL fails to fetch (an expired signed S3
 * link, a provider outage) is skipped rather than failing the whole
 * batch, and reported back so the user knows which ones need a re-fetch.
 */
export async function downloadLabelsBulk({ companyId, shipmentIds }) {
  if (!shipmentIds?.length) throw new HttpError(400, "No shipments selected");

  const shipments = await listShipmentsByIds({ companyId, shipmentIds });
  if (!shipments.length) throw new HttpError(404, "None of the selected shipments were found");

  const merged = await PDFDocument.create();
  const included = [];
  const skipped = [];

  for (const shipment of shipments) {
    if (!shipment.labelUrl) {
      skipped.push({ shipmentId: shipment._id, awbCode: shipment.awbCode, reason: "No label URL on this shipment" });
      continue;
    }
    try {
      const res = await fetch(shipment.labelUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const labelPdf = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(labelPdf, labelPdf.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
      included.push(shipment._id);
    } catch (err) {
      skipped.push({ shipmentId: shipment._id, awbCode: shipment.awbCode, reason: err.message });
    }
  }

  if (!included.length) throw new HttpError(502, "Couldn't fetch any of the selected labels — they may have expired. Try syncing/re-fetching the shipment first.");

  const pdfBytes = await merged.save();
  await markLabelsDownloaded({ companyId, shipmentIds: included });

  return { pdfBytes, includedCount: included.length, skipped };
}

/**
 * Un-assigns a shipment from an order in OUR OWN records only. This does
 * NOT cancel anything with the courier (the shipment may genuinely still be
 * active there — this button is for when it was actually handled through a
 * different partner, or a courier mix-up, not "the order got cancelled")
 * and does NOT touch Shopify or the order itself. It just clears our record
 * of which courier/AWB is assigned so the order reappears in "To Ship" and
 * a (possibly different) shipment can be created for it. Distinct from
 * cancelOrderFulfillment() above, which genuinely cancels the whole Shopify
 * order — this never does that, on either side.
 */
export async function cancelShipment({ companyId, orderId }) {
  const order = await getOrderById({ companyId, orderId });
  if (!order) throw new HttpError(404, "Order not found");

  if (!order.awbCode && order.omsStatus !== "shipped") {
    throw new HttpError(400, "This order has no shipment assigned to unassign");
  }

  if (order.awbCode) {
    await updateShipmentsByAwb({ companyId, awbCodes: [order.awbCode], update: { status: "unassigned" } });
  }

  const updatedOrder = await updateOrderOmsStatus({
    companyId,
    shopifyOrderId: order.externalId,
    update: {
      omsStatus:          "pending",
      shippingProvider:   null,
      shipmentId:         null,
      awbCode:            null,
      labelUrl:           null,
      shippingCost:       0,
      shippingCostSource: null,
    },
  });

  return {
    message: "Shipment unassigned — order moved back to \"To Ship\" and can be assigned again. Nothing was cancelled with the courier or Shopify.",
    order: updatedOrder,
  };
}

// A courier reporting any of these tracking states means the shipment is
// dead on their side — cancelled directly on their own dashboard, an RTO
// written off, etc — and the order needs to come back to "To Ship". Matched
// as a substring since each courier phrases this slightly differently.
const DEAD_SHIPMENT_STATUS = /cancel/i;

/**
 * Pulls live tracking status for one order's shipment right now, instead of
 * waiting for the periodic background job (up to 15 minutes) — for when the
 * user cancelled or changed the courier directly on the provider's own
 * dashboard and wants the panel to catch up immediately. Reverts the order
 * to unfulfilled if the courier now reports it cancelled.
 */
export async function syncShipmentStatus({ companyId, orderId }) {
  const order = await getOrderById({ companyId, orderId });
  if (!order) throw new HttpError(404, "Order not found");
  if (!order.awbCode) throw new HttpError(400, "This order has no active shipment to check");

  const providerName = order.shippingProvider;
  if (!providerName) throw new HttpError(400, "No shipping provider recorded for this order's shipment");

  const shippingProvider = getShippingProvider(providerName, { companyId });
  await shippingProvider.trackOrders([order.awbCode]);

  const shipment = await getShipmentByAwb({ companyId, awbCode: order.awbCode });
  if (shipment?.trackingStatus && DEAD_SHIPMENT_STATUS.test(shipment.trackingStatus) && shipment.status !== "cancelled") {
    const updatedOrder = await syncShipmentCancelledElsewhere({ companyId, shipment });
    return { message: `${providerName} confirms this shipment is cancelled — order moved back to unfulfilled`, cancelled: true, order: updatedOrder || order };
  }

  return { message: `Tracking status: ${shipment?.trackingStatus || "no update from " + providerName}`, cancelled: false, order };
}

/**
 * Shared by cancelShipment() above and the tracking-update job below —
 * clears our own shipment fields and drops the order back into the
 * "To Ship" queue.
 */
async function revertOrderToUnfulfilled({ companyId, order }) {
  return updateOrderOmsStatus({
    companyId,
    shopifyOrderId: order.externalId,
    update: {
      omsStatus:          "pending",
      fulfillmentStatus:  "unfulfilled",
      shippingProvider:   null,
      shipmentId:         null,
      awbCode:            null,
      labelUrl:           null,
      shippingCost:       0,
      shippingCostSource: null,
    },
  });
}

/**
 * Catches shipments cancelled directly on the courier's own dashboard
 * (bypassing cancelShipment() above entirely) — called by the periodic
 * tracking-update job whenever it sees a courier report a shipment as
 * cancelled that we still show as active. Unlike cancelShipment(), this
 * does NOT call the courier's cancel API (it's already cancelled there —
 * that's the whole trigger), it just syncs our own records and, best-
 * effort, undoes the Shopify fulfillment so all three systems agree.
 */
export async function syncShipmentCancelledElsewhere({ companyId, shipment }) {
  const orderRefId = shipment.syncedOrderId || shipment.shopifyOrderId;
  const order = await getOrderById({ companyId, orderId: orderRefId });
  if (!order) return null;

  // Guard against a race where the order was already re-shipped (new AWB)
  // between the courier status check and this running — only revert if the
  // order is still pointing at the shipment we're processing.
  if (order.awbCode && order.awbCode !== shipment.awbCode) return null;

  await updateShipmentById({ shipmentId: shipment._id, companyId, update: { status: "cancelled" } });

  if (shipment.shopifyFulfillmentId && order.provider === "shopify" && order.shop) {
    try {
      await cancelShopifyFulfillment({ shop: order.shop, shopifyOrderId: order.externalId, fulfillmentId: shipment.shopifyFulfillmentId });
    } catch (err) {
      // Often expected here — Velocity's own separate Shopify sync may have
      // already reverted Shopify's fulfillment itself before we even saw
      // the cancelled tracking status, so this call fails because there's
      // nothing left to cancel. Not worth surfacing as a real error.
      console.warn(`[Fulfillment] Shopify fulfillment cancel (from tracking sync) failed for ${order.name}:`, err.message);
    }
  }

  const updatedOrder = await revertOrderToUnfulfilled({ companyId, order });
  console.log(`[Fulfillment] ${order.name} shipment cancelled on ${shipment.provider}'s side — synced back to unfulfilled`);
  return updatedOrder;
}

/**
 * Cancels a Shopify fulfillment (the mirror of markShopifyOrderFulfilled's
 * create call) so an order we un-ship on the courier side also reverts to
 * unfulfilled in Shopify itself, instead of just in our own DB.
 */
async function cancelShopifyFulfillment({ shop, shopifyOrderId, fulfillmentId }) {
  const channel = await getShopifyChannelByShop(shop);
  if (!channel?.credentials?.accessToken) throw new Error(`No connected Shopify channel with a valid access token for ${shop}`);

  const res = await fetch(`https://${shop}/admin/api/${env.shopify.apiVersion}/fulfillments/${fulfillmentId}/cancel.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": channel.credentials.accessToken },
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Shopify rejected the fulfillment cancel call (${res.status}) for order ${shopifyOrderId}: ${errBody.slice(0, 300)}`);
  }
}

/**
 * Marks a Shopify order as fulfilled via Shopify Admin REST API / Fulfillment Orders API.
 */
export async function markShopifyOrderFulfilled({ shop, shopifyOrderId, awbCode, trackingUrl, courierName }) {
  const channel = await getShopifyChannelByShop(shop);
  if (!channel || !channel.credentials?.accessToken) {
    throw new Error(`No connected Shopify channel with a valid access token for ${shop}`);
  }

  // The Fulfillment Orders API (both calls below) needs these two scopes
  // specifically — write_orders is NOT enough, Shopify returns a bare 403
  // "api_client does not have the required permission(s)" with no
  // indication of which scope is missing. Checking up front turns that
  // into an actionable message instead. A channel connected before this
  // scope existed won't have it even if SHOPIFY_SCOPES now requests it —
  // OAuth grants don't gain new scopes on their own, so it has to be
  // disconnected and reconnected once for Shopify to re-prompt for it.
  if (!channel.scopes?.includes("write_merchant_managed_fulfillment_orders")) {
    throw new Error(`Shopify token is missing write_merchant_managed_fulfillment_orders — disconnect and reconnect the ${shop} Shopify channel to grant this permission, then try again.`);
  }

  const accessToken = channel.credentials.accessToken;

  // 1. Fetch fulfillment orders for this order
  const response = await fetch(`https://${shop}/admin/api/${env.shopify.apiVersion}/orders/${shopifyOrderId}/fulfillment_orders.json`, {
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
  });

  // This used to silently `return` on any failure here (bad response, no
  // open fulfillment order, or — worst — a failed create-fulfillment call
  // whose response was never even checked). That meant we'd mark the order
  // "fulfilled" in our own DB while Shopify still showed it unfulfilled, and
  // the next routine Shopify sync would then flip our fulfillmentStatus back
  // to "unfulfilled" (correctly, since that's the real state) while our own
  // omsStatus stayed "shipped" forever (it's deliberately preserved across
  // syncs) — the order got stuck looking "Fulfilled" on the Fulfillment page
  // with no way to tell why. Every failure path here now throws instead, so
  // the caller's try/catch actually has something real to log and the user
  // can be told what happened rather than data quietly drifting out of sync.
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`Failed to fetch fulfillment orders (${response.status}): ${errBody.slice(0, 300)}`);
  }

  const body = await response.json();
  const fulfillmentOrders = body.fulfillment_orders || [];
  const openFulfillmentOrder = fulfillmentOrders.find((fo) => fo.status === "open");

  if (!openFulfillmentOrder) {
    // Not necessarily an error — the order may already be fulfilled/closed
    // on Shopify's side (e.g. someone fulfilled it manually there first).
    // Treat as a no-op success rather than throwing.
    return { skipped: true, reason: "No open fulfillment order (already fulfilled or closed on Shopify)" };
  }

  // 2. Create fulfillment using the Fulfillment Orders API format
  const fulfillRes = await fetch(`https://${shop}/admin/api/${env.shopify.apiVersion}/fulfillments.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      fulfillment: {
        line_items_by_fulfillment_order: [
          {
            fulfillment_order_id: openFulfillmentOrder.id,
          },
        ],
        tracking_info: {
          number: awbCode,
          url: trackingUrl,
          company: courierName,
        },
        notify_customer: true,
      },
    }),
  });

  if (!fulfillRes.ok) {
    const errBody = await fulfillRes.text().catch(() => "");
    throw new Error(`Shopify rejected the fulfillment create call (${fulfillRes.status}): ${errBody.slice(0, 500)}`);
  }

  return fulfillRes.json();
}

/**
 * (Re-)pushes the tracking number and courier for an already-shipped order
 * to Shopify. Safe to call on any order that has an awbCode — never updates
 * the full order, only creates (or re-creates) the fulfillment record with
 * tracking_info. Useful when the automatic push at ship-time failed due to a
 * transient Shopify API error, or when tracking details need correcting.
 */
export async function pushTrackingToShopify({ companyId, orderId }) {
  const order = await getOrderById({ companyId, orderId });
  if (!order) throw new HttpError(404, "Order not found");
  if (!order.awbCode) throw new HttpError(400, "No AWB assigned to this order yet — ship it first");
  if (order.provider !== "shopify" || !order.shop) {
    return { message: "Non-Shopify order — tracking is only pushed to Shopify stores" };
  }

  const shipment = order.shipmentId
    ? (await listShipmentsByIds({ companyId, shipmentIds: [order.shipmentId] }))[0]
    : null;

  const trackingUrl = shipment?.trackingUrl || shipment?.labelUrl || order.labelUrl || "";
  const courierName = shipment?.courierName || order.shippingProvider || "";

  try {
    const fulfillResult = await markShopifyOrderFulfilled({
      shop: order.shop,
      shopifyOrderId: order.externalId,
      awbCode: order.awbCode,
      trackingUrl,
      courierName,
    });

    if (fulfillResult?.skipped) {
      return { message: "Order is already marked fulfilled on Shopify — tracking is already there", skipped: true };
    }

    // Record the Shopify fulfillment ID so cancel can undo it later.
    const shopifyFulfillmentId = fulfillResult?.fulfillment?.id;
    if (shopifyFulfillmentId && shipment) {
      await updateShipmentById({ shipmentId: shipment._id || shipment.id, companyId, update: { shopifyFulfillmentId: String(shopifyFulfillmentId) } });
    }

    await updateOrderOmsStatus({ companyId, shopifyOrderId: order.externalId, update: { fulfillmentStatus: "fulfilled" } });

    return {
      message: `Tracking pushed to Shopify — AWB ${order.awbCode} via ${courierName || "courier"}`,
      awbCode: order.awbCode,
      trackingUrl,
    };
  } catch (err) {
    throw new HttpError(502, `Shopify tracking push failed: ${err.message}`);
  }
}

/**
 * Cancel a pending order in OMS and push cancel to Shopify
 */
export async function cancelOrderFulfillment({ companyId, orderId, reason = "customer" }) {
  const order = await getOrderById({ companyId, orderId });

  if (!order) {
    throw new HttpError(404, "Order not found");
  }

  const updated = await updateOrderOmsStatus({
    companyId,
    shopifyOrderId: order.externalId,
    update: {
      omsStatus: "cancelled",
      cancelledAt: new Date(),
      fulfillmentStatus: "cancelled",
      financialStatus: "voided",
    },
  });

  try {
    const channel = await getShopifyChannelByShop(order.shop);
    if (channel?.credentials?.accessToken) {
      await fetch(`https://${order.shop}/admin/api/${env.shopify.apiVersion}/orders/${order.externalId}/cancel.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": channel.credentials.accessToken,
        },
        body: JSON.stringify({ reason }),
      });
    }
  } catch (err) {
    console.warn(`[Fulfillment] Shopify order cancel failed for ${order.name}:`, err.message);
  }

  return { message: `Order ${order.name || order.externalId} cancelled successfully`, order: updated };
}
