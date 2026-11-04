"use client";

import Link from "next/link";
import { ChevronLeft, Clock, Download, FileJson, FileText, Subtitles } from "lucide-react";
import { formatClock } from "@/lib/format";
import { languageLabel } from "@/lib/languages";
import type { Job, TranscriptFile } from "@/lib/transcript/schema";
import HistoryMenu from "@/components/explorer/HistoryMenu";
import RetranscribeMenu, { type RetranscribeOptions } from "@/components/explorer/RetranscribeMenu";

type Props = {
  id: string;
  transcript: TranscriptFile;
  durationMs: number;
  job: Job;
  onRetranscribe: (options: RetranscribeOptions) => Promise<void>;
  onRestore: (version: string) => Promise<void>;
};

const EXPORTS = [
  { format: "json", label: "Transcript JSON", icon: FileJson, hint: "Re-open in this app" },
  { format: "srt", label: "Subtitles (.srt)", icon: Subtitles, hint: "Video players" },
  { format: "vtt", label: "WebVTT (.vtt)", icon: Subtitles, hint: "Web players" },
  { format: "txt", label: "Plain text", icon: FileText, hint: "Notes and sharing" },
  { format: "zip", label: "Bundle with audio", icon: Download, hint: "Archive everything" },
];

export default function EditorHeader({
  id,
  transcript,
  durationMs,
  job,
  onRetranscribe,
  onRestore,
}: Props) {
  const editedCount = transcript.segments.filter((segment) => segment.edited).length;
  const language = languageLabel(
    transcript.transcription.detectedLanguage ?? transcript.transcription.requestedLanguage,
  );

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-edge-soft bg-ink/75 px-4 py-2.5 backdrop-blur">
      <Link
        href="/"
        className="inline-flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-xs text-fog transition hover:border-accent/50 hover:text-paper"
      >
        <ChevronLeft size={14} /> Library
      </Link>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-medium text-paper">{transcript.title}</h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-fog-dim">
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> {formatClock(durationMs)}
          </span>
          <span>·</span>
          <span>{language}</span>
          <span>·</span>
          <span>
            {transcript.transcription.provider} / {transcript.transcription.model}
          </span>
          {editedCount > 0 && (
            <>
              <span>·</span>
              <span className="text-amber-300/80">
                {editedCount} edited line{editedCount === 1 ? "" : "s"}
              </span>
            </>
          )}
        </div>
      </div>

      <RetranscribeMenu
        job={job}
        disabled={job.status === "queued" || job.status === "processing"}
        onStart={onRetranscribe}
      />
      <HistoryMenu id={id} job={job} onRestore={onRestore} />

      <details className="relative">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-xs text-fog transition hover:border-accent/50 hover:text-paper [&::-webkit-details-marker]:hidden">
          <Download size={14} /> Export
        </summary>
        <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border border-edge bg-panel shadow-xl">
          {EXPORTS.map(({ format, label, icon: Icon, hint }) => (
            <a
              key={format}
              href={`/api/export/${encodeURIComponent(id)}?format=${format}`}
              className="flex items-start gap-2 px-3 py-2 text-xs text-fog transition hover:bg-panel-2 hover:text-paper"
            >
              <Icon size={14} className="mt-0.5 shrink-0" />
              <span>
                <span className="block">{label}</span>
                <span className="block text-[10px] text-fog-dim">{hint}</span>
              </span>
            </a>
          ))}
        </div>
      </details>
    </header>
  );
}
