"use client";

import { useEffect, useMemo, useState } from "react";
import { DatabaseBackup, Download, FileJson, Loader2, RefreshCcw, Building2, Inbox } from "lucide-react";
import {
  getBackupSummary,
  downloadDatabaseBackup,
  listAdminCompanies,
  getCompanyBackupSummary,
  downloadCompanyBackup,
  listPendingDataExportRequests,
  approveDataExportRequest,
  rejectDataExportRequest,
} from "@/lib/admin-api";

// Companies with a pending self-service data-export request — approving one
// here is what unlocks that company's own download button (see
// components/company-view.jsx's "Data & Backup" tab).
function PendingDataExportRequests() {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setIsLoading(true);
    try {
      setRequests((await listPendingDataExportRequests()).requests || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function approve(id) {
    setBusyId(id);
    setError("");
    try {
      await approveDataExportRequest(id);
      setRequests((prev) => prev.filter((r) => r._id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function reject(id) {
    const reason = window.prompt("Reason for rejecting this data export request?");
    if (!reason || !reason.trim()) return;
    setBusyId(id);
    setError("");
    try {
      await rejectDataExportRequest(id, reason.trim());
      setRequests((prev) => prev.filter((r) => r._id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  if (isLoading || !requests.length) return null;

  return (
    <div className="mb-6 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Inbox size={15} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-white">Pending Data Export Requests ({requests.length})</h2>
      </div>
      {error ? <p className="mb-2 text-xs font-medium text-rose-300">{error}</p> : null}
      <div className="space-y-2">
        {requests.map((r) => (
          <div key={r._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{r.companyName}</p>
              <p className="text-xs text-slate-400">Requested {r.requestedAt ? new Date(r.requestedAt).toLocaleString("en-IN") : "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => reject(r._id)}
                disabled={busyId === r._id}
                className="rounded-lg border border-rose-500/30 px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={() => approve(r._id)}
                disabled={busyId === r._id}
                className="rounded-lg bg-emerald-500/90 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {busyId === r._id ? "…" : "Approve"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Ad-hoc per-company backup — independent of the request/approval flow
// above (an admin already has full DB access; this is a scoped convenience
// view over the exact same per-company export the company itself gets once
// its own request is approved).
function CompanyBackupPicker() {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listAdminCompanies().then((res) => setCompanies(res.companies || [])).catch(() => { });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return companies.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.ownerEmail || "").toLowerCase().includes(q)).slice(0, 8);
  }, [companies, search]);

  const selected = companies.find((c) => c._id === selectedId);

  async function selectCompany(company) {
    setSelectedId(company._id);
    setSearch(company.name);
    setSummary(null);
    setError("");
    setIsLoading(true);
    try {
      setSummary(await getCompanyBackupSummary(company._id));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setError("");
    try {
      const { blob, filename } = await downloadCompanyBackup(selectedId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  const totalDocs = (summary?.collections || []).reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Building2 size={15} className="text-slate-400" />
        <h2 className="text-sm font-semibold text-white">Per-Company Backup</h2>
      </div>
      <div className="relative max-w-sm">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedId(""); setSummary(null); }}
          placeholder="Search company or owner email…"
          className="h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-500"
        />
        {search.trim() && !selectedId && filtered.length > 0 ? (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-xl">
            {filtered.map((c) => (
              <button
                key={c._id}
                onClick={() => selectCompany(c)}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-700"
              >
                <span className="text-sm font-medium text-white">{c.name}</span>
                <span className="text-xs text-slate-400">{c.ownerEmail || "—"}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-xs font-medium text-rose-300">{error}</p> : null}

      {selected ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-800/60 px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-white">{selected.name}</p>
            {isLoading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : summary ? (
              <p className="text-xs text-slate-400">{summary.collections?.length ?? 0} collections · {totalDocs.toLocaleString("en-IN")} documents</p>
            ) : null}
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading || isLoading}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {downloading ? "Preparing…" : "Download This Company's Data (.zip)"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminBackupPage() {
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  async function loadSummary() {
    setIsLoading(true);
    setError("");
    try {
      setSummary(await getBackupSummary());
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadSummary(); }, []);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError("");
    try {
      const { blob, filename } = await downloadDatabaseBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  const totalDocs = (summary?.collections || []).reduce((sum, c) => sum + c.count, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Database Backup</h1>
          <p className="mt-1 text-sm text-slate-400">Download a full snapshot of every collection as one .zip file.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSummary}
            disabled={isLoading}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-300 transition hover:border-slate-600 disabled:opacity-50"
          >
            <RefreshCcw size={13} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading || isLoading || !!error}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {downloading ? "Preparing backup…" : "Download Full Backup (.zip)"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300">{error}</div>
      ) : null}
      {downloadError ? (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300">{downloadError}</div>
      ) : null}

      <PendingDataExportRequests />
      <CompanyBackupPicker />

      <h2 className="mb-3 text-sm font-semibold text-white">Whole Database</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-2 text-slate-400">
            <DatabaseBackup size={14} />
            <span className="text-xs font-semibold uppercase tracking-wide">Collections</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{summary?.collections?.length ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-2 text-slate-400">
            <FileJson size={14} />
            <span className="text-xs font-semibold uppercase tracking-wide">Total documents</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{totalDocs.toLocaleString("en-IN")}</p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-xs leading-5 text-slate-400">
        The .zip contains one JSON file per collection plus a <code className="rounded bg-slate-800 px-1 py-0.5 text-indigo-300">_manifest.json</code> listing
        what was exported and when. Fields marked secret in the schema (API keys, access tokens, admin password hashes) are excluded from every export —
        this is a data backup, not a credentials export.
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Collections</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : !summary?.collections?.length ? (
          <div className="p-8 text-center text-sm text-slate-500">No collections found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Collection</th>
                  <th className="px-5 py-3 text-right">Documents</th>
                </tr>
              </thead>
              <tbody>
                {summary.collections.map((c) => (
                  <tr key={c.collection} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-300">{c.collection}</td>
                    <td className="px-5 py-2.5 text-right text-slate-400">{c.count.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
