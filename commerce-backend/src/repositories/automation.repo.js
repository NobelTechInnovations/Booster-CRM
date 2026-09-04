import { isMongoConnected } from "../config/database.js";
import { AutomationRule } from "../models/automation-rule.model.js";
import { memory, id, clone, now } from "./memory-store.js";

// The built-in order-lifecycle triggers — order_delivered/refund_processed/
// cod_payment_reminder added alongside the pre-existing three once real
// event wiring (automation-dispatcher.js) actually needed them. A company
// can also invent its own trigger name entirely (see the free-form
// fallback below) and fire it externally via a WebhookEndpoint's
// automationTriggerKey — that's what BUILT_IN_TRIGGERS being a known list
// rather than a hard enum on the schema itself makes possible.
export const BUILT_IN_TRIGGERS = [
  "order_placed", "order_fulfilled", "order_delivered", "order_cancelled",
  "refund_processed", "cod_payment_reminder",
  "low_stock", "repeat_customer", "abandoned_checkout",
];
const ACTIONS = ["send_whatsapp", "send_email", "tag_order", "notify_team", "webhook"];

// A valid trigger is either one of the built-ins above, or any other real,
// non-empty string a company typed in as its own custom trigger name.
function cleanTrigger(trigger) {
  const value = String(trigger || "").trim();
  return value ? value : null;
}

function cleanPayload(payload = {}) {
  const clean = {
    name: String(payload.name || "").trim(),
    trigger: cleanTrigger(payload.trigger),
    action: ACTIONS.includes(payload.action) ? payload.action : null,
    config: payload.config && typeof payload.config === "object" ? payload.config : {},
    isActive: payload.isActive !== false,
  };
  return clean;
}

export async function listAutomationRules(companyId) {
  if (isMongoConnected()) {
    return AutomationRule.find({ companyId }).sort({ createdAt: -1 }).lean();
  }
  return [...memory.automationRules.values()]
    .filter((r) => String(r.companyId) === String(companyId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(clone);
}

export async function createAutomationRule({ companyId, createdBy, payload }) {
  const clean = cleanPayload(payload);
  if (!clean.name) return { error: "Rule name is required" };
  if (!clean.trigger) return { error: "Valid trigger is required" };
  if (!clean.action) return { error: "Valid action is required" };

  if (isMongoConnected()) {
    const rule = await AutomationRule.create({ companyId, createdBy, ...clean });
    return { rule: rule.toObject() };
  }

  const rule = { _id: id(), companyId, createdBy, ...clean, runCount: 0, lastRunAt: null, createdAt: now(), updatedAt: now() };
  memory.automationRules.set(rule._id, rule);
  return { rule: clone(rule) };
}

export async function updateAutomationRule({ companyId, ruleId, payload }) {
  const clean = cleanPayload(payload);
  if (!clean.name) return { error: "Rule name is required" };
  if (!clean.trigger) return { error: "Valid trigger is required" };
  if (!clean.action) return { error: "Valid action is required" };

  if (isMongoConnected()) {
    const rule = await AutomationRule.findOneAndUpdate({ _id: ruleId, companyId }, { $set: clean }, { new: true }).lean();
    if (!rule) return { error: "Rule not found" };
    return { rule };
  }

  const rule = memory.automationRules.get(ruleId);
  if (!rule || String(rule.companyId) !== String(companyId)) return { error: "Rule not found" };
  Object.assign(rule, clean, { updatedAt: now() });
  return { rule: clone(rule) };
}

export async function toggleAutomationRule({ companyId, ruleId, isActive }) {
  if (isMongoConnected()) {
    const rule = await AutomationRule.findOneAndUpdate({ _id: ruleId, companyId }, { $set: { isActive } }, { new: true }).lean();
    if (!rule) return { error: "Rule not found" };
    return { rule };
  }

  const rule = memory.automationRules.get(ruleId);
  if (!rule || String(rule.companyId) !== String(companyId)) return { error: "Rule not found" };
  rule.isActive = isActive;
  rule.updatedAt = now();
  return { rule: clone(rule) };
}

export async function deleteAutomationRule({ companyId, ruleId }) {
  if (isMongoConnected()) {
    const rule = await AutomationRule.findOneAndDelete({ _id: ruleId, companyId }).lean();
    return { rule };
  }

  const rule = memory.automationRules.get(ruleId);
  memory.automationRules.delete(ruleId);
  return { rule: rule ? clone(rule) : null };
}

// Manually "run" a rule to test it — increments the run counter. Real trigger wiring
// (order_placed webhooks etc. calling this automatically) is a natural next step
// once a messaging/webhook provider is connected.
export async function recordAutomationRun({ companyId, ruleId }) {
  if (isMongoConnected()) {
    const rule = await AutomationRule.findOneAndUpdate(
      { _id: ruleId, companyId },
      { $inc: { runCount: 1 }, $set: { lastRunAt: new Date() } },
      { new: true },
    ).lean();
    if (!rule) return { error: "Rule not found" };
    return { rule };
  }

  const rule = memory.automationRules.get(ruleId);
  if (!rule || String(rule.companyId) !== String(companyId)) return { error: "Rule not found" };
  rule.runCount = (rule.runCount || 0) + 1;
  rule.lastRunAt = now();
  return { rule: clone(rule) };
}
