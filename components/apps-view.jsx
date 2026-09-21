"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  Lock,
  Plus,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { navIcon } from "@/lib/nav-icons";
import { useCommerceStore } from "@/lib/store";
import { usePermissions } from "@/components/can";
import {
  createRole,
  deleteRole,
  getNavigation,
  installApp,
  listApps,
  listRoles,
  uninstallApp,
  updateRole,
} from "@/lib/api";

const TABS = [
  { key: "apps", label: "Apps" },
  { key: "roles", label: "Roles & Permissions" },
];

// ─── Apps ────────────────────────────────────────────────────────────────────

function AppCard({ app, busy, canManage, onToggle }) {
  const Icon = navIcon(app.icon);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
            app.installed ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"
          }`}
        >
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-slate-900">{app.name}</p>
            {app.required ? <Badge tone="slate">Always on</Badge> : null}
            {app.installed && !app.required ? <Badge tone="green">Installed</Badge> : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{app.description}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-[11px] text-slate-400">
          {app.permissions?.length || 0} permission{app.permissions?.length === 1 ? "" : "s"}
        </span>

        {app.required ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            <Lock size={11} /> Required
          </span>
        ) : (
          <Button
            variant={app.installed ? "secondary" : "primary"}
            className="h-8 px-3 text-xs"
            disabled={busy || !canManage}
            onClick={() => onToggle(app)}
            title={canManage ? undefined : "Only someone with app permissions can change this"}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : app.installed ? <X size={13} /> : <Plus size={13} />}
            {app.installed ? "Remove" : "Install"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function AppsTab({ apps, categories, busySlug, canManage, onToggle }) {
  const grouped = useMemo(() => {
    const map = new Map();
    for (const app of apps) {
      const list = map.get(app.category) || [];
      list.push(app);
      map.set(app.category, list);
    }
    return [...map.entries()];
  }, [apps]);

  return (
    <div className="flex flex-col gap-8">
      {grouped.map(([category, list]) => (
        <section key={category} className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            {categories?.[category] || category}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((app) => (
              <AppCard key={app.slug} app={app} busy={busySlug === app.slug} canManage={canManage} onToggle={onToggle} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Roles ───────────────────────────────────────────────────────────────────

function RoleEditor({ role, grantable, busy, canManage, onSave, onDelete }) {
  const [selected, setSelected] = useState(new Set(role.permissions || []));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSelected(new Set(role.permissions || []));
    setDirty(false);
  }, [role]);

  const isOwner = role.name === "Owner";
  const hasAll = selected.has("*");

  function toggle(key) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
    setDirty(true);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-slate-900">{role.name}</p>
            {role.isSystem ? <Badge tone="slate">Built-in</Badge> : <Badge tone="indigo">Custom</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {isOwner
              ? "Full access to everything. This can't be narrowed — a workspace always needs someone who can undo a mistake."
              : role.description || "No description"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dirty && !isOwner ? (
            <Button className="h-8 px-3 text-xs" disabled={busy} onClick={() => onSave(role, [...selected])}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
            </Button>
          ) : null}
          {!role.isSystem && canManage ? (
            <button
              onClick={() => onDelete(role)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              aria-label={`Delete ${role.name}`}
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </div>

      {isOwner || hasAll ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
          <Shield size={13} /> Every permission, including ones from apps installed later.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {grantable.map((group) => (
            <div key={group.app}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.appName}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.permissions.map((permission) => {
                  const active = selected.has(permission.key);
                  return (
                    <button
                      key={permission.key}
                      disabled={!canManage}
                      onClick={() => toggle(permission.key)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-60 ${
                        active
                          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {permission.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function NewRoleForm({ onCreate, busy }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus size={15} /> New role
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          onCreate({ name: name.trim(), description: description.trim(), permissions: [] });
          setName("");
          setDescription("");
          setOpen(false);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="role-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Role name
            </label>
            <input
              id="role-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Centre Head"
              className="h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="role-desc" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Description
            </label>
            <input
              id="role-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Runs one centre and its staff"
              className="h-10 w-full rounded-xl border border-[var(--line)] px-3 text-sm outline-none focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Create role
          </Button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          The role starts with no permissions — tick what it should be able to do once it's created.
        </p>
      </form>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function AppsView() {
  const { setNavigation, setNavPermissions } = useCommerceStore();
  const { can } = usePermissions();
  const canManageApps = can("apps:manage");
  const canManageRoles = can("roles:manage");

  const [tab, setTab] = useState("apps");
  const [apps, setApps] = useState(null);
  const [categories, setCategories] = useState({});
  const [roles, setRoles] = useState(null);
  const [grantable, setGrantable] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busySlug, setBusySlug] = useState("");
  const [busyRole, setBusyRole] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const [appsRes, rolesRes] = await Promise.all([listApps(), listRoles()]);
      setApps(appsRes.apps || []);
      setCategories(appsRes.categories || {});
      setRoles(rolesRes.roles || []);
      setGrantable(rolesRes.grantable || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Installing or removing an app changes the sidebar, so the nav is
  // refetched here rather than waiting for the next full page load.
  async function refreshNav() {
    try {
      const result = await getNavigation();
      setNavigation(result.nav || []);
      setNavPermissions(result.permissions || []);
    } catch (_error) {
      // non-fatal — the menu just updates on next load
    }
  }

  async function toggleApp(app) {
    setBusySlug(app.slug);
    setError("");
    try {
      if (app.installed) await uninstallApp(app.slug);
      else await installApp(app.slug);
      await load();
      await refreshNav();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusySlug("");
    }
  }

  async function saveRole(role, permissions) {
    setBusyRole(role.name);
    setError("");
    try {
      await updateRole(role.name, { permissions });
      await load();
      await refreshNav();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyRole("");
    }
  }

  async function addRole(payload) {
    setBusyRole("__new__");
    setError("");
    try {
      await createRole(payload);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyRole("");
    }
  }

  async function removeRole(role) {
    setBusyRole(role.name);
    setError("");
    try {
      await deleteRole(role.name);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyRole("");
    }
  }

  const installedCount = (apps || []).filter((app) => app.installed).length;

  return (
    <div className="mx-auto max-w-[1920px] px-4 py-4 lg:px-8">
      <section className="mb-6">
        <Badge tone="indigo">Workspace</Badge>
        <h1 className="mt-3 text-2xl tracking-tight text-slate-950 md:text-[24px]">Apps</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Install only what this workspace needs. Removing an app hides it and stops its
          screens loading — it never deletes the data behind it, so reinstalling brings
          everything back exactly as it was.
        </p>
      </section>

      <div className="mb-5 flex items-center gap-1 border-b border-[var(--line)]">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`border-b-2 px-3 pb-2.5 text-sm font-semibold transition ${
              tab === item.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {item.label}
            {item.key === "apps" && apps ? (
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{installedCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : tab === "apps" ? (
        <AppsTab apps={apps || []} categories={categories} busySlug={busySlug} canManage={canManageApps} onToggle={toggleApp} />
      ) : (
        <div className="flex flex-col gap-4">
          {canManageRoles ? <NewRoleForm onCreate={addRole} busy={busyRole === "__new__"} /> : null}
          {(roles || []).map((role) => (
            <RoleEditor
              key={role.name}
              role={role}
              grantable={grantable}
              busy={busyRole === role.name}
              canManage={canManageRoles}
              onSave={saveRole}
              onDelete={removeRole}
            />
          ))}
        </div>
      )}
    </div>
  );
}
