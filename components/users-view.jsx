"use client";

import { Save, UserPlus, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createUser, listUsers, updateUser } from "@/lib/api";

const roleOptions = ["Owner", "Admin", "Manager", "Support", "Warehouse", "Marketing", "Accountant"];

const roleNotes = {
  Owner: "Full access to company, users, settings, and every module.",
  Admin: "Manage company setup, users, channels, orders, inventory, and reports.",
  Manager: "Operate dashboard, orders, inventory read, channels read, and reports.",
  Support: "Handle customers and order updates.",
  Warehouse: "Pack orders, manage inventory, and shipping.",
  Marketing: "Manage ads, CRM, channels read, and reports.",
  Accountant: "Manage finance, reports, and order read access.",
};

export function UsersView() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "Manager" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadUsers() {
    const result = await listUsers();
    setUsers(result.users || []);
  }

  useEffect(() => {
    async function load() {
      try {
        await loadUsers();
      } catch (caught) {
        setError(caught.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function createTeamUser(event) {
    event.preventDefault();
    setSaving("create");
    setMessage("");
    setError("");

    try {
      await createUser(form);
      setForm({ name: "", email: "", password: "", role: "Manager" });
      await loadUsers();
      setMessage("User created and mapped to this company");
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving("");
    }
  }

  async function saveUser(user) {
    setSaving(user.id || user._id);
    setMessage("");
    setError("");

    try {
      await updateUser(user.id || user._id, { role: user.role, status: user.status });
      await loadUsers();
      setMessage("User role/status updated");
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <section className="mb-6">
        <Badge tone="teal">Phase 1</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">Users, Roles & Permissions</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] md:text-base">
          Create multiple users under the same company and assign role-based permissions.
        </p>
      </section>

      {message ? <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</p> : null}
      {error ? <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Create User</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">New user gets login access to this company only.</p>
            </div>
            <UserPlus className="text-teal-700" size={22} />
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={createTeamUser}>
              <Input label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} required />
              <Input label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
              <Input label="Password" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required />
              <Select label="Role" value={form.role} onChange={(role) => setForm({ ...form, role })} options={roleOptions} />
              <p className="rounded-md bg-slate-50 p-3 text-sm leading-6 text-[var(--muted)]">{roleNotes[form.role]}</p>
              <Button className="w-full" disabled={saving === "create"}>
                <UserPlus size={16} />
                {saving === "create" ? "Creating" : "Create User"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Company Users</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">Manage existing users, role, and access status.</p>
            </div>
            <UsersRound className="text-teal-700" size={22} />
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? <p className="text-sm text-[var(--muted)]">Loading users...</p> : null}
            {!loading && users.length === 0 ? <p className="text-sm text-[var(--muted)]">No users yet.</p> : null}
            {users.map((user) => (
              <UserRow key={user.id || user._id} user={user} onChange={setUsers} onSave={saveUser} saving={saving === (user.id || user._id)} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UserRow({ user, onChange, onSave, saving }) {
  function patchUser(patch) {
    onChange((users) => users.map((entry) => ((entry.id || entry._id) === (user.id || user._id) ? { ...entry, ...patch } : entry)));
  }

  return (
    <div className="grid gap-3 rounded-lg border border-[var(--line)] p-3 lg:grid-cols-[1fr_180px_140px_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{user.name}</p>
          <Badge tone={user.status === "active" ? "green" : "slate"}>{user.status}</Badge>
          {user.isPrimaryOwner ? <Badge tone="teal">Primary owner</Badge> : null}
          {user.isSelf ? <Badge tone="blue">You</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">{user.email}</p>
        {!user.canEdit ? <p className="mt-1 text-xs font-semibold text-slate-500">Role/status locked for this account.</p> : null}
      </div>
      <Select label="Role" value={user.role} onChange={(role) => patchUser({ role })} options={roleOptions} compact disabled={!user.canEdit} />
      <Select label="Status" value={user.status} onChange={(status) => patchUser({ status })} options={["active", "disabled"]} compact disabled={!user.canEdit} />
      <Button variant="secondary" onClick={() => onSave(user)} disabled={saving || !user.canEdit}>
        <Save size={16} />
        Save
      </Button>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input
        className="mt-2 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
        type={type}
        value={value || ""}
        required={required}
        minLength={type === "password" ? 8 : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Select({ label, value, onChange, options, compact = false, disabled = false }) {
  return (
    <label className="block">
      <span className={compact ? "sr-only" : "text-sm font-semibold"}>{label}</span>
      <select
        className={compact ? "h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-teal-700" : "mt-2 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"}
        value={value || ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
