import crypto from "node:crypto";
import { isMongoConnected } from "../config/database.js";
import { Channel } from "../models/channel.model.js";
import { Company } from "../models/company.model.js";
import { User } from "../models/user.model.js";

const memory = {
  companies: new Map(),
  users: new Map(),
  channels: new Map(),
};

function id() {
  return crypto.randomUUID();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function withoutCredentials(channel) {
  if (!channel) return channel;
  const copy = clone(channel);
  delete copy.credentials;
  return copy;
}

function ensureDevCompany() {
  const slug = "sukirti-naturals";
  const existing = [...memory.companies.values()].find((company) => company.slug === slug);

  if (existing) return existing;

  const company = {
    _id: id(),
    name: "Sukirti Naturals",
    slug,
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  };

  memory.companies.set(company._id, company);
  return company;
}

export function getStoreMode() {
  return isMongoConnected() ? "mongodb" : "memory";
}

export async function getOrCreateDevSession({ email, name }) {
  if (isMongoConnected()) {
    const company = await Company.findOneAndUpdate(
      { slug: "sukirti-naturals" },
      { $setOnInsert: { name: "Sukirti Naturals", slug: "sukirti-naturals" } },
      { new: true, upsert: true },
    );

    const user = await User.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          companyId: company._id,
          email,
          name,
          passwordHash: "dev-login-no-password",
          role: "Owner",
        },
      },
      { new: true, upsert: true },
    );

    return { company, user };
  }

  const company = ensureDevCompany();
  const existing = [...memory.users.values()].find((user) => user.email === email);

  if (existing) {
    return { company, user: existing };
  }

  const user = {
    _id: id(),
    companyId: company._id,
    email,
    name,
    role: "Owner",
    passwordHash: "dev-login-no-password",
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  };

  memory.users.set(user._id, user);
  return { company, user };
}

export async function createCompanyOwner({ companyName, name, email, passwordHash }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCompanyName = String(companyName || "").trim();
  const slugBase = slugify(normalizedCompanyName);

  if (isMongoConnected()) {
    const existingUser = await User.findOne({ email: normalizedEmail }).lean();
    if (existingUser) {
      return { error: "Email is already registered" };
    }

    let slug = slugBase;
    let suffix = 1;
    while (await Company.findOne({ slug }).lean()) {
      suffix += 1;
      slug = `${slugBase}-${suffix}`;
    }

    const company = await Company.create({
      name: normalizedCompanyName,
      slug,
    });

    const user = await User.create({
      companyId: company._id,
      name,
      email: normalizedEmail,
      passwordHash,
      role: "Owner",
    });

    return { company, user };
  }

  const existingUser = [...memory.users.values()].find((user) => user.email === normalizedEmail);
  if (existingUser) {
    return { error: "Email is already registered" };
  }

  let slug = slugBase;
  let suffix = 1;
  while ([...memory.companies.values()].some((company) => company.slug === slug)) {
    suffix += 1;
    slug = `${slugBase}-${suffix}`;
  }

  const company = {
    _id: id(),
    name: normalizedCompanyName,
    slug,
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  };
  memory.companies.set(company._id, company);

  const user = {
    _id: id(),
    companyId: company._id,
    email: normalizedEmail,
    name,
    role: "Owner",
    passwordHash,
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  };
  memory.users.set(user._id, user);

  return { company, user };
}

export async function findUserByEmailWithPassword(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (isMongoConnected()) {
    return User.findOne({ email: normalizedEmail }).select("+passwordHash").lean();
  }

  const user = [...memory.users.values()].find((entry) => entry.email === normalizedEmail);
  return user ? clone(user) : null;
}

export async function getUserAndCompany({ userId, companyId }) {
  if (isMongoConnected()) {
    const user = await User.findById(userId).lean();
    const company = await Company.findById(companyId).lean();
    return { user, company };
  }

  return {
    user: clone(memory.users.get(userId) || null),
    company: clone(memory.companies.get(companyId) || null),
  };
}

export async function listChannels(companyId) {
  if (isMongoConnected()) {
    return Channel.find({ companyId }).select("-credentials").sort({ updatedAt: -1 }).lean();
  }

  return [...memory.channels.values()]
    .filter((channel) => String(channel.companyId) === String(companyId))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(withoutCredentials);
}

export async function upsertShopifyChannel({ companyId, userId, shop, shopDetails, scopes, accessToken }) {
  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { companyId, provider: "shopify", shop },
      {
        $set: {
          provider: "shopify",
          companyId,
          shop,
          name: shopDetails.name || shop,
          status: "connected",
          scopes,
          credentials: { accessToken },
          external: {
            shopId: shopDetails.id ? String(shopDetails.id) : undefined,
            email: shopDetails.email,
            domain: shopDetails.domain,
            myshopifyDomain: shopDetails.myshopify_domain,
            currency: shopDetails.currency,
            timezone: shopDetails.iana_timezone || shopDetails.timezone,
          },
          connectedBy: userId,
          disconnectedAt: null,
        },
      },
      { new: true, upsert: true },
    ).lean();
  }

  const existing = [...memory.channels.values()].find(
    (channel) =>
      String(channel.companyId) === String(companyId) &&
      channel.provider === "shopify" &&
      channel.shop === shop,
  );

  const channel = {
    _id: existing?._id || id(),
    provider: "shopify",
    companyId,
    shop,
    name: shopDetails.name || shop,
    status: "connected",
    scopes,
    credentials: { accessToken },
    external: {
      shopId: shopDetails.id ? String(shopDetails.id) : undefined,
      email: shopDetails.email,
      domain: shopDetails.domain,
      myshopifyDomain: shopDetails.myshopify_domain,
      currency: shopDetails.currency,
      timezone: shopDetails.iana_timezone || shopDetails.timezone,
    },
    sync: existing?.sync || {
      products: "idle",
      orders: "idle",
      inventory: "idle",
      customers: "idle",
    },
    connectedBy: userId,
    disconnectedAt: null,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };

  memory.channels.set(channel._id, channel);
  return clone(channel);
}

export async function queueChannelSync({ channelId, companyId }) {
  if (isMongoConnected()) {
    const channel = await Channel.findOne({ _id: channelId, companyId });
    if (!channel) return null;

    channel.sync = {
      products: "queued",
      orders: "queued",
      inventory: "queued",
      customers: "queued",
      lastSyncAt: new Date(),
      lastError: undefined,
    };

    await channel.save();
    return channel.toObject();
  }

  const channel = memory.channels.get(channelId);

  if (!channel || String(channel.companyId) !== String(companyId)) {
    return null;
  }

  channel.sync = {
    products: "queued",
    orders: "queued",
    inventory: "queued",
    customers: "queued",
    lastSyncAt: now(),
  };
  channel.updatedAt = now();

  return clone(channel);
}

export async function disconnectChannel({ channelId, companyId }) {
  if (isMongoConnected()) {
    return Channel.findOneAndUpdate(
      { _id: channelId, companyId },
      {
        $set: {
          status: "disconnected",
          disconnectedAt: new Date(),
          "credentials.accessToken": undefined,
        },
      },
      { new: true },
    ).select("-credentials");
  }

  const channel = memory.channels.get(channelId);

  if (!channel || String(channel.companyId) !== String(companyId)) {
    return null;
  }

  channel.status = "disconnected";
  channel.disconnectedAt = now();
  channel.updatedAt = now();
  delete channel.credentials?.accessToken;

  return withoutCredentials(channel);
}
