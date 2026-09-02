"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, LockKeyhole, Mail, ShieldAlert } from "lucide-react";
import { adminLogin } from "@/lib/admin-api";

// Deliberately dark/slate — visually distinct from the company panel's own
// (indigo/white) theme at a glance, so this is never confusable with a
// company view in a screenshot or over someone's shoulder.
export function AdminLoginForm() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await adminLogin(form.email, form.password);
      router.push("/admin");
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-7">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-400">
            <ShieldAlert size={12} />
            Platform Admin
          </div>
          <h2 className="text-[1.5rem] font-bold tracking-tight text-white">Admin sign in</h2>
          <p className="mt-1 text-sm text-slate-400">Not for company accounts — internal use only.</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
            <span className="relative block">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="admin@yourdomain.com"
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-3.5 text-sm font-medium text-white outline-none transition placeholder:font-normal placeholder:text-slate-500 focus:border-amber-500 focus:ring-3 focus:ring-amber-500/20"
              />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
            <span className="relative block">
              <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-3.5 text-sm font-medium text-white outline-none transition placeholder:font-normal placeholder:text-slate-500 focus:border-amber-500 focus:ring-3 focus:ring-amber-500/20"
              />
            </span>
          </label>

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm font-medium text-rose-300">
              <span className="mt-0.5 shrink-0">⚠</span>
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                Signing in...
              </span>
            ) : (
              <>
                Sign in
                <ChevronRight size={17} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
