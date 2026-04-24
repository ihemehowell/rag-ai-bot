"use client";
import { useState } from "react";
import { toast } from "sonner";

type Props = {
  onUploadSuccess: (filename: string) => void;
  activeFile: string | null;
};

export default function UploadPanel({ onUploadSuccess, activeFile }: Props) {
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      onUploadSuccess(data.source);
      setExpanded(false);
      toast.success("Document indexed", {
        description: `\"${data.source}\" uploaded with ${data.chunks} chunks.`,
      });
    } catch (err: unknown) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="mb-3 rounded-xl border border-slate-300/15 bg-slate-900/25 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Document
          </p>
          <p className="max-w-40 truncate text-xs text-slate-300/85">
            {activeFile ? (
              <>
                Active: <span className="font-semibold text-emerald-200">{activeFile}</span>
              </>
            ) : (
              "No file loaded"
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="rounded-md border border-slate-300/25 bg-slate-800/55 px-2.5 py-1.5 text-[11px] font-medium text-slate-100 transition hover:border-teal-300/55 hover:text-teal-200"
          disabled={uploading}
        >
          {uploading ? "Uploading..." : activeFile ? "Replace PDF" : expanded ? "Hide" : "Add PDF"}
        </button>
      </div>

      {expanded && (
        <label className="group mt-2 block cursor-pointer">
          <div className="rounded-md border border-dashed border-slate-300/30 bg-slate-950/35 px-3 py-2 text-xs text-slate-200 transition-colors group-hover:border-teal-300/70 group-hover:bg-slate-900/55">
            {uploading ? "Indexing your document..." : "Click to choose a PDF"}
          </div>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}