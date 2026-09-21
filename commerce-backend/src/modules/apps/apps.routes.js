import { Router } from "express";
import { requireAuth, requirePermission } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import {
  buildNavigation,
  installApp,
  listAppsForCompany,
  uninstallApp,
  updateAppSettings,
} from "../../repositories/app.repo.js";
import {
  createRole,
  deleteRole,
  grantablePermissions,
  listRoles,
  resolvePermissions,
  updateRole,
} from "../../repositories/role.repo.js";
import { listCompanyUsers } from "../../repositories/store.js";
import { listAuditLogs, logAudit, auditActor } from "../../repositories/audit-log.repo.js";
import { APP_CATEGORIES } from "../../config/app-registry.js";

export const appsRoutes = Router();

appsRoutes.use(requireAuth);

// ─── Navigation ──────────────────────────────────────────────────────────────

// The sidebar, built per request from installed apps ∩ this person's
// permissions. Replaces the hardcoded NAV_GROUPS array, which showed every
// menu item to every role.
appsRoutes.get(
  "/nav",
  asyncHandler(async (req, res) => {
    const permissions = await resolvePermissions({ companyId: req.auth.companyId, role: req.auth.role });
    const nav = await buildNavigation({ companyId: req.auth.companyId, permissions });
    res.json({ nav, permissions });
  }),
);

// ─── Catalogue & installation ────────────────────────────────────────────────

appsRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const apps = await listAppsForCompany(req.auth.companyId);
    res.json({ apps, categories: APP_CATEGORIES });
  }),
);

appsRoutes.post(
  "/:slug/install",
  requirePermission("apps:manage"),
  asyncHandler(async (req, res) => {
    const result = await installApp({
      companyId: req.auth.companyId,
      slug: req.params.slug,
      actorUserId: req.auth.sub,
    });
    if (result.error) throw new HttpError(400, result.error);

    await logAudit({
      ...auditActor(req),
      action: "app.install",
      entity: "App",
      entityId: req.params.slug,
      summary: `Installed the ${req.params.slug} app`,
    });

    res.json({ message: "App installed", app: result.app });
  }),
);

appsRoutes.post(
  "/:slug/uninstall",
  requirePermission("apps:manage"),
  asyncHandler(async (req, res) => {
    const result = await uninstallApp({ companyId: req.auth.companyId, slug: req.params.slug });
    if (result.error) throw new HttpError(400, result.error);

    await logAudit({
      ...auditActor(req),
      action: "app.uninstall",
      entity: "App",
      entityId: req.params.slug,
      summary: `Removed the ${req.params.slug} app`,
    });

    res.json({ message: "App removed" });
  }),
);

appsRoutes.put(
  "/:slug/settings",
  requirePermission("apps:manage"),
  asyncHandler(async (req, res) => {
    const result = await updateAppSettings({
      companyId: req.auth.companyId,
      slug: req.params.slug,
      settings: req.body?.settings,
    });
    if (result.error) throw new HttpError(400, result.error);
    res.json({ message: "Settings saved", app: result.app });
  }),
);

// ─── Roles ───────────────────────────────────────────────────────────────────

appsRoutes.get(
  "/roles",
  requirePermission("users:read"),
  asyncHandler(async (req, res) => {
    const [roles, grantable] = await Promise.all([
      listRoles(req.auth.companyId),
      grantablePermissions(req.auth.companyId),
    ]);
    res.json({ roles, grantable });
  }),
);

appsRoutes.post(
  "/roles",
  requirePermission("roles:manage"),
  asyncHandler(async (req, res) => {
    const result = await createRole({
      companyId: req.auth.companyId,
      name: req.body?.name,
      description: req.body?.description,
      permissions: req.body?.permissions,
    });
    if (result.error) throw new HttpError(400, result.error);

    await logAudit({
      ...auditActor(req),
      action: "role.create",
      entity: "Role",
      entityId: result.role.name,
      summary: `Created the "${result.role.name}" role`,
      after: { permissions: result.role.permissions },
    });

    res.status(201).json({ role: result.role });
  }),
);

appsRoutes.patch(
  "/roles/:name",
  requirePermission("roles:manage"),
  asyncHandler(async (req, res) => {
    const before = (await listRoles(req.auth.companyId)).find((role) => role.name === req.params.name);

    const result = await updateRole({
      companyId: req.auth.companyId,
      name: req.params.name,
      description: req.body?.description,
      permissions: req.body?.permissions,
    });
    if (result.error) throw new HttpError(400, result.error);

    await logAudit({
      ...auditActor(req),
      action: "role.update",
      entity: "Role",
      entityId: req.params.name,
      summary: `Changed permissions on the "${req.params.name}" role`,
      before: { permissions: before?.permissions || [] },
      after: { permissions: result.role.permissions },
    });

    res.json({ role: result.role });
  }),
);

appsRoutes.delete(
  "/roles/:name",
  requirePermission("roles:manage"),
  asyncHandler(async (req, res) => {
    const users = await listCompanyUsers({ companyId: req.auth.companyId, actorUserId: req.auth.sub });
    const assignedCount = (users || []).filter((user) => user.role === req.params.name).length;

    const result = await deleteRole({ companyId: req.auth.companyId, name: req.params.name, assignedCount });
    if (result.error) throw new HttpError(400, result.error);

    await logAudit({
      ...auditActor(req),
      action: "role.delete",
      entity: "Role",
      entityId: req.params.name,
      summary: `Deleted the "${req.params.name}" role`,
    });

    res.json({ message: "Role deleted" });
  }),
);

// ─── Audit log ───────────────────────────────────────────────────────────────

appsRoutes.get(
  "/audit",
  requirePermission("audit:read"),
  asyncHandler(async (req, res) => {
    const entries = await listAuditLogs({
      companyId: req.auth.companyId,
      app: req.query.app,
      entity: req.query.entity,
      entityId: req.query.entityId,
      limit: req.query.limit,
      before: req.query.before,
    });
    res.json({ entries });
  }),
);
