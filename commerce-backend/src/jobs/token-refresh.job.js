import { isMongoConnected } from "../config/database.js";
import { Channel } from "../models/channel.model.js";
import { memory } from "../repositories/memory-store.js";
import { getShippingProvider } from "../modules/shipping/shipping-registry.js";

/**
 * Periodically verifies auth token expiration for shipping channels
 * and proactively refreshes expiring tokens before API requests fail.
 */
export async function runTokenRefreshJob() {
  console.log("[Job] Running proactive token refresh check...");

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
        await provider.ensureToken();
      } catch (err) {
        console.warn(`[Job] Token refresh check failed for ${channel.provider} (Company: ${channel.companyId}):`, err.message);
      }
    }
  } catch (error) {
    console.error("[Job] Token refresh job error:", error);
  }
}
