import { isMongoConnected } from "../config/database.js";
import { AutomationRule } from "../models/automation-rule.model.js";
import { memory, id, clone, now } from "./memory-store.js";

const TRIGGERS = ["order_placed", "order_fulfilled", "order_cancelled", "low_stock", "repeat_customer", "abandoned_checkout"];
const ACTIONS = ["send_whatsapp", "send_email", "tag_order", "notify_team", "webhook"];

function cleanPayload(payload = {}) {
  const clean = {
    name: String(payload.name || "").trim(),
    trigger: TRIGGERS.includes(payload.trigger) ? payload.trigger : null,
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
