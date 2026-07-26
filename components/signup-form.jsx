"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <div>
            <Badge tone="green">Owner account</Badge>
            <CardTitle className="mt-3">Sign up</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Field icon={Building2} label="Company name" value={form.companyName} onChange={(companyName) => setForm({ ...form, companyName })} />
            <Field icon={UserRound} label="Your name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
            <Field icon={Mail} label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
            <Field icon={LockKeyhole} label="Password" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
            {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}
            <Button className="w-full" disabled={loading}>
              {loading ? "Creating company" : "Create Company & Enter Panel"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-[var(--muted)]">
            Already registered?{" "}
            <Link href="/login" className="font-semibold text-teal-700">
              Login
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

function Field({ icon: Icon, label, value, onChange, type = "text" }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <span className="relative mt-2 block">
        <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          className="h-11 w-full rounded-md border border-[var(--line)] bg-white pl-10 pr-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
          type={type}
          value={value}
          minLength={type === "password" ? 8 : undefined}
          onChange={(event) => onChange(event.target.value)}
          required
        />
      </span>
    </label>
  );
}
