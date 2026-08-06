import { isMongoConnected } from "../config/database.js";
import { Channel } from "../models/channel.model.js";
import { memory } from "../repositories/memory-store.js";
import { getShippingProvider } from "../modules/shipping/shipping-registry.js";

/**
 * Periodically syncs pickup warehouses across all connected shipping channels
 * to ensure local database is always up to date with provider dashboard.
 */
export async function runWarehouseSyncJob() {
  console.log("[Job] Starting background warehouse synchronization...");

  try {
    let shippingChannels = [];

    if (isMongoConnected()) {
      shippingChannels = await Channel.find({ channelType: "shipping", status: "connected" }).lean();
    } else {
      shippingChannels = [...memory.channels.values()].filter((ch) => ch.channelType === "shipping" && ch.status === "connected");
    }

    for (const channel of shippingChannels) {
      try {
        const provider = getShippingProvider(channel.provider, { companyId: channel.companyId });
        const warehouses = await provider.syncWarehouses();
        console.log(`[Job] Synced ${warehouses.length} warehouses for ${channel.provider} (Company: ${channel.companyId})`);
      } catch (err) {
        console.error(`[Job] Warehouse sync failed for ${channel.provider} (Company: ${channel.companyId}):`, err.message);
      }
    }
  } catch (error) {
    console.error("[Job] Warehouse sync job error:", error);
  }
}
