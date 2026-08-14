import { BaseShippingProvider } from "./base.provider.js";
import { HttpError } from "../../../utils/http-error.js";
import {
  getShippingChannel,
  upsertShippingChannel,
  updateShippingChannelToken,
} from "../../../repositories/channel.repo.js";
import { upsertWarehouseRecord, listWarehouses } from "../../../repositories/warehouse.repo.js";
import { createShipmentRecord, updateShipmentsByAwb } from "../../../repositories/shipment.repo.js";

const BASE_URL = "https://app.shipway.com/api";

async function shipwayFetch(path, { method = "GET", username, password, apiKey, secretKey, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const user = username || apiKey;
  const pass = password || secretKey;

  if (user && pass) {
    const authHeader = Buffer.from(`${user}:${pass}`).toString("base64");
    headers["Authorization"] = `Basic ${authHeader}`;
    headers["X-Api-Key"] = user;
    headers["X-Secret-Key"] = pass;
  }

  // Try primary BASE_URL app.shipway.com, fallback to shipway.in if needed
  let response;
  let responseBody;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body && method !== "GET" ? JSON.stringify(body) : undefined,
    });
    responseBody = await response.json().catch(() => ({}));
  } catch (err) {
    // Fallback URL attempt
    response = await fetch(`https://shipway.in/api${path}`, {
      method,
      headers,
      body: body && method !== "GET" ? JSON.stringify(body) : undefined,
    });
    responseBody = await response.json().catch(() => ({}));
  }

  if (!response?.ok && responseBody?.success !== 1) {
    throw new HttpError(
      response?.status || 502,
      responseBody?.message || responseBody?.error || "Shipway request failed",
      responseBody,
    );
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
      username: channel.credentials?.username || channel.credentials?.apiKey || channel.credentials?.email,
      password: channel.credentials?.password || channel.credentials?.apiSecret || channel.credentials?.licenseKey,
    };
  }

  async connect({ userId, username, password, email, licenseKey, apiKey, secretKey }) {
    const userToUse = String(email || username || apiKey || "").trim();
    const passToUse = String(licenseKey || password || secretKey || "").trim();

    if (!userToUse || !passToUse) {
      throw new HttpError(400, "Shipway Email and License Key (or API Key/Secret) are required");
    }

    const channel = await upsertShippingChannel({
      companyId: this.companyId,
      userId,
      provider: this.provider,
      name: "Shipway",
      shop: "shipway",
      credentials: { username: userToUse, password: passToUse, email: userToUse, licenseKey: passToUse, apiKey: userToUse, apiSecret: passToUse },
    });

    try {
      await this.syncWarehouses();
    } catch (err) {
      console.warn("[Shipway] Warehouse sync after connect failed:", err.message);
    }

    return channel;
  }

  async syncWarehouses() {
    const { channel, username, password } = await this.ensureToken();
    let remoteWarehouses = [];

    try {
      const body = await shipwayFetch("/getwarehouses", { method: "GET", username, password });

      if (body.message && typeof body.message === "object") {
        remoteWarehouses = Array.isArray(body.message) ? body.message : Object.values(body.message);
      } else if (body.data) {
        remoteWarehouses = Array.isArray(body.data) ? body.data : Object.values(body.data);
      } else if (body.warehouses) {
        remoteWarehouses = Array.isArray(body.warehouses) ? body.warehouses : Object.values(body.warehouses);
      }
    } catch (err) {
      console.warn("[Shipway] Warehouse fetch failed:", err.message);
    }

    const synced = [];
    for (const wh of remoteWarehouses) {
      const externalWarehouseId = String(wh.warehouse_id || wh.id || wh.pickup_code || "");
      if (!externalWarehouseId) continue;

      const record = await upsertWarehouseRecord({
        companyId: this.companyId,
        channelId: channel._id,
        provider: this.provider,
        externalWarehouseId,
        data: {
          name: wh.title || wh.name || wh.warehouse_name || `Shipway ${externalWarehouseId}`,
          phone_number: wh.phone || wh.phone_number || "",
          email: wh.email || "",
          contact_person: wh.contact_person || wh.title || "",
          address_attributes: {
            street_address: wh.address || "",
            city: wh.city || "",
            state: wh.state || "",
            zip: String(wh.pincode || wh.zip || wh.pin_code || ""),
            country: wh.country || "India",
          },
          ...wh,
        },
      });
      synced.push(record);
    }

    return synced;
  }

  async createWarehouse(payload) {
    const { channel, username, password } = await this.ensureToken();

    const body = await shipwayFetch("/addwarehouse", { method: "POST", username, password, body: payload });
    const warehouseId = body.id || body.warehouse_id || body.data?.id || body.message?.warehouse_id;

    if (!warehouseId) throw new HttpError(502, "Shipway did not return a warehouse ID", body);

    return upsertWarehouseRecord({
      companyId: this.companyId,
      channelId: channel._id,
      provider: this.provider,
      externalWarehouseId: String(warehouseId),
      data: { ...payload, id: warehouseId },
    });
  }

  // Real endpoint, confirmed against Shipway's own docs (apidocs.shipway.com
  // → Rate API → Carrier Rates) and verified live against a real connected
  // account: GET /getshipwaycarrierrates?fromPincode&toPincode&paymentType,
  // Basic auth (same as every other call here). Returns rate_card[] with
  // delivery_charge (freight) + cod_charges (COD handling fee, additive) per
  // real courier — e.g. "Shipway Delhivery Express (0.5kg)" at a real price,
  // not the fabricated "Shipway Express Air" this used to fall back to.
  async checkServiceability({ from, to, weight = 0.5, paymentMode = "cod" }) {
    const { username, password } = await this.ensureToken();
    const isCod = paymentMode === "cod" || paymentMode === "COD";
    const params = new URLSearchParams({
      fromPincode: String(from || "302020"),
      toPincode: String(to || "302020"),
      paymentType: isCod ? "cod" : "prepaid",
    });

    const res = await shipwayFetch(`/getshipwaycarrierrates?${params.toString()}`, { method: "GET", username, password });
    const rateCard = res?.rate_card || [];

    return {
      status: res?.success,
      courier_companies: rateCard.map((c) => ({
        id: String(c.carrier_id),
        courier_name: c.courier_name,
        rate: Math.round((Number(c.delivery_charge || 0) + (isCod ? Number(c.cod_charges || 0) : 0)) * 100) / 100,
        etd: "",
        mode: `Zone ${c.zone}`,
      })),
    };
  }

  buildShipmentPayload(order, warehouse, options = {}) {
    const addr = order.shippingAddress || {};
    const nameParts = (addr.name || order.customerName || "").trim().split(/\s+/);

    return {
      order_id: order.name || String(order.externalId),
      order_date: new Date().toISOString().slice(0, 10),
      pickup_code: warehouse.externalWarehouseId,

      first_name: nameParts[0] || "",
      last_name: nameParts.slice(1).join(" ") || "",
      address: [addr.address1, addr.address2].filter(Boolean).join(", "),
      city: addr.city,
      state: addr.province,
      pincode: addr.zip,
      country: addr.country || "India",
      email: order.email || "",
      phone: addr.phone || order.phone || "",

      products: (order.lineItems || [])
        .filter((item) => item.requiresShipping !== false)
        .map((item) => ({
          product_name: item.title,
          sku: item.sku || item.title,
          quantity: item.quantity,
          price: item.price,
        })),

      payment_type: order.isCOD ? "COD" : "Prepaid",
      total_amount: order.totalPrice,
      cod_amount: order.isCOD ? (order.codAmount || order.totalPrice) : 0,

      weight: options.weight || Math.max(0.5, (order.lineItems || []).reduce((sum, item) => sum + ((item.grams || 0) * item.quantity / 1000), 0)),
      length: options.length || 10,
      width: options.breadth || 10,
      height: options.height || 10,
    };
  }

  async createForwardOrder(payload, { syncedOrderId, shopifyOrderId, shopifyOrderName } = {}) {
    const { channel, username, password } = await this.ensureToken();

    const body = await shipwayFetch("/pushorder", { method: "POST", username, password, body: payload });
    const shipmentData = body.data || body;

    return createShipmentRecord({
      companyId: this.companyId,
      channelId: channel._id,
      provider: this.provider,
      syncedOrderId,
      shopifyOrderId,
      shopifyOrderName,
      isReturn: false,
      orderId: String(shipmentData.order_id || payload.order_id),
      shipmentId: String(shipmentData.shipment_id || ""),
      awbCode: shipmentData.awb || shipmentData.awb_code || "",
      courierId: String(shipmentData.carrier_id || ""),
      courierName: shipmentData.carrier_name || "Shipway",
      status: shipmentData.awb ? "awb_generated" : "order_created",
      paymentMethod: payload.payment_type,
      codAmount: payload.cod_amount || 0,
      customerName: [payload.first_name, payload.last_name].filter(Boolean).join(" "),
      destination: [payload.city, payload.state].filter(Boolean).join(", "),
      warehouseId: payload.pickup_code,
      labelUrl: shipmentData.label_url || "",
      request: payload,
      response: body,
    });
  }

  async createReturnOrder(payload, { syncedOrderId, shopifyOrderId, shopifyOrderName } = {}) {
    const { channel, username, password } = await this.ensureToken();
    const body = await shipwayFetch("/reverseorder", { method: "POST", username, password, body: payload });

    return createShipmentRecord({
      companyId: this.companyId,
      channelId: channel._id,
      provider: this.provider,
      syncedOrderId,
      shopifyOrderId,
      shopifyOrderName,
      isReturn: true,
      orderId: String(body.order_id || ""),
      awbCode: body.awb || "",
      status: body.awb ? "awb_generated" : "order_created",
      request: payload,
      response: body,
    });
  }

  async cancelOrder(awbs) {
    const { username, password } = await this.ensureToken();
    const body = await shipwayFetch("/cancelorder", { method: "POST", username, password, body: { awb: awbs[0] } });
    await updateShipmentsByAwb({ companyId: this.companyId, awbCodes: awbs, update: { status: "cancel_requested" } });
    return body;
  }

  async trackOrders(awbs) {
    const { username, password } = await this.ensureToken();
    const results = {};

    await Promise.all(
      awbs.map(async (awb) => {
        try {
          const body = await shipwayFetch(`/trackshipment?awb=${awb}`, { method: "GET", username, password });
          results[awb] = body;
          const status = body.shipment_status || body.status;
          if (status) {
            await updateShipmentsByAwb({
              companyId: this.companyId,
              awbCodes: [awb],
              update: { trackingStatus: String(status), lastTrackedAt: new Date() },
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
