import { isMongoConnected } from "../config/database.js";
import { Channel } from "../models/channel.model.js";
import { memory } from "../repositories/memory-store.js";
import { syncAdInsights } from "../modules/ads/meta.service.js";

/**
 * Daily fallback sync for connected Meta Ads channels (spend + attribution).
 */
export async function runMetaAdsSyncJob() {
  console.log("[Job] Running background Meta Ads sync...");

  try {
    let metaChannels = [];

    if (isMongoConnected()) {
      metaChannels = await Channel.find({ provider: "meta", status: "connected" }).lean();
    } else {
      metaChannels = [...memory.channels.values()].filter((ch) => ch.provider === "meta" && ch.status === "connected");
    }

    for (const channel of metaChannels) {
      if (!channel.external?.adAccountId) continue;

      try {
        await syncAdInsights({ companyId: channel.companyId, channelId: channel._id || channel.id, days: 7 });
        console.log(`[Job] Synced Meta Ads insights for channel: ${channel._id || channel.id}`);
      } catch (err) {
        console.error(`[Job] Meta Ads sync failed for channel ${channel._id || channel.id}:`, err.message);
      }
    }
  } catch (error) {
    console.error("[Job] Meta Ads sync job error:", error);
  }
}
