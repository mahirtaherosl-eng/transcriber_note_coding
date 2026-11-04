"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  attachAudio,
  cancelTranscription,
  getJob,
  getTranscript,
  getTranscriptIfAvailable,
  restoreHistory,
  retranscribe,
  retryTranscription,
  saveEdits,
} from "@/lib/client/api";
import { useExplorerStore } from "@/lib/client/store";
import { findSegmentAtTime } from "@/lib/transcript/lookup";
import type { Job } from "@/lib/transcript/schema";
import AudioPane from "@/components/explorer/AudioPane";
import EditorHeader from "@/components/explorer/EditorHeader";
import JobStatusBanner from "@/components/explorer/JobStatusBanner";
import type { RetranscribeOptions } from "@/components/explorer/RetranscribeMenu";
import TranscriptPane from "@/components/explorer/TranscriptPane";
import { usePlaybackSync } from "@/components/explorer/usePlaybackSync";

type ToastTone = "ok" | "warn" | "error";

export default function Explorer({ id }: { id: string }) {
  const job = useExplorerStore((state) => state.job);
  const transcript = useExplorerStore((state) => state.transcript);
  const loading = useExplorerStore((state) => state.loading);
  const error = useExplorerStore((state) => state.error);
  const setJob = useExplorerStore((state) => state.setJob);
  const setTranscript = useExplorerStore((state) => state.setTranscript);
  const setLoading = useExplorerStore((state) => state.setLoading);
  const setError = useExplorerStore((state) => state.setError);
  const reset = useExplorerStore((state) => state.reset);
  const replaceTranscript = useExplorerStore((state) => state.replaceTranscript);

  const activeSegmentId = useExplorerStore((state) => {
    if (!state.transcript) return null;
    return findSegmentAtTime(state.transcript.segments, state.currentTimeMs)?.id ?? null;
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const durationMs = transcript?.source.durationMs || job?.durationMs || 0;
  const canEdit = job?.status === "completed";
  const controls = usePlaybackSync(audioRef, durationMs);

  const [selectedSpeakers, setSelectedSpeakers] = useState<string[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [attachProgress, setAttachProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const undoStack = useRef<{ segmentId: string; text: string; speakerId: string | null }[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = "ok") => {
    setToast({ message, tone });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      try {
        const nextJob = await getJob(id);
        setJob(nextJob);
        // Refetch on completion, and on first load so a reload mid-run still shows the
        // previous transcript. Avoid replacing it on every poll while it is unchanged.
        const hasTranscript = Boolean(useExplorerStore.getState().transcript);
        if (nextJob.status === "completed" || !hasTranscript) {
          setTranscript(await getTranscriptIfAvailable(id));
        }
        setError(null);
      } catch (loadError) {
        if (!quiet) {
          setError(loadError instanceof Error ? loadError.message : "Could not load this transcription.");
        }
      } finally {
        setLoading(false);
      }
    },
    [id, setError, setJob, setLoading, setTranscript],
  );

  useEffect(() => {
    reset();
    setSelectedSpeakers([]);
    undoStack.current = [];
  }, [id, reset]);

  // Segment ids repeat across versions, so never carry edits or filters into a swapped transcript.
  useEffect(() => {
    undoStack.current = [];
    setSelectedSpeakers([]);
  }, [transcript?.id, transcript?.createdAt]);

  const requireEditable = useCallback(() => {
    if (job?.status === "completed") return true;
    showToast("Editing is disabled while this transcription is running.", "warn");
    return false;
  }, [job?.status, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "processing")) return;
    const timer = window.setInterval(() => {
      void load(true);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [job, load]);

  const patchLocal = useCallback(
    (segmentId: string, patch: { text?: string; speakerId?: string | null }) => {
      const current = useExplorerStore.getState().transcript;
      if (!current) return;
      replaceTranscript({
        ...current,
        segments: current.segments.map((segment) =>
          segment.id === segmentId
            ? {
                ...segment,
                ...patch,
                ...(patch.text !== undefined ? { edited: true } : {}),
              }
            : segment,
        ),
      });
    },
    [replaceTranscript],
  );

  const handleEditSegment = useCallback(
    async (segmentId: string, patch: { text?: string; speakerId?: string | null }) => {
      if (!requireEditable()) return;
      const current = useExplorerStore.getState().transcript;
      if (!current) return;
      const before = current.segments.find((segment) => segment.id === segmentId);
      if (!before) return;

      patchLocal(segmentId, patch);

      try {
        const updated = await saveEdits(id, {
          segments: [{ id: segmentId, text: patch.text, speakerId: patch.speakerId }],
        });
        replaceTranscript(updated);
        undoStack.current.push({
          segmentId,
          text: before.text,
          speakerId: before.speakerId,
        });
        if (undoStack.current.length > 50) undoStack.current.shift();
      } catch (saveError) {
        const now = useExplorerStore.getState().transcript;
        if (now) {
          replaceTranscript({
            ...now,
            segments: now.segments.map((segment) => (segment.id === segmentId ? before : segment)),
          });
        }
        showToast(
          saveError instanceof Error ? saveError.message : "Could not save the edit.",
          "error",
        );
      }
    },
    [id, patchLocal, replaceTranscript, requireEditable, showToast],
  );

  const handleUndo = useCallback(async () => {
    if (!requireEditable()) return;
    const entry = undoStack.current.pop();
    if (!entry) {
      showToast("Nothing to undo.", "warn");
      return;
    }
    try {
      const updated = await saveEdits(id, {
        segments: [{ id: entry.segmentId, text: entry.text, speakerId: entry.speakerId }],
      });
      replaceTranscript(updated);
      showToast("Edit undone.");
    } catch (undoError) {
      undoStack.current.push(entry);
      showToast(undoError instanceof Error ? undoError.message : "Could not undo.", "error");
    }
  }, [id, replaceTranscript, requireEditable, showToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      void handleUndo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo]);

  const handleRenameSpeaker = useCallback(
    async (speakerId: string, name: string) => {
      if (!requireEditable()) return;
      const current = useExplorerStore.getState().transcript;
      if (!current) return;
      const before = current.speakers;

      replaceTranscript({
        ...current,
        speakers: current.speakers.map((speaker) =>
          speaker.id === speakerId ? { ...speaker, name } : speaker,
        ),
      });

      try {
        const updated = await saveEdits(id, { speakers: [{ id: speakerId, name }] });
        replaceTranscript(updated);
      } catch (saveError) {
        replaceTranscript({ ...current, speakers: before });
        showToast(
          saveError instanceof Error ? saveError.message : "Could not rename the speaker.",
          "error",
        );
      }
    },
    [id, replaceTranscript, requireEditable, showToast],
  );

  const handleAttachAudio = useCallback(
    async (file: File) => {
      setAttaching(true);
      setAttachProgress(0);
      try {
        const result = await attachAudio(id, file, setAttachProgress);
        setJob(result.job);
        const fresh = await getTranscript(id);
        setTranscript(fresh);
        showToast(result.warning ?? "Audio attached.", result.warning ? "warn" : "ok");
      } catch (attachError) {
        showToast(
          attachError instanceof Error ? attachError.message : "Could not attach the audio.",
          "error",
        );
      } finally {
        setAttaching(false);
        setAttachProgress(null);
      }
    },
    [id, setJob, setTranscript, showToast],
  );

  const handleRetry = useCallback(async () => {
    setLoading(true);
    try {
      await retryTranscription(id);
      await load(true);
    } catch (retryError) {
      showToast(retryError instanceof Error ? retryError.message : "Retry failed.", "error");
      setLoading(false);
    }
  }, [id, load, showToast, setLoading]);

  const handleCancel = useCallback(async () => {
    try {
      await cancelTranscription(id);
      await load(true);
    } catch (cancelError) {
      showToast(cancelError instanceof Error ? cancelError.message : "Cancel failed.", "error");
    }
  }, [id, load, showToast]);

  const handleRetranscribe = useCallback(
    async (options: RetranscribeOptions) => {
      await retranscribe(id, options);
      await load(true);
      showToast("Re-transcription started.");
    },
    [id, load, showToast],
  );

  const handleRestore = useCallback(
    async (version: string) => {
      const result = await restoreHistory(id, version);
      setTranscript(result.transcript);
      setJob(result.job);
      showToast(
        result.warning ?? "Transcript version restored.",
        result.warning ? "warn" : "ok",
      );
    },
    [id, setJob, setTranscript, showToast],
  );

  const toggleSpeaker = useCallback((key: string) => {
    setSelectedSpeakers((previous) =>
      previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key],
    );
  }, []);

  const audioSrc = job?.audioFile
    ? `/api/audio/${encodeURIComponent(id)}?v=${encodeURIComponent(job.sha256 ?? "1")}`
    : undefined;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <audio ref={audioRef} src={audioSrc} preload="metadata" className="hidden" />

      {transcript && job ? (
        <>
          <EditorHeader
            id={id}
            transcript={transcript}
            durationMs={durationMs}
            job={job}
            onRetranscribe={handleRetranscribe}
            onRestore={handleRestore}
          />
          {!canEdit && (
            <JobStatusBanner job={job} onCancel={handleCancel} onRetry={handleRetry} />
          )}
          <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="min-h-0 flex-1 border-b border-edge-soft lg:border-b-0 lg:border-r">
              <TranscriptPane
                transcript={transcript}
                activeSegmentId={activeSegmentId}
                selectedSpeakers={selectedSpeakers}
                readOnly={!canEdit}
                onToggleSpeaker={toggleSpeaker}
                onClearSpeakers={() => setSelectedSpeakers([])}
                onRenameSpeaker={handleRenameSpeaker}
                onSeek={(ms) => controls.seek(ms, true)}
                onEditSegment={handleEditSegment}
              />
            </div>
            <div className="min-h-0 max-h-[48vh] w-full shrink-0 overflow-y-auto lg:max-h-none lg:w-[42%] lg:min-w-[380px] lg:max-w-[760px]">
              <AudioPane
                id={id}
                job={job}
                transcript={transcript}
                audioRef={audioRef}
                controls={controls}
                selectedSpeakers={selectedSpeakers}
                attaching={attaching}
                attachProgress={attachProgress}
                onAttachAudio={(file) => void handleAttachAudio(file)}
              />
            </div>
          </main>
        </>
      ) : (
        <StatusView
          job={job}
          loading={loading}
          error={error}
          onRetry={handleRetry}
          onCancel={handleCancel}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border px-3.5 py-2.5 text-sm shadow-2xl ${
            toast.tone === "error"
              ? "border-danger/40 bg-[#2a1115] text-danger"
              : toast.tone === "warn"
                ? "border-amber-300/40 bg-[#2a2110] text-amber-200"
                : "border-ok/40 bg-[#0f241d] text-ok"
          }`}
        >
          <div className="flex items-start gap-2">
            {toast.tone === "error" ? (
              <XCircle size={15} className="mt-0.5 shrink-0" />
            ) : toast.tone === "warn" ? (
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusView({
  job,
  loading,
  error,
  onRetry,
  onCancel,
}: {
  job: Job | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const processing = job?.status === "queued" || job?.status === "processing";
  const failed =
    job?.status === "failed" || job?.status === "interrupted" || job?.status === "cancelled";

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-edge bg-panel/80 p-6 text-center">
        {processing ? (
          <>
            <div className="mx-auto mb-4 w-fit rounded-full border border-accent/30 bg-accent/10 p-3 text-accent">
              <Loader2 size={24} className="animate-spin" />
            </div>
            <h2 className="text-lg font-medium text-paper">Transcribing</h2>
            <p className="mt-1 text-sm text-fog">
              {job?.progress ?? "Waiting for the provider…"}
            </p>
            <p className="mt-1 text-xs text-fog-dim">
              This can take a few minutes for a long conversation. You can leave this page and come
              back.
            </p>
            <button
              type="button"
              onClick={onCancel}
              className="mt-5 rounded-lg border border-edge px-3 py-1.5 text-xs text-fog transition hover:border-danger/40 hover:text-danger"
            >
              Cancel transcription
            </button>
          </>
        ) : failed ? (
          <>
            <div className="mx-auto mb-4 w-fit rounded-full border border-danger/30 bg-danger/10 p-3 text-danger">
              <XCircle size={24} />
            </div>
            <h2 className="text-lg font-medium text-paper">
              {job?.status === "cancelled" ? "Transcription cancelled" : "Transcription failed"}
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-fog">
              {job?.error ?? error ?? "Something went wrong."}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-[#07101c]"
              >
                <RefreshCw size={13} /> Retry
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-xs text-fog hover:text-paper"
              >
                <ArrowLeft size={13} /> Back to library
              </Link>
            </div>
          </>
        ) : (
          <>
            {loading ? (
              <Loader2 size={24} className="mx-auto animate-spin text-accent" />
            ) : (
              <AlertTriangle size={24} className="mx-auto text-amber-300" />
            )}
            <h2 className="mt-4 text-lg font-medium text-paper">
              {loading ? "Loading…" : "This transcript is not available"}
            </h2>
            <p className="mt-2 text-sm text-fog">{error ?? "The transcript file could not be read."}</p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-xs text-fog hover:text-paper"
            >
              <ArrowLeft size={13} /> Back to library
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
