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
import { createShipmentRecord, updateShipmentsByAwb, getShipmentByOrder, updateShipmentById } from "../../../repositories/shipment.repo.js";

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
   * Velocity's API has no "list warehouses" endpoint — GET /custom/api/v1/warehouse
   * 404s (verified live against a real connected account), it only accepts POST
   * for creating a brand-new one. So this can only pick up warehouses *we*
   * created through createWarehouse() below; it can never see warehouses the
   * user set up directly on Velocity's own dashboard. For those, use
   * linkExistingWarehouse() with the Warehouse ID shown on their dashboard.
   *
   * Earlier versions of this fabricated a fake "Velocity Primary Pickup Hub"
   * default whenever nothing was synced yet — that ID doesn't exist on
   * Velocity's side and every shipment against it failed with "Warehouse not
   * found". Removed: an empty list here is the honest result.
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

    return synced.length ? synced : listWarehouses({ companyId: this.companyId, provider: this.provider });
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

  /**
   * Registers a warehouse the user already created on Velocity's own
   * dashboard (they copy its Warehouse ID, e.g. "WHCOPY", from there since
   * there's no API to look it up). No Velocity call — the ID is trusted as
   * given, exactly like Shipway/Delhivery's manual-mapping fallback.
   */
  async linkExistingWarehouse(payload) {
    const { channel } = await this.ensureToken();
    const externalWarehouseId = String(payload.externalWarehouseId || payload.warehouseId || "").trim();
    if (!externalWarehouseId) throw new HttpError(400, "Warehouse ID is required");
    if (!payload.name) throw new HttpError(400, "Warehouse name is required");

    return upsertWarehouseRecord({
      companyId:           this.companyId,
      channelId:           channel._id,
      provider:            this.provider,
      externalWarehouseId,
      data: {
        name:               payload.name,
        phone_number:       payload.phone,
        contact_person:     payload.contactPerson || payload.name,
        email:              payload.email,
        address_attributes: {
          street_address: payload.address,
          city:           payload.city,
          state:          payload.state,
          zip:            payload.zip,
          country:        payload.country || "India",
        },
      },
    });
  }

  async getWarehouses() {
    return listWarehouses({ companyId: this.companyId, provider: this.provider });
  }

  // ─── Serviceability + rates ───────────────────────────────────────────────
  // /serviceability lists which couriers cover a route but returns NO pricing
  // at all — the frontend used to fill that gap by inventing a price per
  // courier name ("Delhivery" +18, "air" +32, etc — completely made up). The
  // real pricing lives on a separate endpoint, /rates, discovered by probing
  // this account directly since it's undocumented publicly: it wants
  // journey_type/origin_pincode/destination_pincode/dead_weight/length/width/
  // height/payment_method, and (COD only) shipment_value. Verified live
  // against a real connected account — e.g. "Delhivery Standard 250G" came
  // back with charges.total_forward_charges: 70, a real number, not a guess.
  async checkServiceability(params) {
    const { token } = await this.ensureToken();
    const isCod = params.paymentMode === "cod" || params.payment_type === "COD" || params.isCOD;
    const weightKg = Math.max(0.1, Number(params.weight) || 0.5);

    const payload = {
      journey_type: params.isReturn ? "return" : "forward",
      origin_pincode: String(params.from || params.origin || "560068"),
      destination_pincode: String(params.to || params.destination || "560068"),
      dead_weight: weightKg,
      length: Number(params.length) || 10,
      width: Number(params.breadth || params.width) || 10,
      height: Number(params.height) || 10,
      payment_method: isCod ? "cod" : "prepaid",
      ...(isCod ? { cod_amount: Number(params.codAmount) || 0, shipment_value: Number(params.codAmount) || Number(params.shipmentValue) || 1 } : {}),
    };

    const body = await velocityFetch("/custom/api/v1/rates", { token, body: payload });
    const couriers = body?.result?.serviceable_couriers || [];

    return {
      status: body.status,
      courier_companies: couriers.map((c) => ({
        id: c.carrier_id,
        courier_name: c.carrier_name,
        rate: Number(c.charges?.total_forward_charges ?? 0),
        etd: c.expected_delivery?.delivery?.human_readable || "",
        mode: c.service_level,
      })),
    };
  }

  // ─── Shipment Payload Builder ─────────────────────────────────────────────

  buildShipmentPayload(order, warehouse, options = {}) {
    const addr = order.shippingAddress || {};
    const nameParts = (addr.name || order.customerName || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName  = nameParts.slice(1).join(" ") || "";

    // Velocity has its own separate Shopify app connected on the user's
    // store, so it auto-imports every Shopify order independently of us —
    // by the time we call this, Velocity may already hold the order under
    // its own record. We used to send Shopify's display name ("#SM1050")
    // as order_id, which doesn't match what Velocity's own Shopify sync
    // stored, so their orchestration engine treated it as a brand-new order
    // and choked (ALL_CARRIERS_FAILED / S-900) instead of reusing the real
    // one. Fix: for Shopify-sourced orders, key off the raw numeric Shopify
    // order ID (order.externalId, e.g. "9035581817138") — that's the one
    // globally-unique value both systems get from the same Shopify webhook/
    // API, so it's what any correctly-built Shopify integration should be
    // matching orders on. Only orders NOT sourced from Shopify (manually
    // created in-panel, Amazon-imported, etc.) — which Velocity could never
    // have pre-fetched — fall back to generating a fresh order_id.
    const orderId = options.orderId
      || (order.provider === "shopify" ? String(order.externalId) : (order.name || String(order.externalId)));

    return {
      order_id:   orderId,
      order_date: new Date().toISOString().slice(0, 16).replace("T", " "),

      warehouse_id: warehouse.externalWarehouseId,
      // Required per Velocity's docs alongside warehouse_id (their "Pickup
      // Location Name") — was missing entirely before, which their forward-
      // order-orchestration endpoint apparently tolerated but isn't
      // documented as optional.
      pickup_location: warehouse.name || warehouse.externalWarehouseId,

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

      // Docs specify the enum as exactly COD / PREPAID (uppercase) — this
      // sent "Prepaid" (mixed case) before, which didn't match the
      // documented value.
      payment_method:  order.isCOD ? "COD" : "PREPAID",
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

    // Recover from a partial earlier attempt on OUR side: if a shipment
    // record already exists for this order with a Velocity shipment_id but
    // no AWB yet (order got created there but courier assignment didn't
    // complete — network blip, a picked carrier going out of service, etc),
    // finish it via the documented two-step "assign courier to an existing
    // shipment" endpoint instead of re-submitting "create order", which
    // Velocity correctly rejects as a duplicate.
    const existing = await getShipmentByOrder({ companyId: this.companyId, provider: this.provider, syncedOrderId, shopifyOrderId });
    if (existing?.shipmentId && !existing.awbCode) {
      const body = await velocityFetch("/custom/api/v1/forward-order-shipment", {
        token,
        body: { shipment_id: existing.shipmentId, ...(payload.carrier_id ? { carrier_id: payload.carrier_id } : {}) },
      });
      const shipment = body.payload || {};
      return updateShipmentById({
        shipmentId: existing._id,
        companyId:  this.companyId,
        update: {
          orderId:     shipment.order_id || existing.orderId,
          awbCode:     shipment.awb_code,
          courierId:   shipment.courier_company_id,
          courierName: shipment.courier_name,
          status:      shipment.awb_generated ? "awb_generated" : "order_created",
          labelUrl:    shipment.label_url,
          response:    body,
        },
      });
    }

    let body;
    try {
      body = await velocityFetch("/custom/api/v1/forward-order-orchestration", { token, body: payload });
    } catch (err) {
      const veloMessage = err.details?.meta?.message || err.details?.message || "";
      if (!/order already exists/i.test(veloMessage)) throw err;

      // Velocity refuses to re-create an order_id it already holds — and
      // confirmed by testing, that reservation is PERMANENT: cancelling the
      // order on Velocity's own dashboard does not free the order_id back
      // up, so a retry with the same ID keeps failing forever. Since their
      // API has no "look up an existing order" endpoint at all (checked —
      // not in their docs), there's no way to attach a courier to whatever
      // is sitting under that ID anyway; matching it only mattered if we
      // could act on the match, which we can't. So: retry once with a
      // de-duplicated order_id instead of dead-ending here. This does mean
      // Velocity ends up with two order records if the original really did
      // come from a separate Shopify auto-import — but a shippable
      // duplicate beats a shipment that can never go out.
      const retryPayload = { ...payload, order_id: `${payload.order_id}-R${Date.now().toString(36).slice(-5)}` };
      try {
        body = await velocityFetch("/custom/api/v1/forward-order-orchestration", { token, body: retryPayload });
        payload = retryPayload;
      } catch (retryErr) {
        throw new HttpError(
          409,
          `Velocity already has an order with ID "${payload.order_id}" and won't free it even after cancellation — a retry with a new ID also failed (${retryErr.message}). This usually means a separate Shopify app is connected directly on your Velocity dashboard, still auto-importing this order. Check Settings → Channels there and disconnect it so every shipment routes through this panel instead.`,
          retryErr.details,
        );
      }
    }
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
