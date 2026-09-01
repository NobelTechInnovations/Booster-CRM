"use client";

import { useRef, useState } from "react";
import { Paperclip, X, FileText } from "lucide-react";
import { uploadWhatsAppMedia } from "@/lib/api";

const MAX_MB = 4;

// Uploads a real file straight to Meta's WhatsApp media store (not this
// app's own storage) as soon as it's picked, and hands the caller back
// {mediaId, mediaType, fileName} to attach to a send — replaces the old
// "paste an image/file URL" input, which only worked for files already
// hosted somewhere public.
export function AttachmentPicker({ attachment, onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again later
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`That file is larger than ${MAX_MB}MB — pick a smaller one.`);
      return;
    }
    setError("");
    setUploading(true);
    try {
      const res = await uploadWhatsAppMedia(file);
      onChange({ mediaId: res.mediaId, mediaType: res.mediaType, fileName: file.name });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (attachment) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-slate-50 px-3 py-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-slate-700">
          <FileText size={13} className="shrink-0" />
          <span className="truncate">{attachment.fileName}</span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="shrink-0 text-slate-400 hover:text-rose-600">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 hover:underline disabled:opacity-50"
      >
        <Paperclip size={11} />
        {uploading ? "Uploading…" : `Attach a file (up to ${MAX_MB}MB)`}
      </button>
      {error ? <p className="mt-1 text-[11px] font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
