"use client";

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import type { Job } from "@/lib/transcript/schema";

type Props = {
  job: Job;
  onCancel: () => void;
  onRetry: () => void;
};

export default function JobStatusBanner({ job, onCancel, onRetry }: Props) {
  const processing = job.status === "queued" || job.status === "processing";

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-edge-soft bg-panel-2/60 px-4 py-2 text-xs">
      {processing ? (
        <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
      ) : (
        <AlertTriangle size={14} className="shrink-0 text-amber-300" />
      )}

      <span className="text-fog">
        {processing
          ? job.progress ?? "Waiting for the provider…"
          : job.status === "cancelled"
            ? "Re-transcription cancelled."
            : "Re-transcription failed."}
      </span>

      {processing && (
        <span className="text-fog-dim">Showing the previous transcript, read-only.</span>
      )}

      {!processing && job.error && (
        <span className="min-w-0 truncate text-danger/90">{job.error}</span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {processing ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-edge px-2 py-1 text-[11px] text-fog transition hover:border-danger/40 hover:text-danger"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-[#07101c]"
          >
            <RefreshCw size={11} /> Retry
          </button>
        )}
      </div>
    </div>
  );
}
