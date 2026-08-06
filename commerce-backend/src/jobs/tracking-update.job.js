import { isMongoConnected } from "../config/database.js";
import { Shipment } from "../models/shipment.model.js";
import { memory } from "../repositories/memory-store.js";
import { getShippingProvider } from "../modules/shipping/shipping-registry.js";

/**
 * Periodically polls tracking status for all active/in-transit shipments
 * and updates local shipment records.
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
      } catch (err) {
        console.error(`[Job] Tracking update failed for ${providerName} (Company: ${companyId}):`, err.message);
      }
    }
  } catch (error) {
    console.error("[Job] Tracking update job error:", error);
  }
}
