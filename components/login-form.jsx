"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, LockKeyhole, Mail } from "lucide-react";
import { useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { loginCompany } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [companyChoices, setCompanyChoices] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitLogin(payload) {
    const result = await loginCompany(payload);
    if (result.requiresCompanySelection) {
      setCompanyChoices(result.companies || []);
      return;
    }
    router.push("/panel");
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await submitLogin(form);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }

  async function chooseCompany(companyId) {
    setError("");
    setLoading(true);
    try {
      await submitLogin({ ...form, companyId });
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Company login"
      title="Welcome back to your control panel."
      text="Login with the owner or team account email and password created during company signup."
    >
      <div
        className="w-full rounded-2xl border border-[var(--line)] bg-white p-8 shadow-[0_8px_40px_-12px_rgba(11,21,51,0.12)]"
      >
        {/* Header */}
        <div className="mb-7">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            Secure login
          </div>
          <h2 className="text-[1.5rem] font-extrabold tracking-tight text-slate-950">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Access your operations panel</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <Field
            icon={Mail}
            label="Email address"
            type="email"
            placeholder="you@company.com"
            value={form.email}
            onChange={(email) => setForm({ ...form, email })}
          />
          <Field
            icon={LockKeyhole}
            label="Password"
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={(password) => setForm({ ...form, password })}
          />

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
              <span className="mt-0.5 shrink-0 text-rose-400">⚠</span>
              {error}
            </div>
          ) : null}

          {/* Company chooser — shown when one email has multiple companies */}
          {companyChoices.length > 0 ? (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Select your company workspace</p>
              <div className="space-y-2">
                {companyChoices.map((company) => (
                  <button
                    key={company.companyId}
                    className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-left text-sm transition hover:border-indigo-400 hover:shadow-sm"
                    type="button"
                    onClick={() => chooseCompany(company.companyId)}
                    disabled={loading}
                  >
                    <span>
                      <span className="block font-bold text-slate-900">{company.companyName}</span>
                      <span className="text-xs text-slate-500">{company.role}</span>
                    </span>
                    <ChevronRight size={16} className="text-indigo-600" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <Button className="mt-1 h-11 w-full text-sm font-semibold" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Signing in...
              </span>
            ) : (
              <>
                Login to Panel
                <ChevronRight size={17} />
              </>
            )}
          </Button>
        </form>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-100" />
          <span className="text-xs font-medium text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-100" />
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          New company?{" "}
          <Link href="/signup" className="font-semibold text-indigo-700 hover:underline">
            Create account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

function Field({ icon: Icon, label, type, placeholder, value, onChange }) {
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
          onChange={(event) => onChange(event.target.value)}
          required
        />
      </span>
    </label>
  );
}
