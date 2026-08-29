"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { signupCompany } from "@/lib/api";

export function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({ companyName: "", name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signupCompany(form);
      router.push("/panel");
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Create company"
      title="Start with a company workspace."
      text="Signup creates the company, maps you as Owner, and opens the operations panel with full permissions."
    >
      <div className="w-full rounded-2xl border border-[var(--line)] bg-white p-8 shadow-[0_8px_40px_-12px_rgba(11,21,51,0.12)]">
        {/* Header */}
        <div className="mb-7">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Owner account
          </div>
          <h2 className="text-[1.5rem] font-bold tracking-tight text-slate-950">Create workspace</h2>
          <p className="mt-1 text-sm text-slate-500">Set up your brand's command centre</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <Field
            icon={Building2}
            label="Company name"
            placeholder="Wokbook."
            value={form.companyName}
            onChange={(companyName) => setForm({ ...form, companyName })}
          />
          <Field
            icon={UserRound}
            label="Your name"
            placeholder="Full name"
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              icon={Mail}
              label="Work email"
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={(email) => setForm({ ...form, email })}
            />
            <Field
              icon={LockKeyhole}
              label="Password"
              type="password"
              placeholder="Min. 8 chars"
              value={form.password}
              onChange={(password) => setForm({ ...form, password })}
              minLength={8}
            />
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
              <span className="mt-0.5 shrink-0 text-rose-400">⚠</span>
              {error}
            </div>
          ) : null}

          <Button className="mt-1 h-11 w-full text-sm font-semibold" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Creating workspace...
              </span>
            ) : (
              <>
                Create Company & Enter Panel
                <ChevronRight size={17} />
              </>
            )}
          </Button>
        </form>

        {/* Trust signals */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {["Role-based access", "Instant setup", "Multi-channel"].map((t) => (
            <div key={t} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-center text-[10px] font-semibold text-slate-500">
              {t}
            </div>
          ))}
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-indigo-700 hover:underline">
            Login
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

function Field({ icon: Icon, label, type = "text", placeholder, value, onChange, minLength }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      <span className="relative block">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
        <input
          className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] pl-10 pr-3.5 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-3 focus:ring-indigo-100"
          type={type}
          placeholder={placeholder}
          value={value}
          minLength={minLength}
          onChange={(event) => onChange(event.target.value)}
          required
        />
      </span>
    </label>
  );
}
