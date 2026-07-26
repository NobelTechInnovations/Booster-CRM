"use client";

import { Building2, CheckCircle2, FileCheck2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompanyProfile, updateCompanyKyc, updateCompanyProfile } from "@/lib/api";

const emptyCompany = {
  name: "",
  legalName: "",
  email: "",
  phone: "",
  website: "",
  businessType: "",
  gstin: "",
  pan: "",
  address: {
    line1: "",
    line2: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
  },
};

const emptyKyc = {
  legalName: "",
  gstin: "",
  pan: "",
  registeredAddress: "",
  bankAccountName: "",
  bankAccountNumber: "",
  ifsc: "",
};

export function CompanyView({ onCompanyUpdate }) {
  const [company, setCompany] = useState(emptyCompany);
  const [kyc, setKyc] = useState(emptyKyc);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const result = await getCompanyProfile();
        const loadedCompany = { ...emptyCompany, ...result.company, address: { ...emptyCompany.address, ...(result.company.address || {}) } };
        setCompany(loadedCompany);
        setKyc({ ...emptyKyc, ...(result.company.kyc || {}) });
      } catch (caught) {
        setError(caught.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function saveCompany(event) {
    event.preventDefault();
    setSaving("company");
    setMessage("");
    setError("");

    try {
      const result = await updateCompanyProfile(company);
      setCompany({ ...emptyCompany, ...result.company, address: { ...emptyCompany.address, ...(result.company.address || {}) } });
      onCompanyUpdate?.(result.company);
      setMessage("Company details saved");
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving("");
    }
  }

  async function saveKyc(submit) {
    setSaving(submit ? "submit-kyc" : "kyc");
    setMessage("");
    setError("");

    try {
      const result = await updateCompanyKyc({ ...kyc, submit });
      setKyc({ ...emptyKyc, ...(result.company.kyc || {}) });
      onCompanyUpdate?.(result.company);
      setMessage(submit ? "KYC submitted for review" : "KYC draft saved");
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving("");
    }
  }

  if (loading) {
    return <PageShell title="Company" subtitle="Loading company workspace..." />;
  }

  return (
    <PageShell title="Company" subtitle="Manage company profile, legal details, and KYC information.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="teal">Company ID: {company._id || company.id}</Badge>
        <Badge tone={company.kyc?.status === "submitted" || kyc.status === "submitted" ? "amber" : company.kyc?.status === "verified" ? "green" : "slate"}>
          KYC {company.kyc?.status || kyc.status || "not_started"}
        </Badge>
      </div>

      {message ? <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</p> : null}
      {error ? <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Company Details</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">Business profile used across panel, invoices, and channel mapping.</p>
            </div>
            <Building2 className="text-teal-700" size={22} />
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={saveCompany}>
              <Input label="Company name" value={company.name} onChange={(name) => setCompany({ ...company, name })} required />
              <Input label="Legal name" value={company.legalName} onChange={(legalName) => setCompany({ ...company, legalName })} />
              <Input label="Business email" type="email" value={company.email} onChange={(email) => setCompany({ ...company, email })} />
              <Input label="Phone" value={company.phone} onChange={(phone) => setCompany({ ...company, phone })} />
              <Input label="Website" value={company.website} onChange={(website) => setCompany({ ...company, website })} />
              <Select
                label="Business type"
                value={company.businessType}
                onChange={(businessType) => setCompany({ ...company, businessType })}
                options={["", "Proprietorship", "Partnership", "LLP", "Private Limited", "Public Limited", "Other"]}
              />
              <Input label="GSTIN" value={company.gstin} onChange={(gstin) => setCompany({ ...company, gstin })} />
              <Input label="PAN" value={company.pan} onChange={(pan) => setCompany({ ...company, pan })} />
              <Input label="Address line 1" value={company.address.line1} onChange={(line1) => setCompany({ ...company, address: { ...company.address, line1 } })} />
              <Input label="Address line 2" value={company.address.line2} onChange={(line2) => setCompany({ ...company, address: { ...company.address, line2 } })} />
              <Input label="City" value={company.address.city} onChange={(city) => setCompany({ ...company, address: { ...company.address, city } })} />
              <Input label="State" value={company.address.state} onChange={(state) => setCompany({ ...company, address: { ...company.address, state } })} />
              <Input label="Pincode" value={company.address.pincode} onChange={(pincode) => setCompany({ ...company, address: { ...company.address, pincode } })} />
              <Input label="Country" value={company.address.country} onChange={(country) => setCompany({ ...company, address: { ...company.address, country } })} />
              <div className="md:col-span-2">
                <Button disabled={saving === "company"}>
                  <Save size={16} />
                  {saving === "company" ? "Saving" : "Save Company Details"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Full KYC</CardTitle>
              <p className="mt-1 text-sm text-[var(--muted)]">Legal and bank verification details.</p>
            </div>
            <FileCheck2 className="text-teal-700" size={22} />
          </CardHeader>
          <CardContent className="space-y-4">
            <Input label="Legal name as per GST/PAN" value={kyc.legalName} onChange={(legalName) => setKyc({ ...kyc, legalName })} />
            <Input label="GSTIN" value={kyc.gstin} onChange={(gstin) => setKyc({ ...kyc, gstin })} />
            <Input label="PAN" value={kyc.pan} onChange={(pan) => setKyc({ ...kyc, pan })} />
            <Textarea label="Registered address" value={kyc.registeredAddress} onChange={(registeredAddress) => setKyc({ ...kyc, registeredAddress })} />
            <Input label="Bank account name" value={kyc.bankAccountName} onChange={(bankAccountName) => setKyc({ ...kyc, bankAccountName })} />
            <Input label="Bank account number" value={kyc.bankAccountNumber} onChange={(bankAccountNumber) => setKyc({ ...kyc, bankAccountNumber })} />
            <Input label="IFSC" value={kyc.ifsc} onChange={(ifsc) => setKyc({ ...kyc, ifsc })} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => saveKyc(false)} disabled={saving === "kyc"}>
                <Save size={16} />
                Save Draft
              </Button>
              <Button onClick={() => saveKyc(true)} disabled={saving === "submit-kyc"}>
                <CheckCircle2 size={16} />
                Submit KYC
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function PageShell({ title, subtitle, children }) {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <section className="mb-6">
        <Badge tone="teal">Phase 1</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] md:text-base">{subtitle}</p>
      </section>
      {children}
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
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <select
        className="mt-2 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option || "Select"}
          </option>
        ))}
      </select>
    </label>
  );
}

function Textarea({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <textarea
        className="mt-2 min-h-24 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
