import {
  createShipmentRecord,
  createWarehouseRecord,
  getVelocityChannel,
  listShipments,
  listWarehouses,
  updateShipmentsByAwb,
  updateVelocityToken,
  upsertVelocityChannel,
} from "../../repositories/store.js";
import { HttpError } from "../../utils/http-error.js";

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
    throw new HttpError(response.status || 502, responseBody?.message || "Velocity Shipping request failed", responseBody);
  }

  return responseBody;
}

async function requestVelocityToken({ username, password }) {
  const body = await velocityFetch("/custom/api/v1/auth-token", {
    body: { username: normalizeUsername(username), password: String(password || "") },
  });

  if (!body.token) {
    throw new HttpError(401, "Velocity Shipping authentication failed", body);
  }

  return { token: body.token, expiresAt: body.expires_at ? new Date(body.expires_at) : new Date(Date.now() + 23 * 60 * 60 * 1000) };
}

export async function connectVelocity({ companyId, userId, username, password }) {
  const { token, expiresAt } = await requestVelocityToken({ username, password });

  return upsertVelocityChannel({
    companyId,
    userId,
    username: normalizeUsername(username),
    password: String(password || ""),
    token,
    tokenExpiresAt: expiresAt,
  });
}

function requireVelocityChannel(channel) {
  if (!channel) {
    throw new HttpError(400, "Connect Velocity Shipping first");
  }
}

async function ensureVelocityToken(companyId) {
  const channel = await getVelocityChannel(companyId);
  requireVelocityChannel(channel);

  const expiresAt = channel.credentials?.tokenExpiresAt ? new Date(channel.credentials.tokenExpiresAt) : null;
  const isExpired = !channel.credentials?.token || !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

  if (!isExpired) {
    return { channel, token: channel.credentials.token };
  }

  if (!channel.credentials?.username || !channel.credentials?.password) {
    throw new HttpError(400, "Velocity Shipping session expired. Reconnect with your username and password.");
  }

  const { token, expiresAt: nextExpiresAt } = await requestVelocityToken({
    username: channel.credentials.username,
    password: channel.credentials.password,
  });

  await updateVelocityToken({ channelId: channel._id, companyId, token, tokenExpiresAt: nextExpiresAt });

  return { channel, token };
}

export async function createVelocityWarehouse({ companyId, payload }) {
  const { token } = await ensureVelocityToken(companyId);
  const channel = await getVelocityChannel(companyId);

  const body = await velocityFetch("/custom/api/v1/warehouse", { token, body: payload });
  const warehouseId = body.payload?.warehouse_id;

  if (!warehouseId) {
    throw new HttpError(502, "Velocity Shipping did not return a warehouse id", body);
  }

  return createWarehouseRecord({ companyId, channelId: channel._id, warehouseId, payload });
}

export async function fetchWarehouses(companyId) {
  return listWarehouses({ companyId });
}

export async function checkVelocityServiceability({ companyId, payload }) {
  const { token } = await ensureVelocityToken(companyId);

  return velocityFetch("/custom/api/v1/serviceability", { token, body: payload });
}

export async function createVelocityForwardOrder({ companyId, payload }) {
  const { token, channel } = await ensureVelocityToken(companyId);

  const body = await velocityFetch("/custom/api/v1/forward-order-orchestration", { token, body: payload });
  const shipment = body.payload || {};

  return createShipmentRecord({
    companyId,
    channelId: channel._id,
    isReturn: false,
    orderId: shipment.order_id,
    shipmentId: shipment.shipment_id,
    awbCode: shipment.awb_code,
    courierId: shipment.courier_company_id,
    courierName: shipment.courier_name,
    status: shipment.awb_generated ? "awb_generated" : "order_created",
    paymentMethod: payload.payment_method,
    codAmount: payload.cod_collectible || 0,
    customerName: [payload.billing_customer_name, payload.billing_last_name].filter(Boolean).join(" "),
    destination: [payload.billing_city, payload.billing_state].filter(Boolean).join(", "),
    warehouseId: payload.warehouse_id,
    labelUrl: shipment.label_url,
    request: payload,
    response: body,
  });
}

export async function createVelocityReverseOrder({ companyId, payload }) {
  const { token, channel } = await ensureVelocityToken(companyId);

  const body = await velocityFetch("/custom/api/v1/reverse-order-orchestration", { token, body: payload });
  const shipment = body.payload || {};

  return createShipmentRecord({
    companyId,
    channelId: channel._id,
    isReturn: true,
    orderId: shipment.order_id,
    shipmentId: shipment.shipment_id,
    awbCode: shipment.awb_code,
    courierId: shipment.courier_company_id,
    courierName: shipment.courier_name,
    status: shipment.awb_generated ? "awb_generated" : "order_created",
    paymentMethod: payload.payment_method,
    codAmount: 0,
    customerName: [payload.pickup_customer_name, payload.pickup_last_name].filter(Boolean).join(" "),
    destination: [payload.shipping_city, payload.shipping_state].filter(Boolean).join(", "),
    warehouseId: payload.warehouse_id,
    request: payload,
    response: body,
  });
}

export async function cancelVelocityOrder({ companyId, awbs }) {
  const { token } = await ensureVelocityToken(companyId);

  const body = await velocityFetch("/custom/api/v1/cancel-order", { token, body: { awbs } });
  await updateShipmentsByAwb({ companyId, awbCodes: awbs, update: { status: "cancel_requested" } });

  return body;
}

export async function trackVelocityOrder({ companyId, awbs }) {
  const { token } = await ensureVelocityToken(companyId);

  const body = await velocityFetch("/custom/api/v1/order-tracking", { token, body: { awbs } });

  await Promise.all(
    awbs.map(async (awb) => {
      const status = body.result?.[awb]?.tracking_data?.shipment_status;
      if (!status) return;

      await updateShipmentsByAwb({
        companyId,
        awbCodes: [awb],
        update: { trackingStatus: status, lastTrackedAt: new Date() },
      });
    }),
  );

  return body;
}

export async function getVelocityReports({ companyId, payload }) {
  const { token } = await ensureVelocityToken(companyId);

  return velocityFetch("/custom/api/v1/reports", { token, body: payload });
}

export async function fetchShipments(companyId) {
  return listShipments({ companyId });
}
