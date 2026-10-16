import { isMongoConnected } from "../config/database.js";
import { Channel } from "../models/channel.model.js";
import { memory } from "../repositories/memory-store.js";
import { syncShopifyData } from "../modules/channels/shopify.service.js";
import { syncOyklaneData } from "../modules/channels/oyklane.service.js";
import { primaryChannels } from "../repositories/channel.repo.js";

/**
 * Fallback periodic sync for connected Shopify channels.
 * Runs in background to catch any missed webhooks or inventory changes.
 */
export async function runShopifySyncJob() {
  console.log("[Job] Running background Shopify periodic sync...");

  try {
    let shopifyChannels = [];

    if (isMongoConnected()) {
      shopifyChannels = await Channel.find({ provider: "shopify", status: "connected" }).lean();
    } else {
      shopifyChannels = [...memory.channels.values()].filter((ch) => ch.provider === "shopify" && ch.status === "connected");
    }

    // Per company, so a duplicate record doesn't sync the same store twice.
    const byCompany = new Map();
    for (const channel of shopifyChannels) byCompany.set(String(channel.companyId), [...(byCompany.get(String(channel.companyId)) || []), channel]);
    shopifyChannels = [...byCompany.values()].flatMap(primaryChannels);

    for (const channel of shopifyChannels) {
      try {
        await syncShopifyData({
          channelId: channel._id || channel.id,
          companyId: channel.companyId,
        });
        console.log(`[Job] Synced Shopify data for shop: ${channel.shop} (Company: ${channel.companyId})`);
      } catch (err) {
        console.error(`[Job] Shopify sync failed for shop ${channel.shop}:`, err.message);
      }
    }

    // Oyklane rides on the same daily run as the catch-up for missed webhooks.
    const oyklaneChannels = isMongoConnected()
      ? await Channel.find({ provider: "oyklane", status: "connected" }).lean()
      : [...memory.channels.values()].filter((ch) => ch.provider === "oyklane" && ch.status === "connected");
    for (const channel of oyklaneChannels) {
      try {
        await syncOyklaneData({ channelId: channel._id || channel.id, companyId: channel.companyId });
      } catch (err) {
        console.error(`[Job] Oyklane sync failed for ${channel.shop}:`, err.message);
      }
    }
  } catch (error) {
    console.error("[Job] Shopify sync job error:", error);
  }
}
