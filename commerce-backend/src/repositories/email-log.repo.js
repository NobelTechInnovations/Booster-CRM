import { isMongoConnected } from "../config/database.js";
import { EmailLog } from "../models/email-log.model.js";
import { memory, id, clone, now } from "./memory-store.js";

// The audit trail + idempotency source for automation-dispatcher.js — see
// email-log.model.js's own comment for what each row means.

export async function createEmailLog(payload) {
  if (isMongoConnected()) {
    const log = await EmailLog.create(payload);
    return log.toObject();
  }
  const log = { _id: id(), ...payload, createdAt: now(), updatedAt: now() };
  memory.emailLogs.set(log._id, log);
  return clone(log);
}

// Has this exact rule already SUCCESSFULLY emailed for this exact order? —
// the guard a redelivered webhook or a re-scanning cron relies on to never
// double-send. Deliberately only matches status:"sent" — a prior "failed"
// row (a transient SMTP hiccup, a misconfigured channel since fixed, ...)
// must NOT block a later legitimate retry (a webhook redelivery, the next
// day's cron pass) from actually getting the email out; only a real
// successful send is worth deduping against.
export async function findExistingEmailLog({ companyId, ruleId, orderId }) {
  if (orderId === undefined || orderId === null) return null; // no order to dedupe against (e.g. a custom trigger with no order)

  if (isMongoConnected()) {
    return EmailLog.findOne({ companyId, ruleId, orderId, status: "sent" }).lean();
  }
  return (
    clone(
      [...memory.emailLogs.values()].find(
        (l) => String(l.companyId) === String(companyId) && String(l.ruleId) === String(ruleId) && String(l.orderId) === String(orderId) && l.status === "sent",
      ),
    ) || null
  );
}

export async function listEmailLogs({ companyId, limit = 100 }) {
  if (isMongoConnected()) {
    return EmailLog.find({ companyId }).sort({ createdAt: -1 }).limit(limit).lean();
  }
  return [...memory.emailLogs.values()]
    .filter((l) => String(l.companyId) === String(companyId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map(clone);
}
