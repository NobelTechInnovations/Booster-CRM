import { BaseShippingProvider } from "./base.provider.js";
import { HttpError } from "../../../utils/http-error.js";
import {
  getShippingChannel,
  upsertShippingChannel,
  updateShippingChannelToken,
} from "../../../repositories/channel.repo.js";
import { upsertWarehouseRecord, listWarehouses } from "../../../repositories/warehouse.repo.js";
import { createShipmentRecord, updateShipmentsByAwb } from "../../../repositories/shipment.repo.js";

const BASE_URL = "https://apiv2.shiprocket.in/v1/external";

async function shiprocketFetch(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseBody = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpError(response.status || 502, responseBody?.message || "Shiprocket request failed", responseBody);
  }

  return responseBody;
}

export class ShiprocketProvider extends BaseShippingProvider {
  constructor({ companyId }) {
    super({ companyId });
    this.provider = "shiprocket";
  }

  async _requestToken({ email, password }) {
    const body = await shiprocketFetch("/auth/login", {
      method: "POST",
      body: { email, password },
    });

    if (!body.token) throw new HttpError(401, "Shiprocket authentication failed", body);

    // Shiprocket tokens are valid for 10 days
    return {
      token:     body.token,
      expiresAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
    };
  }

  async ensureToken() {
    const channel = await getShippingChannel({ companyId: this.companyId, provider: this.provider });
    if (!channel) throw new HttpError(400, "Connect Shiprocket first");

    const expiresAt = channel.credentials?.tokenExpiresAt ? new Date(channel.credentials.tokenExpiresAt) : null;
    const isExpired = !channel.credentials?.token || !expiresAt || expiresAt.getTime() - Date.now() < 60 * 60 * 1000;

    if (!isExpired) return { channel, token: channel.credentials.token };

    if (!channel.credentials?.username || !channel.credentials?.password) {
      throw new HttpError(400, "Shiprocket session expired. Reconnect with your email and password.");
    }

    const { token, expiresAt: nextExpiry } = await this._requestToken({
      email:    channel.credentials.username,
      password: channel.credentials.password,
    });

    await updateShippingChannelToken({ channelId: channel._id, companyId: this.companyId, token, tokenExpiresAt: nextExpiry });
    return { channel, token };
  }

  async connect({ userId, email, password }) {
    const { token, expiresAt } = await this._requestToken({ email, password });

    const channel = await upsertShippingChannel({
      companyId:   this.companyId,
      userId,
      provider:    this.provider,
      name:        "Shiprocket",
      shop:        "shiprocket",
      credentials: { username: email, password, token, tokenExpiresAt: expiresAt },
    });

    try {
      await this.syncWarehouses();
    } catch (err) {
      console.warn("[Shiprocket] Warehouse sync after connect failed:", err.message);
    }

    return channel;
  }

  async syncWarehouses() {
    const { channel, token } = await this.ensureToken();
    const body = await shiprocketFetch("/settings/company/pickup", { token });

    const pickupLocations = body.data?.shipping_address || [];
    const synced = [];

    for (const loc of pickupLocations) {
      const externalWarehouseId = String(loc.id || loc.pickup_location || "");
      if (!externalWarehouseId) continue;

      const record = await upsertWarehouseRecord({
        companyId:           this.companyId,
        channelId:           channel._id,
        provider:            this.provider,
        externalWarehouseId,
        data: {
          name:          loc.pickup_location || loc.company,
          phone_number:  loc.phone,
          email:         loc.email,
          contact_person: loc.name,
          address_attributes: {
            street_address: loc.address,
            city:           loc.city,
            state:          loc.state,
            zip:            loc.pin_code,
            country:        loc.country || "India",
          },
          ...loc,
        },
      });
      synced.push(record);
    }

    return synced;
  }

  async createWarehouse(payload) {
    const { channel, token } = await this.ensureToken();

    const body = await shiprocketFetch("/settings/company/addpickup", {
      method: "POST",
      token,
      body:   payload,
    });

    const pickupId = body.data?.id || body.id;
    if (!pickupId) throw new HttpError(502, "Shiprocket did not return a pickup location ID", body);

    return upsertWarehouseRecord({
      companyId:           this.companyId,
      channelId:           channel._id,
      provider:            this.provider,
      externalWarehouseId: String(pickupId),
      data:                { ...payload, id: pickupId },
    });
  }

  async getWarehouses() {
    return listWarehouses({ companyId: this.companyId, provider: this.provider });
  }

  async checkServiceability({ from, to, weight = 0.5, paymentMode = "prepaid" }) {
    const { token } = await this.ensureToken();
    return shiprocketFetch(
      `/courier/serviceability/?pickup_postcode=${from}&delivery_postcode=${to}&weight=${weight}&cod=${paymentMode === "cod" ? 1 : 0}`,
      { token },
    );
  }

  buildShipmentPayload(order, warehouse, options = {}) {
    const addr      = order.shippingAddress || {};
    const nameParts = (addr.name || order.customerName || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName  = nameParts.slice(1).join(" ") || "";

    return {
      order_id:          order.name || String(order.externalId),
      order_date:        new Date().toISOString().slice(0, 10),
      pickup_location:   warehouse.externalWarehouseId,

      billing_customer_name: firstName,
      billing_last_name:     lastName,
      billing_address:       [addr.address1, addr.address2].filter(Boolean).join(", "),
      billing_city:          addr.city,
      billing_state:         addr.province,
      billing_pincode:       addr.zip,
      billing_country:       addr.country || "India",
      billing_email:         order.email || "",
      billing_phone:         addr.phone || order.phone || "",

      shipping_is_billing:   true,

      order_items: (order.lineItems || [])
        .filter((item) => item.requiresShipping !== false)
        .map((item) => ({
          name:          item.title,
          sku:           item.sku || item.title,
          units:         item.quantity,
          selling_price: item.price,
          discount:      0,
          tax:           "0",
          hsn:           0,
        })),

      payment_method:  order.isCOD ? "COD" : "Prepaid",
      sub_total:       order.subtotalPrice || order.totalPrice,
      cod_collectible: order.isCOD ? (order.codAmount || order.totalPrice) : 0,

      length:  options.length || 10,
      breadth: options.breadth || 10,
      height:  options.height || 10,
      weight:  options.weight || Math.max(0.5, (order.lineItems || []).reduce((sum, item) => sum + ((item.grams || 0) * item.quantity / 1000), 0)),

      ...(options.courierId ? { courier_id: options.courierId } : {}),
    };
  }

  async createForwardOrder(payload, { syncedOrderId, shopifyOrderId, shopifyOrderName } = {}) {
    const { channel, token } = await this.ensureToken();

    const body     = await shiprocketFetch("/orders/create/adhoc", { method: "POST", token, body: payload });
    const shipmentData = body;

    return createShipmentRecord({
      companyId:        this.companyId,
      channelId:        channel._id,
      provider:         this.provider,
      syncedOrderId,
      shopifyOrderId,
      shopifyOrderName,
      isReturn:         false,
      orderId:          String(shipmentData.order_id || ""),
      shipmentId:       String(shipmentData.shipment_id || ""),
      awbCode:          shipmentData.awb_code || "",
      courierId:        String(shipmentData.courier_company_id || ""),
      courierName:      shipmentData.courier_name || "",
      status:           shipmentData.awb_code ? "awb_generated" : "order_created",
      paymentMethod:    payload.payment_method,
      codAmount:        payload.cod_collectible || 0,
      customerName:     [payload.billing_customer_name, payload.billing_last_name].filter(Boolean).join(" "),
      destination:      [payload.billing_city, payload.billing_state].filter(Boolean).join(", "),
      warehouseId:      payload.pickup_location,
      labelUrl:         shipmentData.label_url || "",
      request:          payload,
      response:         body,
    });
  }

  async createReturnOrder(payload, { syncedOrderId, shopifyOrderId, shopifyOrderName } = {}) {
    const { channel, token } = await this.ensureToken();
    const body = await shiprocketFetch("/orders/create/return", { method: "POST", token, body: payload });

    return createShipmentRecord({
      companyId:        this.companyId,
      channelId:        channel._id,
      provider:         this.provider,
      syncedOrderId,
      shopifyOrderId,
      shopifyOrderName,
      isReturn:         true,
      orderId:          String(body.order_id || ""),
      shipmentId:       String(body.shipment_id || ""),
      awbCode:          body.awb_code || "",
      status:           body.awb_code ? "awb_generated" : "order_created",
      paymentMethod:    "Prepaid",
      codAmount:        0,
      request:          payload,
      response:         body,
    });
  }

  async cancelOrder(awbs) {
    const { token } = await this.ensureToken();
    const body = await shiprocketFetch("/orders/cancel", {
      method: "POST",
      token,
      body:   { awbs },
    });
    await updateShipmentsByAwb({ companyId: this.companyId, awbCodes: awbs, update: { status: "cancel_requested" } });
    return body;
  }

  async trackOrders(awbs) {
    const { token } = await this.ensureToken();
    const results = {};

    await Promise.all(
      awbs.map(async (awb) => {
        try {
          const body   = await shiprocketFetch(`/courier/track/awb/${awb}`, { token });
          const status = body.tracking_data?.shipment_status;
          results[awb] = body;
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
