import { isMongoConnected } from "../config/database.js";
import { Role } from "../models/role.model.js";
import { memory, id, clone, now } from "./memory-store.js";
import { rolePermissions, permissionsForRole } from "../modules/auth/permissions.js";
import { listInstalledSlugs } from "./app.repo.js";
import { APPS } from "../config/app-registry.js";

function memoryRoles() {
  memory.roles = memory.roles || new Map();
  return memory.roles;
}

async function findRole({ companyId, name }) {
  if (isMongoConnected()) {
    return Role.findOne({ companyId, name }).lean();
  }
  return [...memoryRoles().values()].find(
    (row) => String(row.companyId) === String(companyId) && row.name === name,
  ) || null;
}

// The single question every permission check ultimately asks: what is this
// person, in this workspace, allowed to do?
//
// A workspace that has defined its own roles gets its own answer. One that
// hasn't falls through to the built-in map that has always backed the seven
// legacy roles — which is what keeps every existing workspace working with
// no seeding, no migration, and no change in behaviour on the day this ships.
export async function resolvePermissions({ companyId, role }) {
  if (!role) return [];

  const custom = await findRole({ companyId, name: role });
  if (custom) return custom.permissions || [];

  return permissionsForRole(role);
}

export async function listRoles(companyId) {
  const custom = isMongoConnected()
    ? await Role.find({ companyId }).sort({ name: 1 }).lean()
    : [...memoryRoles().values()].filter((row) => String(row.companyId) === String(companyId)).map(clone);

  if (custom.length) return custom;

  // Nothing customized yet — present the built-in roles as they'd look once
  // saved, so the roles screen isn't misleadingly empty for a workspace that
  // very much does have roles in effect.
  return Object.entries(rolePermissions).map(([name, permissions]) => ({
    _id: null,
    companyId,
    name,
    description: "Built-in role",
    permissions,
    isSystem: true,
    builtIn: true,
  }));
}

// Copies the built-in roles into real, editable documents for this workspace.
// Called the first time a workspace touches roles at all, so that editing one
// role doesn't implicitly delete the other six by switching the workspace
// from "use the built-ins" to "use my own" with only one defined.
export async function seedSystemRoles(companyId) {
  const existing = isMongoConnected()
    ? await Role.countDocuments({ companyId })
    : [...memoryRoles().values()].filter((row) => String(row.companyId) === String(companyId)).length;

  if (existing) return;

  const seeds = Object.entries(rolePermissions).map(([name, permissions]) => ({
    companyId,
    name,
    description: "Built-in role",
    permissions,
    isSystem: true,
  }));

  if (isMongoConnected()) {
    await Role.insertMany(seeds, { ordered: false }).catch(() => {});
    return;
  }

  for (const seed of seeds) {
    const row = { ...seed, _id: id(), createdAt: now(), updatedAt: now() };
    memoryRoles().set(row._id, row);
  }
}

export async function createRole({ companyId, name, description, permissions }) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return { error: "Role name is required" };

  await seedSystemRoles(companyId);

  if (await findRole({ companyId, name: cleanName })) {
    return { error: "A role with that name already exists" };
  }

  const payload = {
    companyId,
    name: cleanName,
    description: String(description || "").trim(),
    permissions: Array.isArray(permissions) ? permissions.filter(Boolean) : [],
    isSystem: false,
  };

  if (isMongoConnected()) {
    const created = await Role.create(payload);
    return { role: created.toObject() };
  }

  const row = { ...payload, _id: id(), createdAt: now(), updatedAt: now() };
  memoryRoles().set(row._id, row);
  return { role: clone(row) };
}

export async function updateRole({ companyId, name, description, permissions }) {
  await seedSystemRoles(companyId);

  const existing = await findRole({ companyId, name });
  if (!existing) return { error: "Role not found" };

  // Owner is the one role that must keep full access — otherwise a workspace
  // can lock every single person out of its own settings with one checkbox.
  const nextPermissions = name === "Owner"
    ? ["*"]
    : (Array.isArray(permissions) ? permissions.filter(Boolean) : existing.permissions);

  if (isMongoConnected()) {
    const updated = await Role.findOneAndUpdate(
      { companyId, name },
      { $set: { permissions: nextPermissions, ...(description !== undefined ? { description } : {}) } },
      { new: true },
    ).lean();
    return { role: updated };
  }

  const row = [...memoryRoles().values()].find(
    (entry) => String(entry.companyId) === String(companyId) && entry.name === name,
  );
  if (!row) return { error: "Role not found" };
  row.permissions = nextPermissions;
  if (description !== undefined) row.description = description;
  row.updatedAt = now();
  return { role: clone(row) };
}

export async function deleteRole({ companyId, name, assignedCount }) {
  const existing = await findRole({ companyId, name });
  if (!existing) return { error: "Role not found" };
  if (existing.isSystem) return { error: "Built-in roles can't be deleted — edit their permissions instead." };
  if (assignedCount > 0) {
    return { error: `${assignedCount} team member(s) still have this role — reassign them first.` };
  }

  if (isMongoConnected()) {
    await Role.deleteOne({ companyId, name });
    return { success: true };
  }

  const row = [...memoryRoles().values()].find(
    (entry) => String(entry.companyId) === String(companyId) && entry.name === name,
  );
  if (row) memoryRoles().delete(row._id);
  return { success: true };
}

// The permission checklist a role editor renders — narrowed to the apps this
// workspace actually has, so a coaching centre isn't asked to reason about
// "Pack and ship orders".
export async function grantablePermissions(companyId) {
  const installed = await listInstalledSlugs(companyId);
  return APPS
    .filter((app) => installed.has(app.slug))
    .map((app) => ({
      app: app.slug,
      appName: app.name,
      icon: app.icon,
      permissions: app.permissions || [],
    }))
    .filter((group) => group.permissions.length);
}
