import { getOrderById, listPendingOrders, listFulfilledOrders, updateOrderOmsStatus } from "../../repositories/order.repo.js";
import { getWarehouseByExternalId, listWarehouses } from "../../repositories/warehouse.repo.js";
import { getShippingProvider } from "../shipping/shipping-registry.js";
import { getShopifyChannelByShop } from "../../repositories/channel.repo.js";
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

  // 5. Update Synced Order in Local OMS Database
  const updatedOrder = await updateOrderOmsStatus({
    companyId,
    shopifyOrderId: order.externalId,
    update: {
      omsStatus: "shipped",
      shippingProvider: providerName,
      shipmentId: shipment._id || shipment.id,
      awbCode: shipment.awbCode,
      labelUrl: shipment.labelUrl,
      fulfillmentStatus: "fulfilled",
      // The courier rate the user picked in the Ship Order modal — varies by
      // destination/weight per order, so this is the real per-order freight cost.
      shippingCost: Number(options.rate) || 0,
    },
  });

  // 6. Attempt to push fulfillment status back to Shopify asynchronously
  try {
    await markShopifyOrderFulfilled({
      shop: order.shop,
      shopifyOrderId: order.externalId,
      awbCode: shipment.awbCode,
      trackingUrl: shipment.trackingUrl || shipment.labelUrl,
      courierName: shipment.courierName || providerName,
    });
  } catch (err) {
    console.warn(`[Fulfillment] Shopify auto-fulfillment update failed for ${order.name}:`, err.message);
  }

  return { shipment, order: updatedOrder };
}

/**
 * Marks a Shopify order as fulfilled via Shopify Admin REST API / Fulfillment Orders API.
 */
export async function markShopifyOrderFulfilled({ shop, shopifyOrderId, awbCode, trackingUrl, courierName }) {
  const channel = await getShopifyChannelByShop(shop);
  if (!channel || !channel.credentials?.accessToken) return;

  const accessToken = channel.credentials.accessToken;

  // 1. Fetch fulfillment orders for this order
  const response = await fetch(`https://${shop}/admin/api/${env.shopify.apiVersion}/orders/${shopifyOrderId}/fulfillment_orders.json`, {
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
  });

  if (!response.ok) return;

  const body = await response.json();
  const fulfillmentOrders = body.fulfillment_orders || [];
  const openFulfillmentOrder = fulfillmentOrders.find((fo) => fo.status === "open");

  if (!openFulfillmentOrder) return;

  // 2. Create fulfillment using 2026-01 API format
  await fetch(`https://${shop}/admin/api/${env.shopify.apiVersion}/fulfillments.json`, {
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
