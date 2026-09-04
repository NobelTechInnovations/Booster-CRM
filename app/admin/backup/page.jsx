"use client";

import { useEffect, useState } from "react";
import { DatabaseBackup, Download, FileJson, Loader2, RefreshCcw } from "lucide-react";
import { getBackupSummary, downloadDatabaseBackup } from "@/lib/admin-api";

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
