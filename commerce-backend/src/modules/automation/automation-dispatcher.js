import { AutomationRule } from "../../models/automation-rule.model.js";
import { EmailTemplate } from "../../models/email-template.model.js";
import { getConnectedEmailChannel } from "../../repositories/channel.repo.js";
import { createEmailLog, findExistingEmailLog } from "../../repositories/email-log.repo.js";
import { recordAutomationRun } from "../../repositories/automation.repo.js";
import { sendCompanySmtpEmail } from "../../utils/smtp-mailer.js";
import { renderNamedTemplate } from "../../utils/template-render.js";
import { isMongoConnected } from "../../config/database.js";

// The "real trigger wiring" automation.repo.js's own comment said was a
// natural next step, now that a messaging provider (SMTP) is connected.
// One shared entry point every real event in this app calls through —
// a Shopify webhook, a fulfillment/delivery status change, a scheduled
// COD-reminder scan, or an external custom-trigger call — so "what fires
// on this event" is answered in exactly one place, not re-implemented
// per event source.
//
// Only the "send_email" action is wired this pass — send_whatsapp/
// tag_order/notify_team/webhook stay exactly as unimplemented as they
// were before this file existed; a rule with one of those actions is
// found here (nothing skips it at the query level) but simply produces
// no effect yet, same as it always has.
export async function runAutomationsForTrigger({ companyId, trigger, context = {} }) {
  if (!isMongoConnected()) return; // no persistent rules to run against in the in-memory dev fallback

  const rules = await AutomationRule.find({ companyId, trigger, isActive: true }).lean();
  for (const rule of rules) {
    if (rule.action !== "send_email") continue;
    try {
      await dispatchEmailAction({ companyId, rule, trigger, context });
    } catch (err) {
      console.warn(`[Automation] rule ${rule._id} (${trigger}) failed:`, err.message);
    }
  }
}

async function dispatchEmailAction({ companyId, rule, trigger, context }) {
  const templateId = rule.config?.emailTemplateId;
  if (!templateId) return; // rule never had a template picked — nothing to send

  const to = context.customerEmail;
  if (!to) return; // no address to send to (e.g. a guest order with no email on file)

  // Idempotency — a webhook can redeliver, a cron can re-scan; never email
  // twice for the same rule+order combo.
  const already = await findExistingEmailLog({ companyId, ruleId: rule._id, orderId: context.orderId });
  if (already) return;

  const template = await EmailTemplate.findOne({ _id: templateId, companyId, isActive: true }).lean();
  if (!template) return; // template deleted/deactivated since the rule was set up

  const channel = await getConnectedEmailChannel(companyId);
  const subject = renderNamedTemplate(template.subject, context);
  const html = renderNamedTemplate(template.bodyHtml, context);

  const result = channel
    ? await sendCompanySmtpEmail({ channel, to, subject, html })
    : { success: false, error: "No email channel connected for this company." };

  await createEmailLog({
    companyId,
    templateId: template._id,
    ruleId: rule._id,
    orderId: context.orderId,
    trigger,
    to,
    subject,
    status: result.success ? "sent" : "failed",
    error: result.success ? undefined : result.error,
  });

  if (result.success) {
    await recordAutomationRun({ companyId, ruleId: rule._id }).catch(() => {});
  }
}

// The one shape every order-based trigger's context is built from — used by
// every webhook handler / fulfillment function this system wires into, so a
// template written once ({{customerName}}, {{orderNumber}}, ...) works the
// same regardless of which event actually fired it. Fields that don't apply
// to a given event (e.g. refundAmount on an order_placed) are simply absent
// — renderNamedTemplate() already treats a missing variable as blank.
export function buildOrderEmailContext({ order, company, extra = {} }) {
  return {
    orderId: order._id,
    customerName: order.customerName || "Customer",
    customerEmail: order.email,
    orderNumber: order.name || String(order.externalId || ""),
    orderTotal: order.totalPrice,
    currency: order.currency || "INR",
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    courierName: order.trackingCompany,
    companyName: company?.name || "",
    ...extra,
  };
}
