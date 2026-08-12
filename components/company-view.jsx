"use client";

import {
  Building2,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Globe,
  Hash,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  address: { line1: "", line2: "", city: "", state: "", pincode: "", country: "India" },
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
  const [activeTab, setActiveTab] = useState("profile");

  useEffect(() => {
    async function load() {
      try {
        const result = await getCompanyProfile();
        const loadedCompany = {
          ...emptyCompany,
          ...result.company,
          address: { ...emptyCompany.address, ...(result.company.address || {}) },
        };
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
      setMessage("Company details saved successfully.");
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
      setMessage(submit ? "KYC submitted for review." : "KYC draft saved.");
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving("");
    }
  }

  const kycStatus = company.kyc?.status || kyc.status || "not_started";

  const tabs = [
    { key: "profile", label: "Company Profile", icon: Building2 },
    { key: "kyc", label: "KYC & Banking", icon: ShieldCheck },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6">
      {/* Header */}
      <section className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge tone="indigo">Company Workspace</Badge>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">Company</h1>
            <p className="mt-1 text-sm text-slate-500">Manage your business profile, legal identity, and banking details.</p>
          </div>

          {/* Company ID card */}
          {(company._id || company.id) && (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 shadow-sm">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50">
                <Building2 size={17} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Company ID</p>
                <p className="text-xs font-mono font-semibold text-slate-700">{String(company._id || company.id).slice(-12)}</p>
              </div>
              <div className="ml-2 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${kycStatus === "verified" ? "bg-emerald-500" : kycStatus === "submitted" ? "bg-amber-500 animate-pulse" : "bg-slate-300"}`} />
                <span className={`text-[11px] font-semibold capitalize ${kycStatus === "verified" ? "text-emerald-700" : kycStatus === "submitted" ? "text-amber-700" : "text-slate-400"}`}>
                  KYC {kycStatus.replace("_", " ")}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Feedback banner */}
      {message && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 size={17} className="shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          ⚠ {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-[var(--line)] bg-slate-50/80 p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition ${
              activeTab === tab.key
                ? "bg-white text-indigo-700 shadow-sm ring-1 ring-[var(--line)]"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">Loading company data...</div>
      ) : activeTab === "profile" ? (
        <form onSubmit={saveCompany}>
          <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
            {/* Main info */}
            <div className="space-y-5">
              <SectionCard title="Business Identity" icon={Building2} desc="Core company name and business type used across the platform.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Company name" value={company.name} onChange={(name) => setCompany({ ...company, name })} required icon={Building2} />
                  <Field label="Legal name" value={company.legalName} onChange={(legalName) => setCompany({ ...company, legalName })} icon={FileCheck2} />
                  <SelectField
                    label="Business type"
                    value={company.businessType}
                    onChange={(businessType) => setCompany({ ...company, businessType })}
                    options={["", "Proprietorship", "Partnership", "LLP", "Private Limited", "Public Limited", "Other"]}
                  />
                  <Field label="Website" value={company.website} onChange={(website) => setCompany({ ...company, website })} icon={Globe} />
                </div>
              </SectionCard>

              <SectionCard title="Contact Details" icon={Phone} desc="Primary contact for this company workspace.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Business email" type="email" value={company.email} onChange={(email) => setCompany({ ...company, email })} icon={Mail} />
                  <Field label="Phone" value={company.phone} onChange={(phone) => setCompany({ ...company, phone })} icon={Phone} />
                </div>
              </SectionCard>

              <SectionCard title="Registered Address" icon={MapPin} desc="Physical address of your business.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Address line 1" value={company.address.line1} onChange={(line1) => setCompany({ ...company, address: { ...company.address, line1 } })} />
                  <Field label="Address line 2" value={company.address.line2} onChange={(line2) => setCompany({ ...company, address: { ...company.address, line2 } })} />
                  <Field label="City" value={company.address.city} onChange={(city) => setCompany({ ...company, address: { ...company.address, city } })} />
                  <Field label="State" value={company.address.state} onChange={(state) => setCompany({ ...company, address: { ...company.address, state } })} />
                  <Field label="Pincode" value={company.address.pincode} onChange={(pincode) => setCompany({ ...company, address: { ...company.address, pincode } })} />
                  <Field label="Country" value={company.address.country} onChange={(country) => setCompany({ ...company, address: { ...company.address, country } })} />
                </div>
              </SectionCard>
            </div>

            {/* Side panel */}
            <div className="space-y-5">
              <SectionCard title="Tax Identifiers" icon={Hash} desc="GSTIN and PAN linked to your company.">
                <div className="space-y-4">
                  <Field label="GSTIN" value={company.gstin} onChange={(gstin) => setCompany({ ...company, gstin })} icon={Hash} />
                  <Field label="PAN" value={company.pan} onChange={(pan) => setCompany({ ...company, pan })} icon={Hash} />
                </div>
              </SectionCard>

              {/* Quick facts */}
              <div className="rounded-xl border border-[var(--line)] bg-gradient-to-br from-indigo-50 to-white p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-indigo-700">Workspace summary</p>
                <dl className="space-y-2 text-sm">
                  {[
                    { label: "Name", value: company.name || "—" },
                    { label: "Type", value: company.businessType || "—" },
                    { label: "GST", value: company.gstin || "—" },
                    { label: "City", value: company.address.city || "—" },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between">
                      <dt className="font-semibold text-slate-500">{item.label}</dt>
                      <dd className="font-medium text-slate-800">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Button disabled={saving === "company"} className="h-11 px-6">
              <Save size={16} />
              {saving === "company" ? "Saving..." : "Save Company Details"}
            </Button>
          </div>
        </form>
      ) : (
        /* KYC Tab */
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <SectionCard title="Legal Identity" icon={FileCheck2} desc="Business name and tax IDs as they appear in official documents.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Legal name as per GST/PAN" value={kyc.legalName} onChange={(legalName) => setKyc({ ...kyc, legalName })} />
                <Field label="GSTIN" value={kyc.gstin} onChange={(gstin) => setKyc({ ...kyc, gstin })} icon={Hash} />
                <Field label="PAN" value={kyc.pan} onChange={(pan) => setKyc({ ...kyc, pan })} icon={Hash} />
              </div>
              <div className="mt-4">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5">Registered address</label>
                <textarea
                  className="min-h-20 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-3 focus:ring-indigo-100"
                  value={kyc.registeredAddress || ""}
                  onChange={(e) => setKyc({ ...kyc, registeredAddress: e.target.value })}
                  placeholder="Full registered address..."
                />
              </div>
            </SectionCard>

            <SectionCard title="Bank Account" icon={CreditCard} desc="Verified bank account for payouts and settlements.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Account holder name" value={kyc.bankAccountName} onChange={(bankAccountName) => setKyc({ ...kyc, bankAccountName })} />
                <Field label="Account number" value={kyc.bankAccountNumber} onChange={(bankAccountNumber) => setKyc({ ...kyc, bankAccountNumber })} />
                <Field label="IFSC code" value={kyc.ifsc} onChange={(ifsc) => setKyc({ ...kyc, ifsc })} />
              </div>
            </SectionCard>
          </div>

          {/* KYC status panel */}
          <div className="space-y-5">
            <div className="rounded-xl border border-[var(--line)] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className={`grid h-11 w-11 place-items-center rounded-xl ${
                  kycStatus === "verified" ? "bg-emerald-100 text-emerald-600" :
                  kycStatus === "submitted" ? "bg-amber-100 text-amber-600" :
                  "bg-slate-100 text-slate-400"
                }`}>
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">KYC Status</p>
                  <p className={`text-sm font-semibold capitalize ${
                    kycStatus === "verified" ? "text-emerald-700" :
                    kycStatus === "submitted" ? "text-amber-700" :
                    "text-slate-400"
                  }`}>
                    {kycStatus.replace("_", " ")}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                {[
                  { label: "Legal name", value: kyc.legalName },
                  { label: "GSTIN", value: kyc.gstin },
                  { label: "PAN", value: kyc.pan },
                  { label: "Bank", value: kyc.bankAccountName },
                  { label: "IFSC", value: kyc.ifsc },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between border-b border-slate-50 pb-2 last:border-0">
                    <span className="font-semibold text-slate-500">{row.label}</span>
                    <span className="font-medium text-slate-800">{row.value || <span className="text-slate-300">—</span>}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button variant="secondary" onClick={() => saveKyc(false)} disabled={saving === "kyc"} className="h-11">
                <Save size={15} />
                {saving === "kyc" ? "Saving..." : "Save Draft"}
              </Button>
              <Button onClick={() => saveKyc(true)} disabled={saving === "submit-kyc"} className="h-11">
                <CheckCircle2 size={15} />
                {saving === "submit-kyc" ? "Submitting..." : "Submit KYC for Verification"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, icon: Icon, desc, children }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-3 border-b border-slate-50 pb-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50">
          <Icon size={17} className="text-indigo-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {desc && <p className="text-xs text-slate-500">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required = false, icon: Icon }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="relative">
        {Icon && <Icon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />}
        <input
          className={`h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-indigo-500 focus:bg-white focus:ring-3 focus:ring-indigo-100 ${Icon ? "pl-9" : "px-3.5"} pr-3.5`}
          type={type}
          value={value || ""}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <select
        className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] px-3.5 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:bg-white focus:ring-3 focus:ring-indigo-100"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option || "Select type..."}</option>
        ))}
      </select>
    </label>
  );
}
