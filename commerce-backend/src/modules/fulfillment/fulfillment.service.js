import { getOrderById, listPendingOrders, listFulfilledOrders, updateOrderOmsStatus, createLocalOrder } from "../../repositories/order.repo.js";
import { getWarehouseByExternalId, listWarehouses } from "../../repositories/warehouse.repo.js";
import { getShippingProvider } from "../shipping/shipping-registry.js";
import { getShopifyChannelByShop } from "../../repositories/channel.repo.js";
import { updateShipmentsByAwb, updateShipmentById, getShipmentByAwb } from "../../repositories/shipment.repo.js";
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
  return { orders };
}

/**
 * Creates an order directly in the panel — no Shopify/Amazon involved (phone
 * orders, walk-ins, anything placed outside a connected sales channel). It
 * lands in the same "ready to ship" queue as every synced order, so from
 * here on it's shipped exactly the way any other order is — via shipOrder()
 * below, same Ship Order flow, same providers, same everything.
 */
export async function createManualOrder({ companyId, customer, shippingAddress, lineItems, isCOD, note }) {
  const result = await createLocalOrder({ companyId, customer, shippingAddress, lineItems, isCOD, note });
  if (result.error) throw new HttpError(400, result.error);
  return result.order;
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

  return { shipment, order: updatedOrder, shopifyPushError };
}

/**
 * Cancels an order's active courier shipment (and, if we pushed one, the
 * Shopify fulfillment it created) and moves the order back to unfulfilled
 * so it reappears in the "To Ship" queue and can be shipped again — via the
 * same provider or a different one. Distinct from cancelOrderFulfillment()
 * above, which cancels the whole Shopify ORDER; this only undoes the
 * shipment/courier assignment and leaves the order itself alive.
 */
export async function cancelShipment({ companyId, orderId }) {
  const order = await getOrderById({ companyId, orderId });
  if (!order) throw new HttpError(404, "Order not found");

  if (!order.awbCode && order.omsStatus !== "shipped") {
    throw new HttpError(400, "This order has no active shipment to cancel");
  }

  const providerName = order.shippingProvider;
  if (!providerName) throw new HttpError(400, "No shipping provider recorded for this order's shipment");

  const shippingProvider = getShippingProvider(providerName, { companyId });

  // 1. Cancel with the courier — best-effort but not swallowed: if the
  // courier refuses (e.g. already picked up), surface that rather than
  // silently reverting our own records to a state that no longer matches
  // reality on their side.
  let courierResult = null;
  let shipmentRecord = null;
  if (order.awbCode) {
    try {
      courierResult = await shippingProvider.cancelOrder([order.awbCode]);
    } catch (err) {
      throw new HttpError(400, `${providerName} refused the cancellation: ${err.message}`);
    }
    await updateShipmentsByAwb({ companyId, awbCodes: [order.awbCode], update: { status: "cancelled" } });
    shipmentRecord = await getShipmentByAwb({ companyId, awbCode: order.awbCode });
  }

  // 2. If we successfully pushed a fulfillment to Shopify for this shipment,
  // undo that too so Shopify's own state matches — best-effort, since a
  // courier-side cancel is the part that actually matters operationally.
  if (shipmentRecord?.shopifyFulfillmentId && order.provider === "shopify" && order.shop) {
    try {
      await cancelShopifyFulfillment({ shop: order.shop, shopifyOrderId: order.externalId, fulfillmentId: shipmentRecord.shopifyFulfillmentId });
    } catch (err) {
      console.warn(`[Fulfillment] Shopify fulfillment cancel failed for ${order.name}:`, err.message);
    }
  }

  // 3. Revert the order locally so it's shippable again.
  const updatedOrder = await revertOrderToUnfulfilled({ companyId, order });

  return { message: "Shipment cancelled — order moved back to unfulfilled and can be shipped again", order: updatedOrder, courierResult };
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
      omsStatus:         "pending",
      fulfillmentStatus: "unfulfilled",
      shippingProvider:  null,
      shipmentId:        null,
      awbCode:           null,
      labelUrl:          null,
      shippingCost:      0,
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
