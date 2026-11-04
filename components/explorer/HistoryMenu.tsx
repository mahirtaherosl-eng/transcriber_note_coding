"use client";

import { useEffect, useState } from "react";
import { Download, History, Loader2, RotateCcw } from "lucide-react";
import { formatDate, historyDownloadUrl, listHistory } from "@/lib/client/api";
import { languageLabel } from "@/lib/languages";
import type { HistoryEntry, Job } from "@/lib/transcript/schema";

type Props = {
  id: string;
  job: Job;
  onRestore: (version: string) => Promise<void>;
};

export default function HistoryMenu({ id, job, onRestore }: Props) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmVersion, setConfirmVersion] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const running = job.status === "queued" || job.status === "processing";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listHistory(id)
      .then((next) => {
        if (!cancelled) setEntries(next);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load versions.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, id, job.status, reloadKey]);

  const restore = async (version: string) => {
    setRestoring(version);
    setError(null);
    try {
      await onRestore(version);
      setConfirmVersion(null);
      setReloadKey((key) => key + 1);
    } catch (restoreError) {
      setError(
        restoreError instanceof Error ? restoreError.message : "Could not restore this version.",
      );
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-xs text-fog transition hover:border-accent/50 hover:text-paper"
      >
        <History size={14} /> Versions
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-edge bg-panel shadow-xl">
          <div className="border-b border-edge-soft px-3 py-2 text-[11px] text-fog-dim">
            Previous transcripts are kept until this conversation is deleted.
          </div>

          {loading && (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-fog">
              <Loader2 size={13} className="animate-spin" /> Loading versions…
            </div>
          )}

          {error && <p className="px-3 py-3 text-[11px] text-danger">{error}</p>}

          {!loading && entries.length === 0 && (
            <p className="px-3 py-4 text-xs text-fog-dim">
              No previous versions yet. Re-transcribe to create one.
            </p>
          )}

          {entries.map((entry) => (
            <div key={entry.version} className="border-b border-edge-soft px-3 py-2.5 last:border-b-0">
              <div className="text-[11px] text-paper">{formatDate(entry.transcribedAt)}</div>
              <div className="mt-0.5 truncate text-[10px] text-fog-dim">
                {entry.provider} / {entry.model}
              </div>
              <div className="mt-0.5 text-[10px] text-fog-dim">
                {languageLabel(entry.requestedLanguage)} · {entry.segmentCount} lines ·{" "}
                {entry.speakerCount} speaker{entry.speakerCount === 1 ? "" : "s"}
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <a
                  href={historyDownloadUrl(id, entry.version)}
                  className="inline-flex items-center gap-1 rounded border border-edge px-1.5 py-1 text-[10px] text-fog transition hover:border-accent/50 hover:text-paper"
                >
                  <Download size={11} /> Download
                </a>

                {confirmVersion === entry.version ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void restore(entry.version)}
                      disabled={restoring !== null}
                      className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-1 text-[10px] font-medium text-[#07101c] disabled:opacity-60"
                    >
                      {restoring === entry.version ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <RotateCcw size={11} />
                      )}
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmVersion(null)}
                      className="text-[10px] text-fog-dim hover:text-paper"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmVersion(entry.version)}
                    disabled={running}
                    title={running ? "Wait for the current run to finish." : undefined}
                    className="inline-flex items-center gap-1 rounded border border-edge px-1.5 py-1 text-[10px] text-fog transition hover:border-accent/50 hover:text-paper disabled:opacity-50"
                  >
                    <RotateCcw size={11} /> Restore
                  </button>
                )}
              </div>

              {confirmVersion === entry.version && (
                <p className="mt-1 text-[10px] text-amber-200/80">
                  The current version is archived first, so this is reversible.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
