import { isMongoConnected } from "../config/database.js";
import { Company } from "../models/company.model.js";
import { User } from "../models/user.model.js";
import { memory, id, clone, now, slugify } from "./memory-store.js";

function publicUser(user, { actorUserId, company } = {}) {
  if (!user) return user;
  const copy = clone(user);
  copy.id = copy._id;
  copy.isSelf = actorUserId ? String(copy._id) === String(actorUserId) : false;
  copy.isPrimaryOwner = company?.ownerUserId ? String(copy._id) === String(company.ownerUserId) : false;
  copy.canEdit = !copy.isSelf && !copy.isPrimaryOwner;
  delete copy.passwordHash;
  return copy;
}

function cleanCompanyPayload(payload) {
  return {
    name:         String(payload.name || "").trim(),
    legalName:    String(payload.legalName || "").trim(),
    email:        String(payload.email || "").trim().toLowerCase(),
    phone:        String(payload.phone || "").trim(),
    website:      String(payload.website || "").trim(),
    businessType: String(payload.businessType || "").trim(),
    gstin:        String(payload.gstin || "").trim().toUpperCase(),
    pan:          String(payload.pan || "").trim().toUpperCase(),
    address: {
      line1:    String(payload.address?.line1 || "").trim(),
      line2:    String(payload.address?.line2 || "").trim(),
      city:     String(payload.address?.city || "").trim(),
      state:    String(payload.address?.state || "").trim(),
      pincode:  String(payload.address?.pincode || "").trim(),
      country:  String(payload.address?.country || "India").trim(),
    },
  };
}

function cleanKycPayload(payload) {
  return {
    legalName:         String(payload.legalName || "").trim(),
    gstin:             String(payload.gstin || "").trim().toUpperCase(),
    pan:               String(payload.pan || "").trim().toUpperCase(),
    registeredAddress: String(payload.registeredAddress || "").trim(),
    bankAccountName:   String(payload.bankAccountName || "").trim(),
    bankAccountNumber: String(payload.bankAccountNumber || "").trim(),
    ifsc:              String(payload.ifsc || "").trim().toUpperCase(),
  };
}

function ensureDevCompany() {
  const slug = "sukirti-naturals";
  const existing = [...memory.companies.values()].find((c) => c.slug === slug);
  if (existing) return existing;

  const company = { _id: id(), name: "Sukirti Naturals", slug, status: "active", createdAt: now(), updatedAt: now() };
  memory.companies.set(company._id, company);
  return company;
}

export async function getOrCreateDevSession({ email, name }) {
  if (isMongoConnected()) {
    const company = await Company.findOneAndUpdate(
      { slug: "sukirti-naturals" },
      { $setOnInsert: { name: "Sukirti Naturals", slug: "sukirti-naturals" } },
      { returnDocument: "after", upsert: true },
    );
    const user = await User.findOneAndUpdate(
      { email },
      { $setOnInsert: { companyId: company._id, email, name, passwordHash: "dev-login-no-password", role: "Owner" } },
      { new: true, upsert: true },
    );
    return { company, user };
  }

  const company = ensureDevCompany();
  const existing = [...memory.users.values()].find((u) => u.email === email);
  if (existing) return { company, user: existing };

  const user = { _id: id(), companyId: company._id, email, name, role: "Owner", passwordHash: "dev-login-no-password", status: "active", createdAt: now(), updatedAt: now() };
  memory.users.set(user._id, user);
  return { company, user };
}

export async function createCompanyOwner({ companyName, name, email, passwordHash }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCompanyName = String(companyName || "").trim();
  const slugBase = slugify(normalizedCompanyName);

  if (isMongoConnected()) {
    let slug = slugBase;
    let suffix = 1;
    while (await Company.findOne({ slug }).lean()) { suffix += 1; slug = `${slugBase}-${suffix}`; }

    const company = await Company.create({ name: normalizedCompanyName, slug });
    const user = await User.create({ companyId: company._id, name, email: normalizedEmail, passwordHash, role: "Owner" });
    company.ownerUserId = user._id;
    await company.save();
    return { company, user };
  }

  let slug = slugBase;
  let suffix = 1;
  while ([...memory.companies.values()].some((c) => c.slug === slug)) { suffix += 1; slug = `${slugBase}-${suffix}`; }

  const company = { _id: id(), name: normalizedCompanyName, slug, ownerUserId: null, status: "active", createdAt: now(), updatedAt: now() };
  memory.companies.set(company._id, company);

  const user = { _id: id(), companyId: company._id, email: normalizedEmail, name, role: "Owner", passwordHash, status: "active", createdAt: now(), updatedAt: now() };
  memory.users.set(user._id, user);
  company.ownerUserId = user._id;
  company.updatedAt = now();
  return { company, user };
}

export async function findUserByEmailWithPassword(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (isMongoConnected()) return User.find({ email: normalizedEmail }).select("+passwordHash").lean();
  return [...memory.users.values()].filter((u) => u.email === normalizedEmail).map(clone);
}

export async function getUserAndCompany({ userId, companyId }) {
  if (isMongoConnected()) {
    const user = await User.findById(userId).lean();
    const company = await Company.findById(companyId).lean();
    return { user, company };
  }
  return { user: clone(memory.users.get(userId) || null), company: clone(memory.companies.get(companyId) || null) };
}

export async function getCompany(companyId) {
  if (isMongoConnected()) return Company.findById(companyId).lean();
  return clone(memory.companies.get(companyId) || null);
}

export async function getAmazonConfig(companyId, { includeSecret = false } = {}) {
  if (isMongoConnected()) {
    const query = Company.findById(companyId);
    if (includeSecret) query.select("+integrations.amazon.clientSecret");
    const company = await query.lean();
    return company?.integrations?.amazon || null;
  }
  return clone(memory.companies.get(companyId)?.integrations?.amazon || null);
}

export async function updateAmazonConfig({ companyId, payload }) {
  const applicationId = String(payload.applicationId || "").trim();
  const existing = await getAmazonConfig(companyId, { includeSecret: true });
  const amazon = {
    applicationId,
    clientId:         String(payload.clientId || "").trim(),
    clientSecret:     String(payload.clientSecret || existing?.clientSecret || "").trim(),
    sellerCentralUrl: String(payload.sellerCentralUrl || "https://sellercentral.amazon.in").trim().replace(/\/$/, ""),
    marketplaceId:    String(payload.marketplaceId || "A21TJRUUN4KGV").trim(),
    spApiEndpoint:    String(payload.spApiEndpoint || "https://sellingpartnerapi-eu.amazon.com").trim().replace(/\/$/, ""),
    syncDays:         Math.max(1, Math.min(90, Number(payload.syncDays || existing?.syncDays || 30))),
    draftMode:        payload.draftMode !== false,
  };

  if (!amazon.applicationId || !amazon.clientId || !amazon.clientSecret) {
    return { error: "Amazon application ID, LWA client ID, and LWA client secret are required" };
  }
  if (!/^amzn1\.(sellerapps\.app|sp\.solution)\.[a-z0-9-]+$/i.test(applicationId)) {
    return { error: "Amazon application ID must look like amzn1.sellerapps.app.xxxxx or amzn1.sp.solution.xxxxx. Do not use the LWA client ID." };
  }

  if (isMongoConnected()) {
    const company = await Company.findByIdAndUpdate(companyId, { $set: { "integrations.amazon": amazon } }, { returnDocument: "after" }).lean();
    return { config: { ...company.integrations.amazon, clientSecret: undefined } };
  }

  const company = memory.companies.get(companyId);
  if (!company) return { error: "Company not found" };
  company.integrations = { ...company.integrations, amazon };
  company.updatedAt = now();
  return { config: { ...amazon, clientSecret: undefined } };
}

export async function getShopifyConfig(companyId, { includeSecret = false } = {}) {
  if (isMongoConnected()) {
    const query = Company.findById(companyId);
    if (includeSecret) query.select("+integrations.shopify.apiSecret");
    const company = await query.lean();
    return company?.integrations?.shopify || null;
  }
  return clone(memory.companies.get(companyId)?.integrations?.shopify || null);
}

export async function updateShopifyConfig({ companyId, payload }) {
  const existing = await getShopifyConfig(companyId, { includeSecret: true });
  const shopify = {
    apiKey: String(payload.apiKey || "").trim(),
    apiSecret: String(payload.apiSecret || existing?.apiSecret || "").trim(),
  };

  if (!shopify.apiKey || !shopify.apiSecret) {
    return { error: "Shopify Client ID and Client Secret are required" };
  }

  if (isMongoConnected()) {
    const company = await Company.findByIdAndUpdate(companyId, { $set: { "integrations.shopify": shopify } }, { returnDocument: "after" }).lean();
    return { config: { ...company.integrations.shopify, apiSecret: undefined } };
  }

  const company = memory.companies.get(companyId);
  if (!company) return { error: "Company not found" };
  company.integrations = { ...company.integrations, shopify };
  company.updatedAt = now();
  return { config: { ...shopify, apiSecret: undefined } };
}

export async function updateCompanyProfile({ companyId, payload }) {
  const update = cleanCompanyPayload(payload);
  if (!update.name) return { error: "Company name is required" };

  if (isMongoConnected()) {
    const company = await Company.findByIdAndUpdate(companyId, { $set: update }, { new: true, runValidators: true }).lean();
    return { company };
  }
  const company = memory.companies.get(companyId);
  if (!company) return { error: "Company not found" };
  Object.assign(company, update, { updatedAt: now() });
  return { company: clone(company) };
}

export async function updateCompanyKyc({ companyId, payload }) {
  const kyc = cleanKycPayload(payload);
  const status = payload.submit ? "submitted" : "draft";
  const submittedAt = payload.submit ? now() : undefined;

  if (isMongoConnected()) {
    const update = { kyc: { ...kyc, status, submittedAt: submittedAt ? new Date(submittedAt) : undefined } };
    const company = await Company.findByIdAndUpdate(companyId, { $set: update }, { new: true }).lean();
    return { company };
  }
  const company = memory.companies.get(companyId);
  if (!company) return { error: "Company not found" };
  company.kyc = { ...company.kyc, ...kyc, status, submittedAt };
  company.updatedAt = now();
  return { company: clone(company) };
}

export async function listCompanyUsers({ companyId, actorUserId }) {
  const company = await getCompany(companyId);
  if (isMongoConnected()) {
    const users = await User.find({ companyId }).sort({ createdAt: -1 }).lean();
    return users.map((u) => publicUser(u, { actorUserId, company }));
  }
  return [...memory.users.values()]
    .filter((u) => String(u.companyId) === String(companyId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((u) => publicUser(u, { actorUserId, company }));
}

export async function createCompanyUser({ companyId, invitedBy, name, email, passwordHash, role }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (isMongoConnected()) {
    const existingUser = await User.findOne({ companyId, email: normalizedEmail }).lean();
    if (existingUser) return { error: "Email is already registered" };
    const user = await User.create({ companyId, invitedBy, name, email: normalizedEmail, passwordHash, role, status: "active" });
    const company = await getCompany(companyId);
    return { user: publicUser(user.toObject(), { actorUserId: invitedBy, company }) };
  }
  const existingUser = [...memory.users.values()].find(
    (u) => String(u.companyId) === String(companyId) && u.email === normalizedEmail,
  );
  if (existingUser) return { error: "Email is already registered" };
  const user = { _id: id(), companyId, invitedBy, email: normalizedEmail, name, role, passwordHash, status: "active", createdAt: now(), updatedAt: now() };
  memory.users.set(user._id, user);
  const company = await getCompany(companyId);
  return { user: publicUser(user, { actorUserId: invitedBy, company }) };
}

export async function updateCompanyUser({ companyId, userId, actorUserId, role, status }) {
  if (String(userId) === String(actorUserId)) return { error: "You cannot edit your own user row from Users page" };
  const company = await getCompany(companyId);
  if (company?.ownerUserId && String(userId) === String(company.ownerUserId)) return { error: "Primary owner role/status cannot be edited" };

  if (isMongoConnected()) {
    const user = await User.findOneAndUpdate({ _id: userId, companyId }, { $set: { role, status } }, { new: true, runValidators: true }).lean();
    return { user: publicUser(user, { actorUserId, company }) };
  }
  const user = memory.users.get(userId);
  if (!user || String(user.companyId) !== String(companyId)) return { user: null };
  user.role = role;
  user.status = status;
  user.updatedAt = now();
  return { user: publicUser(user, { actorUserId, company }) };
}
