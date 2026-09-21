import { isMongoConnected } from "../config/database.js";
import { OrgApp } from "../models/org-app.model.js";
import { memory, id, clone, now } from "./memory-store.js";
import { APPS, COMMERCE_APP_SLUGS, NAV_GROUP_ORDER, getApp, listApps } from "../config/app-registry.js";

function memoryOrgApps() {
  memory.orgApps = memory.orgApps || new Map();
  return memory.orgApps;
}

async function rawInstallRows(companyId) {
  if (isMongoConnected()) {
    return OrgApp.find({ companyId, status: "installed" }).lean();
  }
  return [...memoryOrgApps().values()].filter(
    (row) => String(row.companyId) === String(companyId) && row.status === "installed",
  );
}

// The set of app slugs a workspace can currently use.
//
// A workspace with no rows at all gets every non-core app — the same
// "nothing configured means full access" convention companyHasFeature()
// already uses for plans. That is the entire backward-compatibility story:
// every workspace that existed before apps did keeps seeing exactly what it
// saw yesterday, with no migration required to make that true.
export async function listInstalledSlugs(companyId) {
  const rows = await rawInstallRows(companyId);

  if (!rows.length) {
    return new Set(["core", ...COMMERCE_APP_SLUGS]);
  }

  const slugs = new Set(rows.map((row) => row.appSlug));
  // Core is never optional, whatever the rows say.
  slugs.add("core");
  return slugs;
}

export async function isAppInstalled({ companyId, slug }) {
  if (slug === "core") return true;
  const installed = await listInstalledSlugs(companyId);
  return installed.has(slug);
}

// The catalogue as this workspace sees it — every app, each flagged with
// whether it's installed. Powers the Apps page.
export async function listAppsForCompany(companyId) {
  const installed = await listInstalledSlugs(companyId);
  const rows = await rawInstallRows(companyId);
  const rowBySlug = new Map(rows.map((row) => [row.appSlug, row]));

  return listApps().map((app) => {
    const row = rowBySlug.get(app.slug);
    return {
      slug: app.slug,
      name: app.name,
      description: app.description,
      category: app.category,
      icon: app.icon,
      required: Boolean(app.required),
      installed: installed.has(app.slug),
      installedAt: row?.installedAt || null,
      settings: row?.settings || {},
      permissions: app.permissions || [],
    };
  });
}

// Installing is an upsert so re-installing a previously removed app restores
// it (and its settings) rather than erroring.
export async function installApp({ companyId, slug, actorUserId }) {
  const app = getApp(slug);
  if (!app) return { error: "Unknown app" };

  // Materialize the implicit default before changing anything. Without this,
  // a workspace that had never installed anything (and therefore implicitly
  // had everything) would drop to exactly one app the moment it installed
  // its first one — the fallback would stop applying the instant a row exists.
  await materializeDefaults(companyId);

  if (isMongoConnected()) {
    const row = await OrgApp.findOneAndUpdate(
      { companyId, appSlug: slug },
      { $set: { status: "installed", installedAt: new Date(), installedBy: actorUserId, uninstalledAt: null } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return { app: row };
  }

  const existing = [...memoryOrgApps().values()].find(
    (row) => String(row.companyId) === String(companyId) && row.appSlug === slug,
  );
  if (existing) {
    existing.status = "installed";
    existing.installedAt = now();
    existing.updatedAt = now();
    return { app: clone(existing) };
  }
  const row = {
    _id: id(),
    companyId,
    appSlug: slug,
    status: "installed",
    settings: {},
    installedAt: now(),
    installedBy: actorUserId,
    createdAt: now(),
    updatedAt: now(),
  };
  memoryOrgApps().set(row._id, row);
  return { app: clone(row) };
}

export async function uninstallApp({ companyId, slug }) {
  const app = getApp(slug);
  if (!app) return { error: "Unknown app" };
  if (app.required) return { error: `${app.name} can't be removed — the workspace needs it to function.` };

  await materializeDefaults(companyId);

  if (isMongoConnected()) {
    await OrgApp.findOneAndUpdate(
      { companyId, appSlug: slug },
      { $set: { status: "suspended", uninstalledAt: new Date() } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    return { success: true };
  }

  const existing = [...memoryOrgApps().values()].find(
    (row) => String(row.companyId) === String(companyId) && row.appSlug === slug,
  );
  if (existing) {
    existing.status = "suspended";
    existing.uninstalledAt = now();
    existing.updatedAt = now();
  }
  return { success: true };
}

// Uninstalling never deletes data — an app's records stay exactly where they
// are and come back untouched on reinstall. "Uninstall" here means "hide it
// and stop its routes answering", not "destroy the orders".
export async function updateAppSettings({ companyId, slug, settings }) {
  if (!getApp(slug)) return { error: "Unknown app" };

  if (isMongoConnected()) {
    const row = await OrgApp.findOneAndUpdate(
      { companyId, appSlug: slug },
      { $set: { settings: settings || {} } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return { app: row };
  }

  const existing = [...memoryOrgApps().values()].find(
    (row) => String(row.companyId) === String(companyId) && row.appSlug === slug,
  );
  if (existing) {
    existing.settings = settings || {};
    existing.updatedAt = now();
    return { app: clone(existing) };
  }
  return { error: "App not installed" };
}

// Turns the implicit "no rows means everything" default into real rows, so
// that the first explicit install/uninstall doesn't read as removing
// everything else. Idempotent and safe to call on every write path.
export async function materializeDefaults(companyId) {
  const rows = await rawInstallRows(companyId);
  if (rows.length) return;

  const slugs = ["core", ...COMMERCE_APP_SLUGS];

  if (isMongoConnected()) {
    await OrgApp.bulkWrite(
      slugs.map((slug) => ({
        updateOne: {
          filter: { companyId, appSlug: slug },
          update: { $setOnInsert: { companyId, appSlug: slug, status: "installed", settings: {}, installedAt: new Date() } },
          upsert: true,
        },
      })),
    );
    return;
  }

  for (const slug of slugs) {
    const row = {
      _id: id(),
      companyId,
      appSlug: slug,
      status: "installed",
      settings: {},
      installedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    };
    memoryOrgApps().set(row._id, row);
  }
}

// ─── Navigation ──────────────────────────────────────────────────────────────

function allowedBy(permissions, required) {
  if (!required) return true;
  if (!permissions?.length) return false;
  return permissions.includes("*") || permissions.includes(required);
}

// Builds the sidebar from installed apps intersected with what this person is
// actually allowed to open — replacing the hardcoded NAV_GROUPS array that
// showed every menu item to everyone regardless of role.
//
// Returns the same shape the frontend already renders: a flat list of either
// single items or groups with children, ordered by NAV_GROUP_ORDER.
export async function buildNavigation({ companyId, permissions = [] }) {
  const installed = await listInstalledSlugs(companyId);

  const singles = [];
  const groups = new Map();

  for (const app of APPS) {
    if (!installed.has(app.slug)) continue;

    for (const item of app.nav || []) {
      if (!allowedBy(permissions, item.permission)) continue;

      const entry = { label: item.label, icon: item.icon, href: item.href, app: app.slug };

      if (!item.group) {
        singles.push({ ...entry, single: true, order: NAV_GROUP_ORDER.indexOf(item.label) });
        continue;
      }

      const group = groups.get(item.group) || {
        label: item.group,
        icon: item.groupIcon || app.icon,
        children: [],
        order: NAV_GROUP_ORDER.indexOf(item.group),
      };
      group.children.push(entry);
      groups.set(item.group, group);
    }
  }

  const combined = [
    ...singles,
    ...[...groups.values()].map((group) => ({ ...group, href: group.children[0]?.href })),
  ];

  // Anything not named in NAV_GROUP_ORDER (a future app that forgot to
  // register its position) sorts to the end rather than to the front.
  return combined
    .map((entry) => ({ ...entry, order: entry.order < 0 ? NAV_GROUP_ORDER.length : entry.order }))
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...rest }) => rest);
}
