"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail } from "lucide-react";
import { useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <div>
            <Badge tone="teal">Phase 1</Badge>
            <CardTitle className="mt-3">Login</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Field icon={Mail} label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
            <Field icon={LockKeyhole} label="Password" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
            {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}
            {companyChoices.length > 0 ? (
              <div className="rounded-lg border border-[var(--line)] bg-slate-50 p-3">
                <p className="text-sm font-semibold">Select company</p>
                <div className="mt-3 space-y-2">
                  {companyChoices.map((company) => (
                    <button
                      className="flex w-full items-center justify-between rounded-md border border-[var(--line)] bg-white px-3 py-2 text-left text-sm hover:border-teal-600"
                      key={company.companyId}
                      type="button"
                      onClick={() => chooseCompany(company.companyId)}
                    >
                      <span>
                        <span className="block font-semibold">{company.companyName}</span>
                        <span className="text-xs text-[var(--muted)]">{company.role}</span>
                      </span>
                      <span className="text-xs font-semibold text-teal-700">Open</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <Button className="w-full" disabled={loading}>
              {loading ? "Logging in" : "Login to Panel"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-[var(--muted)]">
            New company?{" "}
            <Link href="/signup" className="font-semibold text-teal-700">
              Create account
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

function Field({ icon: Icon, label, value, onChange, type }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <span className="relative mt-2 block">
        <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          className="h-11 w-full rounded-md border border-[var(--line)] bg-white pl-10 pr-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
      </span>
    </label>
  );
}
