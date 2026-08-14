import { BaseShippingProvider } from "./base.provider.js";
import { HttpError } from "../../../utils/http-error.js";
import {
  getShippingChannel,
  upsertShippingChannel,
} from "../../../repositories/channel.repo.js";
import { upsertWarehouseRecord, listWarehouses } from "../../../repositories/warehouse.repo.js";
import { createShipmentRecord, updateShipmentsByAwb } from "../../../repositories/shipment.repo.js";

// Sourced from Delhivery's public Last-Mile API docs
// (delhivery-express-api-doc.readme.io) on 2026-08-14. One detail their docs
// don't state explicitly: the exact Authorization header format. Delhivery
// has used `Authorization: Token <api_key>` consistently across every public
// integration guide/SDK for years, so that's what's implemented — if a brand's
// token gets a 401 on first call, that header is the first thing to check.
const BASE_URL = "https://track.delhivery.com";

async function delhiveryFetch(path, { method = "GET", token, body, form } = {}) {
  const headers = {
    Authorization: `Token ${token}`,
    Accept: "application/json",
  };

  let requestBody;
  if (form) {
    // Delhivery's order-creation API is a legacy endpoint that expects
    // application/x-www-form-urlencoded with the actual payload JSON-stringified
    // inside a "data" field — not a plain JSON body. This is a well-documented
    // quirk of their API, not a mistake.
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    requestBody = new URLSearchParams(form).toString();
  } else if (body) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, { method, headers, body: requestBody });
  const text = await response.text();
  let responseBody;
  try {
    responseBody = JSON.parse(text);
  } catch {
    responseBody = { raw: text };
  }

  if (!response.ok) {
    throw new HttpError(response.status || 502, responseBody?.rmk || responseBody?.message || "Delhivery request failed", responseBody);
  }

  return responseBody;
}

// Delhivery invoices freight + 18% GST on the shipping charge, same as every
// courier in India — total_amount in their rate-calculator response is
// already this GST-inclusive figure (gross_amount is pre-tax). Exposed so the
// GST-inclusive multi-provider rate comparison (webhook.service equivalent
// for shipping) doesn't have to guess this provider's tax treatment.
export const DELHIVERY_GST_RATE = 0.18;

export class DelhiveryProvider extends BaseShippingProvider {
  constructor({ companyId }) {
    super({ companyId });
    this.provider = "delhivery";
  }

  // ─── Auth ────────────────────────────────────────────────────────────────

  async ensureToken() {
    const channel = await getShippingChannel({ companyId: this.companyId, provider: this.provider });
    if (!channel) throw new HttpError(400, "Connect Delhivery first");
    const token = channel.credentials?.apiKey;
    if (!token) throw new HttpError(400, "Delhivery API token missing. Reconnect with your token.");
    return { channel, token };
  }

  // ─── Connect ─────────────────────────────────────────────────────────────
  // Every brand pastes their OWN Delhivery API token (One Delhivery →
  // Developer Portal → API Token) — no shared account, same self-service
  // pattern as every other per-brand integration in this app.

  async connect({ userId, apiToken, clientName }) {
    const token = String(apiToken || "").trim();
    if (!token) throw new HttpError(400, "Delhivery API token is required");

    // Cheapest possible call to confirm the token actually works before saving
    // it — a bad token should fail loudly here, not silently on first shipment.
    await delhiveryFetch("/c/api/pin-codes/json/?filter_codes=110001", { token });

    const channel = await upsertShippingChannel({
      companyId: this.companyId,
      userId,
      provider: this.provider,
      name: "Delhivery",
      shop: "delhivery",
      credentials: { apiKey: token },
      external: { companyName: clientName || "" },
    });

    try {
      await this.syncWarehouses();
    } catch (err) {
      console.warn("[Delhivery] Warehouse sync after connect failed:", err.message);
    }

    return channel;
  }

  // ─── Warehouses ──────────────────────────────────────────────────────────
  // Delhivery's docs don't expose a "list my pickup locations" endpoint (new
  // ones are created via clientwarehouse/create/, or by their FMS team) — so
  // there's nothing to pull on connect. Returns whatever's already registered
  // locally; createWarehouse() below is the real way to add one.

  async syncWarehouses() {
    return listWarehouses({ companyId: this.companyId, provider: this.provider });
  }

  async createWarehouse(payload) {
    const { channel, token } = await this.ensureToken();

    const body = {
      name: payload.name,
      email: payload.email || "",
      phone: payload.phone || payload.phone_number || "",
      address: payload.address || payload.street_address || "",
      pin: String(payload.pin || payload.zip || payload.pincode || ""),
      city: payload.city || "",
      state: payload.state || "",
      country: payload.country || "India",
      registered_name: payload.registered_name || channel.external?.companyName || payload.name,
      return_address: payload.return_address || payload.address || payload.street_address || "",
    };

    const result = await delhiveryFetch("/api/backend/clientwarehouse/create/", { method: "POST", token, body });

    // Delhivery echoes the submitted fields back on success rather than minting
    // a separate numeric ID — the pickup_location on every shipment is this name.
    const externalWarehouseId = body.name;

    return upsertWarehouseRecord({
      companyId: this.companyId,
      channelId: channel._id,
      provider: this.provider,
      externalWarehouseId,
      data: {
        name: body.name,
        phone_number: body.phone,
        email: body.email,
        contact_person: body.registered_name,
        address_attributes: {
          street_address: body.address,
          city: body.city,
          state: body.state,
          zip: body.pin,
          country: body.country,
        },
        raw: result,
      },
    });
  }

  // ─── Serviceability + rate ───────────────────────────────────────────────

  async checkServiceability({ from, to, weight, paymentMode, codAmount }) {
    const { token } = await this.ensureToken();
    const destPin = String(to || "");

    const serviceability = await delhiveryFetch(`/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(destPin)}`, { token });
    const pinData = serviceability?.delivery_codes?.[0]?.postal_code;
    const isServiceable = Boolean(pinData) && pinData.pre_paid !== "N";

    if (!isServiceable) {
      // Genuine "no coverage" from Delhivery's own API (delivery_codes: []
      // for this pincode), not a bug — not every provider covers every
      // pincode. Distinguishing this from a real request failure so the UI
      // can say why, instead of a bare empty list.
      return {
        serviceable: false,
        pincode: destPin,
        reason: `Delhivery has no service coverage for pincode ${destPin} on this account.`,
        courier_companies: [],
      };
    }

    const weightGrams = Math.max(1, Math.round((Number(weight) || 0.5) * 1000));
    const isCod = paymentMode === "cod" || paymentMode === "COD";
    const params = new URLSearchParams({
      md: "E",
      ss: "Delivered",
      d_pin: destPin,
      o_pin: String(from || ""),
      cgm: String(weightGrams),
      pt: isCod ? "COD" : "Pre-paid",
      ...(isCod && codAmount ? { cod: String(codAmount) } : {}),
    });

    const rate = await delhiveryFetch(`/api/kinko/v1/invoice/charges/.json?${params.toString()}`, { token });
    // Delhivery's own total_amount is already gross_amount + tax — i.e. GST-inclusive.
    const entry = Array.isArray(rate) ? rate[0] : rate;
    const gstInclusive = Number(entry?.total_amount ?? 0);
    const preGst = Number(entry?.gross_amount ?? gstInclusive / (1 + DELHIVERY_GST_RATE));

    return {
      serviceable: true,
      pincode: destPin,
      courier_companies: [
        {
          id: "delhivery_surface",
          courier_name: "Delhivery",
          rate: Math.round(gstInclusive * 100) / 100,
          rate_pre_gst: Math.round(preGst * 100) / 100,
          gst_amount: Math.round((gstInclusive - preGst) * 100) / 100,
          etd: pinData?.district || "2-6 Days",
          cod_available: pinData?.cod === "Y",
          prepaid_available: pinData?.pre_paid === "Y",
        },
      ],
    };
  }

  // ─── Shipment payload builder ────────────────────────────────────────────

  buildShipmentPayload(order, warehouse, options = {}) {
    const addr = order.shippingAddress || {};

    return {
      order: options.orderId || order.name || String(order.externalId),
      shipment_type: "SINGLE_PIECE",
      payment_mode: order.isCOD ? "COD" : "Prepaid",
      cod_amount: order.isCOD ? String(options.codAmount || order.codAmount || order.totalPrice || 0) : undefined,
      pickup_location: warehouse.externalWarehouseId,
      seller_gst_tin: options.sellerGstin || "",

      consignee: {
        name: addr.name || order.customerName || "Customer",
        add: [addr.address1, addr.address2].filter(Boolean).join(", "),
        pin: String(addr.zip || ""),
        city: addr.city || "",
        state: addr.province || "",
        country: addr.country || "India",
        phone: addr.phone || order.phone || "",
      },

      products: (order.lineItems || [])
        .filter((item) => item.requiresShipping !== false)
        .map((item) => ({
          name: item.title,
          hsn_code: item.hsnCode || "",
          quantity: String(item.quantity || 1),
        })),

      weight: String(Math.max(0.5, options.weight || (order.lineItems || []).reduce((sum, item) => sum + ((item.grams || 0) * item.quantity / 1000), 0))),
      shipment_length: String(options.length || 10),
      shipment_width: String(options.breadth || 10),
      shipment_height: String(options.height || 10),

      invoice_reference: order.name || String(order.externalId),
    };
  }

  // ─── Forward order ────────────────────────────────────────────────────────

  async createForwardOrder(payload, { syncedOrderId, shopifyOrderId, shopifyOrderName } = {}) {
    const { channel, token } = await this.ensureToken();

    const body = await delhiveryFetch("/api/cmu/create.json", {
      method: "POST",
      token,
      form: { format: "json", data: JSON.stringify({ shipments: [payload], pickup_location: { name: payload.pickup_location } }) },
    });

    const packageResult = body?.packages?.[0] || {};
    if (body?.success === false && !packageResult.waybill) {
      throw new HttpError(502, packageResult.remarks?.join?.(", ") || "Delhivery did not create the shipment", body);
    }

    return createShipmentRecord({
      companyId: this.companyId,
      channelId: channel._id,
      provider: this.provider,
      syncedOrderId,
      shopifyOrderId,
      shopifyOrderName,
      isReturn: false,
      orderId: payload.order,
      shipmentId: packageResult.refnum || payload.order,
      awbCode: packageResult.waybill || "",
      courierName: "Delhivery",
      status: packageResult.waybill ? "awb_generated" : "order_created",
      paymentMethod: payload.payment_mode,
      codAmount: Number(payload.cod_amount) || 0,
      customerName: payload.consignee?.name,
      destination: [payload.consignee?.city, payload.consignee?.state].filter(Boolean).join(", "),
      warehouseId: payload.pickup_location,
      request: payload,
      response: body,
    });
  }

  // Delhivery's reverse-pickup flow uses the same create endpoint with
  // payment_mode: "Pickup" per their docs, rather than a separate API.
  async createReturnOrder(payload, { syncedOrderId, shopifyOrderId, shopifyOrderName } = {}) {
    return this.createForwardOrder(
      { ...payload, payment_mode: "Pickup", cod_amount: undefined },
      { syncedOrderId, shopifyOrderId, shopifyOrderName },
    );
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────
  // Delhivery's cancel API takes one waybill per call (no documented batch
  // form), unlike Velocity/Shipway — looped here so the caller's interface
  // still matches every other provider's cancelOrder(awbs[]) signature.

  async cancelOrder(awbs) {
    const { token } = await this.ensureToken();
    const results = [];

    for (const awb of awbs) {
      try {
        const body = await delhiveryFetch("/api/p/edit", { method: "POST", token, body: { waybill: awb, cancellation: "true" } });
        results.push({ awb, ...body });
      } catch (err) {
        results.push({ awb, error: err.message });
      }
    }

    await updateShipmentsByAwb({ companyId: this.companyId, awbCodes: awbs, update: { status: "cancel_requested" } });
    return { results };
  }

  // ─── Track ────────────────────────────────────────────────────────────────

  async trackOrders(awbs) {
    const { token } = await this.ensureToken();
    const body = await delhiveryFetch(`/api/v1/packages/json/?waybill=${encodeURIComponent(awbs.join(","))}`, { token });

    const shipments = body?.ShipmentData || body?.shipment_data || [];
    await Promise.all(
      shipments.map(async (entry) => {
        const shipment = entry?.Shipment || entry;
        const awb = shipment?.AWB || shipment?.awb;
        const status = shipment?.Status?.Status || shipment?.status;
        if (!awb || !status) return;
        await updateShipmentsByAwb({
          companyId: this.companyId,
          awbCodes: [awb],
          update: { trackingStatus: String(status), lastTrackedAt: new Date() },
        });
      }),
    );

    return body;
  }
}
