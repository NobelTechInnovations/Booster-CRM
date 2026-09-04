import { isMongoConnected } from "../config/database.js";
import { EmailTemplate } from "../models/email-template.model.js";
import { memory, id, clone, now } from "./memory-store.js";

// Same CRUD shape as automation.repo.js — one company's own library of
// email content, one per (name, trigger), picked by an AutomationRule's
// config.emailTemplateId when its action is "send_email".

function cleanPayload(payload = {}) {
  return {
    name: String(payload.name || "").trim(),
    trigger: String(payload.trigger || "").trim(),
    subject: String(payload.subject || "").trim(),
    bodyHtml: String(payload.bodyHtml || ""),
    isActive: payload.isActive !== false,
  };
}

export async function listEmailTemplates(companyId) {
  if (isMongoConnected()) {
    return EmailTemplate.find({ companyId }).sort({ createdAt: -1 }).lean();
  }
  return [...memory.emailTemplates.values()]
    .filter((t) => String(t.companyId) === String(companyId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(clone);
}

export async function getEmailTemplate({ companyId, templateId }) {
  if (isMongoConnected()) {
    return EmailTemplate.findOne({ _id: templateId, companyId }).lean();
  }
  const t = memory.emailTemplates.get(templateId);
  return t && String(t.companyId) === String(companyId) ? clone(t) : null;
}

export async function createEmailTemplate({ companyId, createdBy, payload }) {
  const clean = cleanPayload(payload);
  if (!clean.name) return { error: "Template name is required" };
  if (!clean.trigger) return { error: "A trigger is required" };
  if (!clean.subject) return { error: "Subject is required" };
  if (!clean.bodyHtml) return { error: "Email body is required" };

  if (isMongoConnected()) {
    const template = await EmailTemplate.create({ companyId, createdBy, ...clean });
    return { template: template.toObject() };
  }

  const template = { _id: id(), companyId, createdBy, ...clean, createdAt: now(), updatedAt: now() };
  memory.emailTemplates.set(template._id, template);
  return { template: clone(template) };
}

export async function updateEmailTemplate({ companyId, templateId, payload }) {
  const clean = cleanPayload(payload);
  if (!clean.name) return { error: "Template name is required" };
  if (!clean.trigger) return { error: "A trigger is required" };
  if (!clean.subject) return { error: "Subject is required" };
  if (!clean.bodyHtml) return { error: "Email body is required" };

  if (isMongoConnected()) {
    const template = await EmailTemplate.findOneAndUpdate({ _id: templateId, companyId }, { $set: clean }, { new: true }).lean();
    if (!template) return { error: "Template not found" };
    return { template };
  }

  const template = memory.emailTemplates.get(templateId);
  if (!template || String(template.companyId) !== String(companyId)) return { error: "Template not found" };
  Object.assign(template, clean, { updatedAt: now() });
  return { template: clone(template) };
}

export async function deleteEmailTemplate({ companyId, templateId }) {
  if (isMongoConnected()) {
    const template = await EmailTemplate.findOneAndDelete({ _id: templateId, companyId }).lean();
    return { template };
  }
  const template = memory.emailTemplates.get(templateId);
  memory.emailTemplates.delete(templateId);
  return { template: template ? clone(template) : null };
}
