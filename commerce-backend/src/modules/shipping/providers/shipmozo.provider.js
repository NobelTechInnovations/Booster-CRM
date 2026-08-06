import { BaseShippingProvider } from "./base.provider.js";
import { HttpError } from "../../../utils/http-error.js";
import {
  getShippingChannel,
  upsertShippingChannel,
} from "../../../repositories/channel.repo.js";
import { upsertWarehouseRecord, listWarehouses } from "../../../repositories/warehouse.repo.js";
import { createShipmentRecord, updateShipmentsByAwb } from "../../../repositories/shipment.repo.js";

// Official Base URL from ShipMozo API Documentation
const BASE_URL = "https://shipping-api.com/app/api/v1";

async function shipmozoFetch(path, { method = "GET", publicKey, privateKey, body } = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (publicKey) headers["public-key"] = publicKey;
  if (privateKey) headers["private-key"] = privateKey;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseBody = await response.json().catch(() => ({}));


  if (!response.ok || responseBody.result === "0") {
    throw new HttpError(
      response.status >= 400 ? response.status : 400,
      responseBody?.message || "ShipMozo API request failed",
      responseBody,
    );
  }

  return responseBody;
}

export class ShipMozoProvider extends BaseShippingProvider {
  constructor({ companyId }) {
    super({ companyId });
    this.provider = "shipmozo";
  }

  async ensureToken() {
    const channel = await getShippingChannel({ companyId: this.companyId, provider: this.provider });
    if (!channel) throw new HttpError(400, "Connect ShipMozo first");

    const publicKey = channel.credentials?.apiKey || channel.credentials?.username;
    // const publicKey = "jpKMAvrkZPwTCZW8mXhJ";
    const privateKey = channel.credentials?.apiSecret || channel.credentials?.password;
    // const privateKey = "uy4RPAYeNZZnMwgLG9HO";

    if (!publicKey || !privateKey) {
      throw new HttpError(400, "ShipMozo public-key and private-key are required. Reconnect channel.");
    }

    return { channel, publicKey, privateKey };
  }

  /**
   * Connect ShipMozo using either:
   * 1. Direct Public Key & Private Key
   * 2. Username & Password (calls POST /login to obtain public_key & private_key)
   */
  async connect({ userId, publicKey, privateKey, username, password }) {

    let pubKey = publicKey || "jpKMAvrkZPwTCZW8mXhJ";
    let privKey = privateKey || "uy4RPAYeNZZnMwgLG9HO";

    if (!pubKey || !privKey) {
      if (!username || !password) {
        throw new HttpError(400, "ShipMozo requires Public-Key & Private-Key or Username & Password");
      }

      // Authenticate via ShipMozo Login API
      const loginRes = await shipmozoFetch("/login", {
        method: "POST",
        body: { username, password },
      });

      const userDetails = loginRes.data?.[0];
      if (!userDetails?.public_key || !userDetails?.private_key) {
        throw new HttpError(401, "ShipMozo authentication failed. Invalid username/password.", loginRes);
      }

      pubKey = userDetails.public_key;
      privKey = userDetails.private_key;
    }

    const channel = await upsertShippingChannel({
      companyId: this.companyId,
      userId,
      provider: this.provider,
      name: "ShipMozo",
      shop: "shipmozo",
      credentials: { username: pubKey, password: privKey, apiKey: pubKey, apiSecret: privKey },
    });

    try {
      await this.syncWarehouses();
    } catch (err) {
      console.warn("[ShipMozo] Warehouse sync after connect failed:", err.message);
    }

    return channel;
  }

  /**
   * Fetches warehouses from GET /get-warehouses and upserts them locally
   */
  async syncWarehouses() {
    const { channel, publicKey, privateKey } = await this.ensureToken();

    let remoteWarehouses = [];
    try {
      const body = await shipmozoFetch("/get-warehouses", { method: "GET", publicKey, privateKey });
      remoteWarehouses = body.data || [];
      if (!Array.isArray(remoteWarehouses)) remoteWarehouses = [];
    } catch (err) {
      console.warn("[ShipMozo] GET /get-warehouses failed:", err.message);
    }

    const synced = [];
    for (const wh of remoteWarehouses) {
      const externalWarehouseId = String(wh.id || wh.warehouse_id || "");
      if (!externalWarehouseId) continue;

      const record = await upsertWarehouseRecord({
        companyId: this.companyId,
        channelId: channel._id,
        provider: this.provider,
        externalWarehouseId,
        data: {
          name: wh.address_title || wh.name || `ShipMozo ${externalWarehouseId}`,
          phone_number: wh.phone,
          email: wh.email,
          contact_person: wh.name,
          address_attributes: {
            street_address: [wh.address_line_one, wh.address_line_two].filter(Boolean).join(", "),
            city: wh.city,
            state: wh.state,
            zip: String(wh.pincode || wh.pin_code || ""),
            country: wh.country || "India",
          },
          ...wh,
        },
      });
      synced.push(record);
    }

    return synced;
  }

  /**
   * Creates a new pickup warehouse on ShipMozo via POST /create-warehouse
   */
  async createWarehouse(payload) {
    const { channel, publicKey, privateKey } = await this.ensureToken();

    const body = await shipmozoFetch("/create-warehouse", {
      method: "POST",
      publicKey,
      privateKey,
      body: {
        address_title: payload.name || payload.address_title || `Warehouse-${Date.now()}`,
        name: payload.contact_person || payload.name,
        phone: Number(String(payload.phone_number || payload.phone || "").replace(/\D/g, "")),
        alternate_phone: payload.alternate_phone ? Number(String(payload.alternate_phone).replace(/\D/g, "")) : undefined,
        email: payload.email,
        address_line_one: payload.address_attributes?.street_address || payload.address_line_one,
        address_line_two: payload.address_line_two || "",
        pin_code: Number(payload.address_attributes?.zip || payload.pin_code),
      },
    });

    const warehouseId = body.data?.warehouse_id;
    if (!warehouseId) throw new HttpError(502, "ShipMozo did not return a warehouse ID", body);

    return upsertWarehouseRecord({
      companyId: this.companyId,
      channelId: channel._id,
      provider: this.provider,
      externalWarehouseId: String(warehouseId),
      data: { ...payload, warehouse_id: warehouseId },
    });
  }

  /**
   * Pincode Serviceability Check via POST /pincode-serviceability
   */
  async checkServiceability({ from, to }) {
    const { publicKey, privateKey } = await this.ensureToken();
    return shipmozoFetch("/pincode-serviceability", {
      method: "POST",
      publicKey,
      privateKey,
      body: {
        pickup_pincode: Number(from),
        delivery_pincode: Number(to),
      },
    });
  }

  /**
   * Builds ShipMozo POST /push-order format according to API documentation
   */
  buildShipmentPayload(order, warehouse, options = {}) {
    const addr = order.shippingAddress || {};
    const fullPhone = String(addr.phone || order.phone || "").replace(/\D/g, "");
    const cleanPhone = Number(fullPhone.slice(-10) || "9999999999");

    return {
      order_id: order.name || String(order.externalId),
      order_date: (order.shopifyCreatedAt ? new Date(order.shopifyCreatedAt) : new Date()).toISOString().slice(0, 10),
      order_type: options.orderType || "ESSENTIALS",
      consignee_name: addr.name || order.customerName || "Customer",
      consignee_phone: cleanPhone,
      consignee_alternate_phone: cleanPhone,
      consignee_email: order.email || "",
      consignee_address_line_one: addr.address1 || "Address",
      consignee_address_line_two: addr.address2 || "",
      consignee_pin_code: Number(addr.zip || "110001"),
      consignee_city: addr.city || "City",
      consignee_state: addr.province || "State",

      product_detail: (order.lineItems || [])
        .filter((item) => item.requiresShipping !== false)
        .map((item) => ({
          name: item.title,
          sku_number: item.sku || item.title,
          quantity: item.quantity,
          unit_price: item.price,
          discount: "",
          hsn: "",
          product_category: "Other",
        })),

      payment_type: order.isCOD ? "COD" : "PREPAID",
      cod_amount: order.isCOD ? String(order.codAmount || order.totalPrice) : "",
      weight: options.weightInGrams || Math.max(200, (order.lineItems || []).reduce((sum, item) => sum + ((item.grams || 200) * item.quantity), 0)),
      length: options.length || 10,
      width: options.width || options.breadth || 10,
      height: options.height || 10,

      warehouse_id: warehouse.externalWarehouseId,
    };
  }

  /**
   * Pushes forward order via POST /push-order
   */
  async createForwardOrder(payload, { syncedOrderId, shopifyOrderId, shopifyOrderName } = {}) {
    const { channel, publicKey, privateKey } = await this.ensureToken();

    const body = await shipmozoFetch("/push-order", {
      method: "POST",
      publicKey,
      privateKey,
      body: payload,
    });

    const resData = body.data || {};
    const orderId = resData.order_id || payload.order_id;
    const awbCode = resData.awb_number || resData.reference_id || "";

    let labelUrl = "";
    if (awbCode) {
      try {
        const labelRes = await shipmozoFetch(`/get-order-label/${awbCode}`, { method: "GET", publicKey, privateKey });
        labelUrl = labelRes.data?.[0]?.label || "";
      } catch (_err) {
        // Label fetch is optional
      }
    }

    return createShipmentRecord({
      companyId: this.companyId,
      channelId: channel._id,
      provider: this.provider,
      syncedOrderId,
      shopifyOrderId,
      shopifyOrderName,
      isReturn: false,
      orderId: String(orderId),
      shipmentId: String(resData.reference_id || orderId),
      awbCode: String(awbCode),
      courierName: "ShipMozo",
      status: awbCode ? "awb_generated" : "order_created",
      paymentMethod: payload.payment_type,
      codAmount: payload.payment_type === "COD" ? Number(payload.cod_amount || 0) : 0,
      customerName: payload.consignee_name,
      destination: [payload.consignee_city, payload.consignee_state].filter(Boolean).join(", "),
      warehouseId: payload.warehouse_id,
      labelUrl,
      request: payload,
      response: body,
    });
  }

  /**
   * Pushes return order via POST /push-return-order
   */
  async createReturnOrder(payload, { syncedOrderId, shopifyOrderId, shopifyOrderName } = {}) {
    const { channel, publicKey, privateKey } = await this.ensureToken();

    const body = await shipmozoFetch("/push-return-order", {
      method: "POST",
      publicKey,
      privateKey,
      body: payload,
    });

    const resData = body.data || {};

    return createShipmentRecord({
      companyId: this.companyId,
      channelId: channel._id,
      provider: this.provider,
      syncedOrderId,
      shopifyOrderId,
      shopifyOrderName,
      isReturn: true,
      orderId: String(resData.order_id || payload.order_id),
      shipmentId: String(resData.reference_id || ""),
      awbCode: String(resData.awb_number || ""),
      status: resData.awb_number ? "awb_generated" : "order_created",
      request: payload,
      response: body,
    });
  }

  /**
   * Cancels order via POST /cancel-order
   */
  async cancelOrder(awbs) {
    const { publicKey, privateKey } = await this.ensureToken();
    const body = await shipmozoFetch("/cancel-order", {
      method: "POST",
      publicKey,
      privateKey,
      body: { awb_number: awbs[0] },
    });
    await updateShipmentsByAwb({ companyId: this.companyId, awbCodes: awbs, update: { status: "cancel_requested" } });
    return body;
  }

  /**
   * Tracks orders via GET /track-order?awb_number={awb}
   */
  async trackOrders(awbs) {
    const { publicKey, privateKey } = await this.ensureToken();
    const results = {};

    await Promise.all(
      awbs.map(async (awb) => {
        try {
          const body = await shipmozoFetch(`/track-order?awb_number=${awb}`, {
            method: "GET",
            publicKey,
            privateKey,
          });
          results[awb] = body;
          const status = body.data?.current_status || body.data?.shipment_status;
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
