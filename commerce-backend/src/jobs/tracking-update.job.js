import { isMongoConnected } from "../config/database.js";
import { Shipment } from "../models/shipment.model.js";
import { memory, clone } from "../repositories/memory-store.js";
import { getShippingProvider } from "../modules/shipping/shipping-registry.js";
import { syncShipmentCancelledElsewhere } from "../modules/fulfillment/fulfillment.service.js";

// A courier reporting any of these tracking states means the shipment is
// dead and the order needs to come back to "To Ship" — cancelled directly
// on the courier's own dashboard, an RTO that got written off, etc. Matched
// as a substring against whatever string the provider returns, since each
// courier phrases this slightly differently ("cancelled", "CANCELLED_BY_...",
// "shipment cancelled").
const DEAD_STATUS_PATTERN = /cancel/i;

/**
 * Periodically polls tracking status for all active/in-transit shipments
 * and updates local shipment records. Also catches shipments cancelled
 * directly on the courier's own dashboard (bypassing our Cancel Shipment
 * button entirely) and syncs that back — without this, an order stays
 * stuck showing an AWB that no longer exists on the courier's side, with
 * no way to reship it short of manually editing the database.
 */
export async function runTrackingUpdateJob() {
  console.log("[Job] Starting background tracking update...");

  try {
    const activeStatuses = ["awb_generated", "picked_up", "in_transit", "out_for_delivery"];
    let shipments = [];

    if (isMongoConnected()) {
      shipments = await Shipment.find({ status: { $in: activeStatuses }, awbCode: { $exists: true, $ne: "" } }).lean();
    } else {
      shipments = [...memory.shipments.values()].filter((s) => activeStatuses.includes(s.status) && s.awbCode);
    }

    if (!shipments.length) return;

    // Group shipments by companyId and provider
    const grouped = new Map();
    for (const s of shipments) {
      const key = `${s.companyId}:${s.provider}`;
      if (!grouped.has(key)) grouped.set(key, { companyId: s.companyId, providerName: s.provider, awbs: [] });
      grouped.get(key).awbs.push(s.awbCode);
    }

    for (const { companyId, providerName, awbs } of grouped.values()) {
      try {
        const provider = getShippingProvider(providerName, { companyId });
        await provider.trackOrders(awbs);
        console.log(`[Job] Updated tracking for ${awbs.length} ${providerName} shipments (Company: ${companyId})`);

        // Re-read what trackOrders() just wrote and act on anything that
        // now reads as cancelled/dead on the courier's side.
        const updated = isMongoConnected()
          ? await Shipment.find({ companyId, provider: providerName, awbCode: { $in: awbs } }).lean()
          : [...memory.shipments.values()].filter((s) => String(s.companyId) === String(companyId) && s.provider === providerName && awbs.includes(s.awbCode)).map(clone);

        for (const s of updated) {
          if (s.status === "cancelled") continue;
          if (!s.trackingStatus || !DEAD_STATUS_PATTERN.test(s.trackingStatus)) continue;
          try {
            await syncShipmentCancelledElsewhere({ companyId, shipment: s });
          } catch (err) {
            console.error(`[Job] Failed to sync cancelled shipment ${s.awbCode} (${providerName}, Company: ${companyId}):`, err.message);
          }
        }
      } catch (err) {
        console.error(`[Job] Tracking update failed for ${providerName} (Company: ${companyId}):`, err.message);
      }
    }
  } catch (error) {
    console.error("[Job] Tracking update job error:", error);
  }
}
