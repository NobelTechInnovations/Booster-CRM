import bcrypt from "bcryptjs";
import { isMongoConnected } from "../config/database.js";
import { PlatformAdmin } from "../models/platform-admin.model.js";
import { Plan } from "../models/plan.model.js";
import { Company } from "../models/company.model.js";
import { User } from "../models/user.model.js";
import { SyncedOrder } from "../models/synced-order.model.js";
import { memory, id, clone, now, slugify } from "./memory-store.js";

// ─── Platform admins ─────────────────────────────────────────────────────────

export async function findPlatformAdminByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (isMongoConnected()) return PlatformAdmin.findOne({ email: normalized }).select("+passwordHash").lean();
  for (const admin of memory.platformAdmins.values()) {
    if (admin.email === normalized) return clone(admin);
  }
  return null;
}

export async function touchPlatformAdminLogin(adminId) {
  if (isMongoConnected()) {
    await PlatformAdmin.findByIdAndUpdate(adminId, { $set: { lastLoginAt: new Date() } });
    return;
  }
  const admin = memory.platformAdmins.get(String(adminId));
  if (admin) admin.lastLoginAt = now();
}

export async function createPlatformAdmin({ name, email, passwordHash }) {
  const normalized = String(email || "").trim().toLowerCase();
  const existing = await findPlatformAdminByEmail(normalized);
  if (existing) return { error: "An admin with this email already exists" };

  if (isMongoConnected()) {
    const admin = await PlatformAdmin.create({ name, email: normalized, passwordHash });
    return { admin: admin.toObject() };
  }
  const admin = { _id: id(), name, email: normalized, passwordHash, status: "active", createdAt: now(), updatedAt: now() };
  memory.platformAdmins.set(admin._id, admin);
  return { admin: clone(admin) };
}

export async function listPlatformAdmins() {
  if (isMongoConnected()) return PlatformAdmin.find({}).sort({ createdAt: 1 }).lean();
  return [...memory.platformAdmins.values()].map(clone).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

// ─── Plans ───────────────────────────────────────────────────────────────────

export async function listPlans() {
  if (isMongoConnected()) return Plan.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean();
  return [...memory.plans.values()].map(clone).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export async function getPlan(planId) {
  if (isMongoConnected()) return Plan.findById(planId).lean();
  return clone(memory.plans.get(String(planId)) || null);
}

export async function createPlan(payload) {
  const slug = slugify(payload.slug || payload.name);
  const clean = {
    name: String(payload.name || "").trim(),
    slug,
    priceMonthly: Number(payload.priceMonthly) || 0,
    priceYearly: Number(payload.priceYearly) || 0,
    currency: payload.currency || "INR",
    features: Array.isArray(payload.features) ? payload.features.filter(Boolean) : [],
    limits: {
      maxUsers: payload.limits?.maxUsers !== undefined ? Number(payload.limits.maxUsers) : undefined,
      maxOrders: payload.limits?.maxOrders !== undefined ? Number(payload.limits.maxOrders) : undefined,
      maxChannels: payload.limits?.maxChannels !== undefined ? Number(payload.limits.maxChannels) : undefined,
    },
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
    sortOrder: Number(payload.sortOrder) || 0,
  };

  if (isMongoConnected()) {
    const plan = await Plan.create(clean);
    return plan.toObject();
  }
  const plan = { _id: id(), ...clean, createdAt: now(), updatedAt: now() };
  memory.plans.set(plan._id, plan);
  return clone(plan);
}

export async function updatePlan(planId, payload) {
  const update = {};
  for (const key of ["name", "priceMonthly", "priceYearly", "currency", "features", "limits", "isActive", "sortOrder"]) {
    if (payload[key] !== undefined) update[key] = payload[key];
  }

  if (isMongoConnected()) {
    return Plan.findByIdAndUpdate(planId, { $set: update }, { new: true }).lean();
  }
  const plan = memory.plans.get(String(planId));
  if (!plan) return null;
  Object.assign(plan, update, { updatedAt: now() });
  return clone(plan);
}

// ─── Companies (cross-tenant — the one legitimate place this belongs) ──────

// Every existing repo in this app scopes every query to one companyId; this
// is deliberately the single exception, gated entirely by requirePlatformAdmin
// rather than any company-side auth.
export async function listAllCompaniesForAdmin() {
  const [companies, owners, orderCounts] = await Promise.all([
    isMongoConnected() ? Company.find({}).sort({ createdAt: -1 }).lean() : [...memory.companies.values()].map(clone),
    isMongoConnected() ? User.find({}).lean() : [...memory.users.values()].map(clone),
    isMongoConnected()
      ? SyncedOrder.aggregate([{ $group: { _id: "$companyId", count: { $sum: 1 } } }])
      : Promise.resolve(
          [...memory.orders.values()].reduce((acc, o) => {
            const key = String(o.companyId);
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
        ),
  ]);

  const ownersById = new Map(owners.map((u) => [String(u._id), u]));
  const orderCountByCompany = isMongoConnected()
    ? new Map(orderCounts.map((row) => [String(row._id), row.count]))
    : new Map(Object.entries(orderCounts));

  return companies.map((company) => {
    const owner = company.ownerUserId ? ownersById.get(String(company.ownerUserId)) : null;
    return {
      ...company,
      ownerName: owner?.name || "",
      ownerEmail: owner?.email || "",
      orderCount: orderCountByCompany.get(String(company._id)) || 0,
    };
  });
}

export async function getCompanyForAdmin(companyId) {
  const [company, users] = await Promise.all([
    isMongoConnected() ? Company.findById(companyId).lean() : clone(memory.companies.get(String(companyId)) || null),
    isMongoConnected()
      ? User.find({ companyId }).lean()
      : [...memory.users.values()].map(clone).filter((u) => String(u.companyId) === String(companyId)),
  ]);
  if (!company) return null;

  const orderCount = isMongoConnected()
    ? await SyncedOrder.countDocuments({ companyId })
    : [...memory.orders.values()].filter((o) => String(o.companyId) === String(companyId)).length;

  return { company, users, orderCount };
}

export async function updateCompanyStatus({ companyId, status }) {
  if (!["active", "disabled"].includes(status)) return { error: "Invalid status" };

  if (isMongoConnected()) {
    const company = await Company.findByIdAndUpdate(companyId, { $set: { status } }, { new: true }).lean();
    return { company };
  }
  const company = memory.companies.get(String(companyId));
  if (!company) return { company: null };
  company.status = status;
  return { company: clone(company) };
}

export async function updateCompanySubscription({ companyId, planId, status, trialEndsAt, currentPeriodEnd, seats, notes }) {
  let features = [];
  let planSlug = "";
  if (planId) {
    const plan = await getPlan(planId);
    if (!plan) return { error: "Plan not found" };
    features = plan.features || [];
    planSlug = plan.slug;
  }

  const subscription = {
    ...(planId ? { planId, planSlug, features } : {}),
    ...(status ? { status } : {}),
    ...(trialEndsAt !== undefined ? { trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null } : {}),
    ...(currentPeriodEnd !== undefined ? { currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null } : {}),
    ...(seats !== undefined ? { seats: Number(seats) || 0 } : {}),
    ...(notes !== undefined ? { notes: String(notes || "").slice(0, 2000) } : {}),
  };

  if (isMongoConnected()) {
    const existing = await Company.findById(companyId).lean();
    if (!existing) return { error: "Company not found" };
    const merged = { ...(existing.subscription || {}), ...subscription };
    const company = await Company.findByIdAndUpdate(companyId, { $set: { subscription: merged } }, { new: true }).lean();
    return { company };
  }
  const company = memory.companies.get(String(companyId));
  if (!company) return { error: "Company not found" };
  company.subscription = { ...(company.subscription || {}), ...subscription };
  return { company: clone(company) };
}
