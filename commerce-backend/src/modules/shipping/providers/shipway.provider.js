import { BaseShippingProvider } from "./base.provider.js";
import { HttpError } from "../../../utils/http-error.js";
import {
  getShippingChannel,
  upsertShippingChannel,
  updateShippingChannelToken,
} from "../../../repositories/channel.repo.js";
import { upsertWarehouseRecord, listWarehouses } from "../../../repositories/warehouse.repo.js";
import { createShipmentRecord, updateShipmentsByAwb } from "../../../repositories/shipment.repo.js";

const BASE_URL = "https://shipway.in/api";

async function shipwayFetch(path, { method = "POST", apiKey, secretKey, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["X-Api-Key"] = apiKey;
  if (secretKey) headers["X-Secret-Key"] = secretKey;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseBody = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpError(response.status || 502, responseBody?.message || "Shipway request failed", responseBody);
  }

  return responseBody;
}

export class ShipwayProvider extends BaseShippingProvider {
  constructor({ companyId }) {
    super({ companyId });
    this.provider = "shipway";
  }

  async ensureToken() {
    const channel = await getShippingChannel({ companyId: this.companyId, provider: this.provider });
    if (!channel) throw new HttpError(400, "Connect Shipway first");

    return {
      channel,
      apiKey: channel.credentials?.apiKey || channel.credentials?.username,
      secretKey: channel.credentials?.apiSecret || channel.credentials?.password,
    };
  }

  async connect({ userId, username, apiKey, secretKey, password }) {
    const keyToUse = apiKey || username;
    const secretToUse = secretKey || password;

    if (!keyToUse || !secretToUse) {
      throw new HttpError(400, "Shipway API key and Secret key are required");
    }

    const channel = await upsertShippingChannel({
      companyId:   this.companyId,
      userId,
      provider:    this.provider,
      name:        "Shipway",
      shop:        "shipway",
      credentials: { username: keyToUse, password: secretToUse, apiKey: keyToUse, apiSecret: secretToUse },
    });

    try {
      await this.syncWarehouses();
    } catch (err) {
      console.warn("[Shipway] Warehouse sync after connect failed:", err.message);
    }

    return channel;
  }

  async syncWarehouses() {
    const { channel, apiKey, secretKey } = await this.ensureToken();
    let remoteWarehouses = [];

    try {
      const body = await shipwayFetch("/getwarehouses", { apiKey, secretKey });
      remoteWarehouses = body.data || body.warehouses || [];
      if (!Array.isArray(remoteWarehouses)) remoteWarehouses = [];
    } catch (err) {
      console.warn("[Shipway] Warehouse fetch failed:", err.message);
    }

    const synced = [];
    for (const wh of remoteWarehouses) {
      const externalWarehouseId = String(wh.id || wh.warehouse_id || wh.pickup_code || "");
      if (!externalWarehouseId) continue;

      const record = await upsertWarehouseRecord({
        companyId:           this.companyId,
        channelId:           channel._id,
        provider:            this.provider,
        externalWarehouseId,
        data: {
          name:          wh.name || wh.warehouse_name || `Shipway ${externalWarehouseId}`,
          phone_number:  wh.phone,
          email:         wh.email,
          contact_person: wh.contact_person,
          address_attributes: {
            street_address: wh.address,
            city:           wh.city,
            state:          wh.state,
            zip:            wh.pincode || wh.zip,
            country:        wh.country || "India",
          },
          ...wh,
        },
      });
      synced.push(record);
    }

    return synced;
  }

  async createWarehouse(payload) {
    const { channel, apiKey, secretKey } = await this.ensureToken();

    const body = await shipwayFetch("/addwarehouse", { apiKey, secretKey, body: payload });
    const warehouseId = body.id || body.warehouse_id || body.data?.id;

    if (!warehouseId) throw new HttpError(502, "Shipway did not return a warehouse ID", body);

    return upsertWarehouseRecord({
      companyId:           this.companyId,
      channelId:           channel._id,
      provider:            this.provider,
      externalWarehouseId: String(warehouseId),
      data:                { ...payload, id: warehouseId },
    });
  }

  async checkServiceability({ from, to, weight = 0.5, paymentMode = "cod" }) {
    const { apiKey, secretKey } = await this.ensureToken();
    return shipwayFetch("/checkserviceability", {
      apiKey,
      secretKey,
      body: { origin: from, destination: to, weight, payment_type: paymentMode },
    });
  }

  buildShipmentPayload(order, warehouse, options = {}) {
    const addr = order.shippingAddress || {};
    const nameParts = (addr.name || order.customerName || "").trim().split(/\s+/);

    return {
      order_id:          order.name || String(order.externalId),
      order_date:        new Date().toISOString().slice(0, 10),
      pickup_code:       warehouse.externalWarehouseId,

      first_name:        nameParts[0] || "",
      last_name:         nameParts.slice(1).join(" ") || "",
      address:           [addr.address1, addr.address2].filter(Boolean).join(", "),
      city:              addr.city,
      state:             addr.province,
      pincode:           addr.zip,
      country:           addr.country || "India",
      email:             order.email || "",
      phone:             addr.phone || order.phone || "",

      products: (order.lineItems || [])
        .filter((item) => item.requiresShipping !== false)
        .map((item) => ({
          product_name: item.title,
          sku:          item.sku || item.title,
          quantity:     item.quantity,
          price:        item.price,
        })),

      payment_type:   order.isCOD ? "COD" : "Prepaid",
      total_amount:   order.totalPrice,
      cod_amount:     order.isCOD ? (order.codAmount || order.totalPrice) : 0,

      weight:         options.weight || Math.max(0.5, (order.lineItems || []).reduce((sum, item) => sum + ((item.grams || 0) * item.quantity / 1000), 0)),
      length:         options.length || 10,
      width:          options.breadth || 10,
      height:         options.height || 10,
    };
  }

  async createForwardOrder(payload, { syncedOrderId, shopifyOrderId, shopifyOrderName } = {}) {
    const { channel, apiKey, secretKey } = await this.ensureToken();

    const body = await shipwayFetch("/pushorder", { apiKey, secretKey, body: payload });
    const shipmentData = body.data || body;

    return createShipmentRecord({
      companyId:        this.companyId,
      channelId:        channel._id,
      provider:         this.provider,
      syncedOrderId,
      shopifyOrderId,
      shopifyOrderName,
      isReturn:         false,
      orderId:          String(shipmentData.order_id || payload.order_id),
      shipmentId:       String(shipmentData.shipment_id || ""),
      awbCode:          shipmentData.awb || shipmentData.awb_code || "",
      courierId:        String(shipmentData.carrier_id || ""),
      courierName:      shipmentData.carrier_name || "Shipway",
      status:           shipmentData.awb ? "awb_generated" : "order_created",
      paymentMethod:    payload.payment_type,
      codAmount:        payload.cod_amount || 0,
      customerName:     [payload.first_name, payload.last_name].filter(Boolean).join(" "),
      destination:      [payload.city, payload.state].filter(Boolean).join(", "),
      warehouseId:      payload.pickup_code,
      labelUrl:         shipmentData.label_url || "",
      request:          payload,
      response:         body,
    });
  }

  async createReturnOrder(payload, { syncedOrderId, shopifyOrderId, shopifyOrderName } = {}) {
    const { channel, apiKey, secretKey } = await this.ensureToken();
    const body = await shipwayFetch("/reverseorder", { apiKey, secretKey, body: payload });

    return createShipmentRecord({
      companyId:        this.companyId,
      channelId:        channel._id,
      provider:         this.provider,
      syncedOrderId,
      shopifyOrderId,
      shopifyOrderName,
      isReturn:         true,
      orderId:          String(body.order_id || ""),
      awbCode:          body.awb || "",
      status:           body.awb ? "awb_generated" : "order_created",
      request:          payload,
      response:         body,
    });
  }

  async cancelOrder(awbs) {
    const { apiKey, secretKey } = await this.ensureToken();
    const body = await shipwayFetch("/cancelorder", { apiKey, secretKey, body: { awb: awbs[0] } });
    await updateShipmentsByAwb({ companyId: this.companyId, awbCodes: awbs, update: { status: "cancel_requested" } });
    return body;
  }

  async trackOrders(awbs) {
    const { apiKey, secretKey } = await this.ensureToken();
    const results = {};

    await Promise.all(
      awbs.map(async (awb) => {
        try {
          const body = await shipwayFetch("/trackshipment", { apiKey, secretKey, body: { awb } });
          results[awb] = body;
          const status = body.shipment_status || body.status;
          if (status) {
            await updateShipmentsByAwb({
              companyId: this.companyId,
              awbCodes:  [awb],
              update:    { trackingStatus: String(status), lastTrackedAt: new Date() },
            });
          }
        } catch (err) {
          results[awb] = { error: err.message };
        }
      }),
    );

    return results;
  }
}
