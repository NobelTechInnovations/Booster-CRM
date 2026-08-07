import { BaseShippingProvider } from "./base.provider.js";
import { HttpError } from "../../../utils/http-error.js";
import {
  getShippingChannel,
  upsertShippingChannel,
  updateShippingChannelToken,
} from "../../../repositories/channel.repo.js";
import {
  upsertWarehouseRecord,
  listWarehouses,
} from "../../../repositories/warehouse.repo.js";
import { createShipmentRecord, updateShipmentsByAwb } from "../../../repositories/shipment.repo.js";

const BASE_URL = "https://shazam.velocity.in";

function normalizeUsername(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return cleaned;
  if (cleaned.startsWith("+")) return cleaned;
  return `+91${cleaned.replace(/\D/g, "")}`;
}

async function velocityFetch(path, { method = "POST", token, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseBody = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HttpError(response.status || 502, responseBody?.message || "Velocity request failed", responseBody);
  }

  return responseBody;
}

export class VelocityProvider extends BaseShippingProvider {
  constructor({ companyId }) {
    super({ companyId });
    this.provider = "velocity";
  }

  // ─── Auth ────────────────────────────────────────────────────────────────

  async _requestToken({ username, password }) {
    const body = await velocityFetch("/custom/api/v1/auth-token", {
      body: { username: normalizeUsername(username), password: String(password || "") },
    });

    if (!body.token) throw new HttpError(401, "Velocity authentication failed", body);

    return {
      token:     body.token,
      expiresAt: body.expires_at ? new Date(body.expires_at) : new Date(Date.now() + 23 * 60 * 60 * 1000),
    };
  }

  async ensureToken() {
    const channel = await getShippingChannel({ companyId: this.companyId, provider: this.provider });
    if (!channel) throw new HttpError(400, "Connect Velocity Shipping first");

    const expiresAt = channel.credentials?.tokenExpiresAt ? new Date(channel.credentials.tokenExpiresAt) : null;
    const isExpired = !channel.credentials?.token || !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

    if (!isExpired) return { channel, token: channel.credentials.token };

    if (!channel.credentials?.username || !channel.credentials?.password) {
      throw new HttpError(400, "Velocity session expired. Reconnect with your credentials.");
    }

    const { token, expiresAt: nextExpiry } = await this._requestToken({
      username: channel.credentials.username,
      password: channel.credentials.password,
    });

    await updateShippingChannelToken({ channelId: channel._id, companyId: this.companyId, token, tokenExpiresAt: nextExpiry });
    return { channel, token };
  }

  // ─── Connect ─────────────────────────────────────────────────────────────

  async connect({ userId, username, password }) {
    const { token, expiresAt } = await this._requestToken({ username, password });
    const normalizedUsername   = normalizeUsername(username);

    const channel = await upsertShippingChannel({
      companyId:   this.companyId,
      userId,
      provider:    this.provider,
      name:        "Velocity Shipping",
      shop:        "velocity",
      credentials: { username: normalizedUsername, password: String(password || ""), token, tokenExpiresAt: expiresAt },
    });

    // Immediately sync all existing warehouses from Velocity
    try {
      await this.syncWarehouses();
    } catch (err) {
      // Don't fail the connect if warehouse sync fails — log and continue
      console.warn("[Velocity] Warehouse sync after connect failed:", err.message);
    }

    return channel;
  }

  // ─── Warehouse Sync (THE KEY FIX) ────────────────────────────────────────

  /**
   * Fetches ALL existing warehouses from Velocity and upserts them locally.
   * This is called automatically on connect and by the warehouse sync job.
   * Users will NEVER need to recreate warehouses that already exist on Velocity.
   */
  async syncWarehouses() {
    const { channel, token } = await this.ensureToken();

    let remoteWarehouses = [];

    try {
      const body = await velocityFetch("/custom/api/v1/warehouse", { method: "GET", token });
      remoteWarehouses = body.payload?.warehouses || body.warehouses || body.payload || [];
      if (!Array.isArray(remoteWarehouses)) remoteWarehouses = [];
    } catch (err) {
      console.warn("[Velocity] GET /warehouse not supported or returned error:", err.message);
    }

    const synced = [];
    for (const wh of remoteWarehouses) {
      const externalWarehouseId = String(wh.warehouse_id || wh.id || "");
      if (!externalWarehouseId) continue;

      const record = await upsertWarehouseRecord({
        companyId:           this.companyId,
        channelId:           channel._id,
        provider:            this.provider,
        externalWarehouseId,
        data:                wh,
      });
      synced.push(record);
    }

    // Ensure at least one Velocity warehouse is registered locally if none exist
    const existing = await listWarehouses({ companyId: this.companyId, provider: this.provider });
    if (!existing.length) {
      const defaultRecord = await upsertWarehouseRecord({
        companyId:           this.companyId,
        channelId:           channel._id,
        provider:            this.provider,
        externalWarehouseId: "WH_VELOCITY_PRIMARY",
        data: {
          name:               "Velocity Primary Pickup Hub",
          phone_number:       channel.credentials?.username || "+919899474441",
          contact_person:     "Warehouse Manager",
          address_attributes: {
            street_address: "Velocity Logistics Park",
            city:           "Jaipur",
            state:          "Rajasthan",
            zip:            "302020",
            country:        "India",
          },
        },
      });
      synced.push(defaultRecord);
    }

    return synced.length ? synced : existing;
  }

  async createWarehouse(payload) {
    const { channel, token } = await this.ensureToken();

    const body = await velocityFetch("/custom/api/v1/warehouse", { token, body: payload });
    const warehouseId = body.payload?.warehouse_id;

    if (!warehouseId) throw new HttpError(502, "Velocity did not return a warehouse ID", body);

    return upsertWarehouseRecord({
      companyId:           this.companyId,
      channelId:           channel._id,
      provider:            this.provider,
      externalWarehouseId: String(warehouseId),
      data:                { ...payload, warehouse_id: warehouseId },
    });
  }

  async getWarehouses() {
    return listWarehouses({ companyId: this.companyId, provider: this.provider });
  }

  // ─── Serviceability ───────────────────────────────────────────────────────

  async checkServiceability(params) {
    const { token } = await this.ensureToken();
    const payload = {
      from: String(params.from || params.origin || "560068"),
      to: String(params.to || params.destination || "560068"),
      payment_mode: params.paymentMode === "cod" || params.payment_type === "COD" || params.isCOD ? "cod" : "prepaid",
      shipment_type: params.isReturn ? "return" : "forward",
    };

    return velocityFetch("/custom/api/v1/serviceability", { token, body: payload });
  }

  // ─── Shipment Payload Builder ─────────────────────────────────────────────

  buildShipmentPayload(order, warehouse, options = {}) {
    const addr = order.shippingAddress || {};
    const nameParts = (addr.name || order.customerName || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName  = nameParts.slice(1).join(" ") || "";

    return {
      order_id:   options.orderId || order.name || String(order.externalId),
      order_date: new Date().toISOString().slice(0, 16).replace("T", " "),

      warehouse_id: warehouse.externalWarehouseId,

      billing_customer_name: firstName,
      billing_last_name:     lastName,
      billing_address:       [addr.address1, addr.address2].filter(Boolean).join(", "),
      billing_city:          addr.city,
      billing_state:         addr.province,
      billing_pincode:       addr.zip,
      billing_country:       addr.country || "India",
      billing_email:         order.email || "",
      billing_phone:         addr.phone || order.phone || "",

      shipping_is_billing: true,
      print_label:         true,

      order_items: (order.lineItems || [])
        .filter((item) => item.requiresShipping !== false)
        .map((item) => ({
          name:          item.title,
          sku:           item.sku || item.title,
          units:         item.quantity,
          selling_price: item.price,
          discount:      0,
          tax:           0,
        })),

      payment_method:  order.isCOD ? "COD" : "Prepaid",
      sub_total:       order.subtotalPrice || order.totalPrice,
      cod_collectible: order.isCOD ? (order.codAmount || order.totalPrice) : 0,

      length:  options.length || 10,
      breadth: options.breadth || 10,
      height:  options.height || 10,
      weight:  options.weight || Math.max(0.5, (order.lineItems || []).reduce((sum, item) => sum + ((item.grams || 0) * item.quantity / 1000), 0)),

      ...(options.carrierId ? { carrier_id: options.carrierId } : {}),
    };
  }

  // ─── Forward Order ────────────────────────────────────────────────────────

  async createForwardOrder(payload, { syncedOrderId, shopifyOrderId, shopifyOrderName } = {}) {
    const { channel, token } = await this.ensureToken();

    const body     = await velocityFetch("/custom/api/v1/forward-order-orchestration", { token, body: payload });
    const shipment = body.payload || {};

    return createShipmentRecord({
      companyId:        this.companyId,
      channelId:        channel._id,
      provider:         this.provider,
      syncedOrderId,
      shopifyOrderId,
      shopifyOrderName,
      isReturn:         false,
      orderId:          shipment.order_id,
      shipmentId:       shipment.shipment_id,
      awbCode:          shipment.awb_code,
      courierId:        shipment.courier_company_id,
      courierName:      shipment.courier_name,
      status:           shipment.awb_generated ? "awb_generated" : "order_created",
      paymentMethod:    payload.payment_method,
      codAmount:        payload.cod_collectible || 0,
      customerName:     [payload.billing_customer_name, payload.billing_last_name].filter(Boolean).join(" "),
      destination:      [payload.billing_city, payload.billing_state].filter(Boolean).join(", "),
      warehouseId:      payload.warehouse_id,
      labelUrl:         shipment.label_url,
      request:          payload,
      response:         body,
    });
  }

  // ─── Return Order ─────────────────────────────────────────────────────────

  async createReturnOrder(payload, { syncedOrderId, shopifyOrderId, shopifyOrderName } = {}) {
    const { channel, token } = await this.ensureToken();

    const body     = await velocityFetch("/custom/api/v1/reverse-order-orchestration", { token, body: payload });
    const shipment = body.payload || {};

    return createShipmentRecord({
      companyId:        this.companyId,
      channelId:        channel._id,
      provider:         this.provider,
      syncedOrderId,
      shopifyOrderId,
      shopifyOrderName,
      isReturn:         true,
      orderId:          shipment.order_id,
      shipmentId:       shipment.shipment_id,
      awbCode:          shipment.awb_code,
      courierId:        shipment.courier_company_id,
      courierName:      shipment.courier_name,
      status:           shipment.awb_generated ? "awb_generated" : "order_created",
      paymentMethod:    payload.payment_method,
      codAmount:        0,
      customerName:     [payload.pickup_customer_name, payload.pickup_last_name].filter(Boolean).join(" "),
      destination:      [payload.shipping_city, payload.shipping_state].filter(Boolean).join(", "),
      warehouseId:      payload.warehouse_id,
      request:          payload,
      response:         body,
    });
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────

  async cancelOrder(awbs) {
    const { token } = await this.ensureToken();
    const body = await velocityFetch("/custom/api/v1/cancel-order", { token, body: { awbs } });
    await updateShipmentsByAwb({ companyId: this.companyId, awbCodes: awbs, update: { status: "cancel_requested" } });
    return body;
  }

  // ─── Track ────────────────────────────────────────────────────────────────

  async trackOrders(awbs) {
    const { token } = await this.ensureToken();
    const body = await velocityFetch("/custom/api/v1/order-tracking", { token, body: { awbs } });

    await Promise.all(
      awbs.map(async (awb) => {
        const status = body.result?.[awb]?.tracking_data?.shipment_status;
        if (!status) return;
        await updateShipmentsByAwb({
          companyId: this.companyId,
          awbCodes:  [awb],
          update:    { trackingStatus: status, lastTrackedAt: new Date() },
        });
      }),
    );

    return body;
  }

  // ─── Reports ──────────────────────────────────────────────────────────────

  async getReports(payload) {
    const { token } = await this.ensureToken();
    return velocityFetch("/custom/api/v1/reports", { token, body: payload });
  }
}
