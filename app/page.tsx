"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  FileAudio,
  FolderOpen,
  Languages,
  Loader2,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import {
  deleteTranscription,
  formatBytes,
  formatDate,
  importTranscript,
  listTranscriptions,
  uploadAudio,
} from "@/lib/client/api";
import { formatClock } from "@/lib/format";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import { PROVIDER_OPTIONS, providerLabel } from "@/lib/providers/catalog";
import type { Job } from "@/lib/transcript/schema";

const ACCEPTED_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".mp4",
  ".webm",
  ".ogg",
  ".oga",
  ".opus",
  ".flac",
  ".aac",
  ".aif",
  ".aiff",
  ".mov",
];

function isTranscriptFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".json");
}

function isLikelyAudio(file: File): boolean {
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) return true;
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

const STATUS_LABEL: Record<Job["status"], string> = {
  queued: "Queued",
  processing: "Transcribing",
  completed: "Ready",
  failed: "Failed",
  interrupted: "Interrupted",
  cancelled: "Cancelled",
};

function statusClass(status: Job["status"]): string {
  switch (status) {
    case "completed":
      return "text-ok border-ok/30 bg-ok/10";
    case "failed":
      return "text-danger border-danger/30 bg-danger/10";
    case "interrupted":
    case "cancelled":
      return "text-amber-300 border-amber-300/30 bg-amber-300/10";
    default:
      return "text-accent border-accent/30 bg-accent/10";
  }
}

export default function HomePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [defaultProvider, setDefaultProvider] = useState<string>("mock");
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("auto");
  const [numSpeakers, setNumSpeakers] = useState("");
  const [provider, setProvider] = useState("auto");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listTranscriptions();
      setJobs(data.jobs);
      if (data.defaultProvider) setDefaultProvider(data.defaultProvider);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load recent transcriptions.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFile = useCallback(
    async (nextFile: File) => {
      setError(null);
      setNotice(null);

      if (isTranscriptFile(nextFile)) {
        setBusy(true);
        try {
          const { id } = await importTranscript(nextFile);
          router.push(`/c/${id}`);
        } catch (importError) {
          setError(importError instanceof Error ? importError.message : "Import failed.");
          setBusy(false);
        }
        return;
      }

      if (!isLikelyAudio(nextFile)) {
        setError("That does not look like an audio file. Try mp3, wav, m4a, mp4, webm, ogg, or flac.");
        return;
      }

      setFile(nextFile);
    },
    [router],
  );

  const startUpload = async () => {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const speakers = Number(numSpeakers);
      const { id } = await uploadAudio({
        file,
        language,
        numSpeakers: Number.isInteger(speakers) && speakers > 1 ? speakers : undefined,
        provider: provider === "auto" ? undefined : provider,
        onProgress: setProgress,
      });
      router.push(`/c/${id}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
      setBusy(false);
      setProgress(null);
    }
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) void handleFile(dropped);
  };

  const removeJob = async (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm("Delete this transcription and its audio?")) return;
    try {
      await deleteTranscription(id);
      setJobs((current) => current.filter((job) => job.id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed.");
    }
  };

  const languageOptions = useMemo(
    () => LANGUAGES.map((entry) => ({ value: entry.id, label: entry.nativeLabel ? `${entry.label} — ${entry.nativeLabel}` : entry.label })),
    [],
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-14">
      <header className="mb-10 flex items-start justify-between gap-6">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1 text-xs text-fog">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Local-only · your audio stays on this machine
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-paper">
            Read the conversation.
            <span className="text-fog"> Hear the moment.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fog">
            Upload a recording and get a speaker-labelled transcript you can search, play, and correct —
            in Cantonese, English, Bengali, and more.
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-edge bg-panel/80 p-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur">
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
            dragging
              ? "border-accent bg-accent-soft/60"
              : "border-edge bg-panel-2/40 hover:border-accent/60 hover:bg-panel-2/70"
          }`}
        >
          <div className="mb-4 rounded-full border border-edge bg-panel p-3 text-accent">
            {file ? <FileAudio size={26} /> : <UploadCloud size={26} />}
          </div>
          {file ? (
            <>
              <div className="text-base font-medium text-paper">{file.name}</div>
              <div className="mt-1 text-xs text-fog">{formatBytes(file.size)} · click to choose another file</div>
            </>
          ) : (
            <>
              <div className="text-base font-medium text-paper">Drop an audio conversation here</div>
              <div className="mt-1 text-xs text-fog">
                mp3, wav, m4a, mp4, webm, ogg, flac · up to 4 hours
              </div>
              <div className="mt-4 text-xs text-fog-dim">
                or drag in a <span className="font-mono text-fog">.transcript.json</span> to reopen a saved transcript
              </div>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={`audio/*,video/mp4,${ACCEPTED_EXTENSIONS.join(",")}`}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) void handleFile(selected);
            event.target.value = "";
          }}
        />
        <input
          ref={importInputRef}
          type="file"
          className="hidden"
          accept=".json,application/json"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) void handleFile(selected);
            event.target.value = "";
          }}
        />

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fog">
              <Languages size={13} /> Language
            </span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-paper outline-none focus:border-accent"
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fog">
              <Users size={13} /> Speakers <span className="text-fog-dim">(optional)</span>
            </span>
            <input
              type="number"
              min={2}
              max={32}
              value={numSpeakers}
              onChange={(event) => setNumSpeakers(event.target.value)}
              placeholder="Auto-detect"
              className="w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-paper outline-none placeholder:text-fog-dim focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fog">
              <FileAudio size={13} /> Engine
            </span>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-paper outline-none focus:border-accent"
            >
              <option value="auto">Auto ({providerLabel(defaultProvider)})</option>
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {defaultProvider === "mock" && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/25 bg-amber-300/5 px-3 py-2 text-xs text-amber-200/90">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              No <span className="font-mono">ELEVENLABS_API_KEY</span> found, so uploads will use the offline
              mock transcript. Add the key to <span className="font-mono">.env.local</span> and restart the
              dev server for real transcription.
            </span>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-xs text-fog transition hover:border-accent/50 hover:text-paper"
          >
            <FolderOpen size={14} /> Open a saved transcript
          </button>

          <div className="flex items-center gap-3">
            {progress !== null && (
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-edge">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
            <button
              type="button"
              disabled={!file || busy}
              onClick={() => void startUpload()}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-[#07101c] transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {busy ? "Uploading…" : "Transcribe"}
            </button>
          </div>
        </div>
      </section>

      {notice && (
        <div className="mt-4 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">{notice}</div>
      )}

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-fog">Recent transcriptions</h2>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs text-fog-dim transition hover:text-paper"
          >
            Refresh
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-xl border border-edge-soft bg-panel/50 px-5 py-8 text-sm text-fog-dim">
            Nothing here yet. Your first upload will appear in this list.
          </div>
        ) : (
          <ul className="divide-y divide-edge-soft overflow-hidden rounded-xl border border-edge-soft bg-panel/60">
            {jobs.map((job) => (
              <li key={job.id}>
                <a
                  href={`/c/${job.id}`}
                  className="group flex items-center gap-4 px-4 py-3 transition hover:bg-panel-2/60"
                >
                  <div className="rounded-lg border border-edge-soft bg-panel-2 p-2 text-fog group-hover:text-accent">
                    <FileAudio size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-paper">{job.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fog-dim">
                      {job.durationMs ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} /> {formatClock(job.durationMs)}
                        </span>
                      ) : null}
                      <span>{languageLabel(job.language)}</span>
                      <span>{formatDate(job.createdAt)}</span>
                      {job.status !== "completed" && (
                        <span className="inline-flex items-center gap-1 text-amber-300/80">
                          {job.progress ?? STATUS_LABEL[job.status]}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusClass(
                      job.status,
                    )}`}
                  >
                    {STATUS_LABEL[job.status]}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${job.title}`}
                    onClick={(event) => void removeJob(event, job.id)}
                    className="rounded-md p-1.5 text-fog-dim opacity-0 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 size={15} />
                  </button>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-12 text-center text-[11px] text-fog-dim">
        Audio is sent only to the transcription provider you choose. Transcripts and audio live in
        <span className="mx-1 font-mono">.data/</span>on this machine.
      </footer>
    </main>
  );
}
