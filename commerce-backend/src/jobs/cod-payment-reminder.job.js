import { isMongoConnected } from "../config/database.js";
import { SyncedOrder } from "../models/synced-order.model.js";
import { memory } from "../repositories/memory-store.js";
import { getCompany } from "../repositories/store.js";
import { runAutomationsForTrigger, buildOrderEmailContext } from "../modules/automation/automation-dispatcher.js";

// Same daily-cron shape as upgrade-reminder.job.js — a Cash-on-Delivery
// order still awaiting payment confirmation once it's out the door
// (shipped/delivered, financialStatus not yet "paid") gets a
// "cod_payment_reminder" automation trigger fired for it. The dispatcher's
// own EmailLog idempotency guard (see automation-dispatcher.js) is what
// keeps this from re-emailing the same order every single day this job
// runs — no separate "already reminded" flag needed on the order itself.
export async function runCodPaymentReminderJob() {
  console.log("[Job] Running COD payment reminder check...");

  let orders = [];
  try {
    if (isMongoConnected()) {
      orders = await SyncedOrder.find({
        isCOD: true,
        omsStatus: { $in: ["shipped", "delivered"] },
        financialStatus: { $nin: ["paid", "partially_refunded", "refunded", "voided"] },
      }).lean();
    } else {
      orders = [...memory.orders.values()].filter(
        (o) => o.isCOD && ["shipped", "delivered"].includes(o.omsStatus) && !["paid", "partially_refunded", "refunded", "voided"].includes(o.financialStatus),
      );
    }
  } catch (error) {
    console.error("[Job] COD payment reminder job failed to query orders:", error.message);
    return;
  }

  if (!orders.length) return;

  const companyCache = new Map();
  for (const order of orders) {
    try {
      const companyId = String(order.companyId);
      if (!companyCache.has(companyId)) companyCache.set(companyId, await getCompany(order.companyId));
      const company = companyCache.get(companyId);

      await runAutomationsForTrigger({
        companyId: order.companyId,
        trigger: "cod_payment_reminder",
        context: buildOrderEmailContext({ order, company }),
      });
    } catch (err) {
      console.warn(`[Job] COD payment reminder failed for order ${order.externalId}:`, err.message);
    }
  }

  console.log(`[Job] COD payment reminder checked ${orders.length} order(s).`);
}
