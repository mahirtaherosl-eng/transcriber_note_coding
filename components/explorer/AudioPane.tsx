"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Gauge,
  Loader2,
  Paperclip,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useExplorerStore } from "@/lib/client/store";
import { formatClock, parseClockInput } from "@/lib/format";
import { findSegmentAtTime } from "@/lib/transcript/lookup";
import type { Job, TranscriptFile } from "@/lib/transcript/schema";
import type { PlaybackControls } from "@/components/explorer/usePlaybackSync";
import Waveform from "@/components/explorer/Waveform";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

type Props = {
  id: string;
  job: Job;
  transcript: TranscriptFile;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  controls: PlaybackControls;
  selectedSpeakers: string[];
  attaching: boolean;
  attachProgress: number | null;
  onAttachAudio: (file: File) => void;
};

export default function AudioPane({
  id,
  job,
  transcript,
  audioRef,
  controls,
  selectedSpeakers,
  attaching,
  attachProgress,
  onAttachAudio,
}: Props) {
  const currentTimeMs = useExplorerStore((state) => state.currentTimeMs);
  const isPlaying = useExplorerStore((state) => state.isPlaying);
  const playbackRate = useExplorerStore((state) => state.playbackRate);
  const setPlaybackRate = useExplorerStore((state) => state.setPlaybackRate);
  const follow = useExplorerStore((state) => state.follow);
  const setFollow = useExplorerStore((state) => state.setFollow);

  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [jump, setJump] = useState("");
  const attachInputRef = useRef<HTMLInputElement | null>(null);

  const durationMs = transcript.source.durationMs || job.durationMs || 0;
  const hasAudio = Boolean(job.audioFile);
  const activeSegmentId = useMemo(
    () => findSegmentAtTime(transcript.segments, currentTimeMs)?.id ?? null,
    [transcript.segments, currentTimeMs],
  );

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    if (!hasAudio) return;

    fetch(`/api/peaks/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { peaks?: number[] } | null) => {
        if (!cancelled && data?.peaks) setPeaks(data.peaks);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [id, hasAudio, job.audioFile]);

  const submitJump = (event: React.FormEvent) => {
    event.preventDefault();
    const ms = parseClockInput(jump);
    if (ms === null) return;
    controls.seek(ms);
    setJump("");
  };

  return (
    <aside className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="rounded-2xl border border-edge bg-panel/75 p-4">
        <Waveform
          peaks={peaks}
          durationMs={durationMs}
          segments={transcript.segments}
          speakers={transcript.speakers}
          activeSegmentId={activeSegmentId}
          selectedSpeakers={selectedSpeakers}
          audioRef={audioRef}
          onSeek={(ms) => controls.seek(ms)}
        />

        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Back 5 seconds"
            onClick={() => controls.skip(-5000)}
            disabled={!hasAudio}
            className="rounded-full p-2 text-fog transition hover:bg-panel-2 hover:text-paper disabled:opacity-30"
          >
            <SkipBack size={20} />
          </button>

          <button
            type="button"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={controls.toggle}
            disabled={!hasAudio}
            className="rounded-full bg-accent p-3 text-[#07101c] transition hover:brightness-110 disabled:opacity-30"
          >
            {isPlaying ? <Pause size={22} /> : <Play size={22} />}
          </button>

          <button
            type="button"
            aria-label="Forward 5 seconds"
            onClick={() => controls.skip(5000)}
            disabled={!hasAudio}
            className="rounded-full p-2 text-fog transition hover:bg-panel-2 hover:text-paper disabled:opacity-30"
          >
            <SkipForward size={20} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-fog">
          <span className="font-mono tabular-nums text-paper">
            {formatClock(currentTimeMs)} <span className="text-fog-dim">/ {formatClock(durationMs)}</span>
          </span>

          <form onSubmit={submitJump} className="flex items-center gap-1">
            <input
              value={jump}
              onChange={(event) => setJump(event.target.value)}
              placeholder="mm:ss"
              aria-label="Jump to time"
              className="w-16 rounded border border-edge bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-paper outline-none placeholder:text-fog-dim focus:border-accent"
            />
            <button type="submit" className="rounded border border-edge px-1.5 py-0.5 text-[11px] hover:text-paper">
              Go
            </button>
          </form>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-panel-2 px-2 py-1 text-[11px] text-fog">
            <Gauge size={13} />
            <select
              value={playbackRate}
              onChange={(event) => setPlaybackRate(Number(event.target.value))}
              className="bg-transparent text-paper outline-none"
              aria-label="Playback speed"
            >
              {RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}×
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setFollow(!follow)}
            aria-pressed={follow}
            className={`rounded-lg border px-2 py-1 text-[11px] transition ${
              follow
                ? "border-accent/40 bg-accent-soft text-paper"
                : "border-edge bg-panel-2 text-fog hover:text-paper"
            }`}
            title="Automatically scroll the transcript to the line being played"
          >
            Follow playback
          </button>
        </div>
      </div>

      {!hasAudio && (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-300/5 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-amber-200">
            <Paperclip size={15} /> Audio not attached
          </div>
          <p className="text-xs leading-relaxed text-amber-200/70">
            This transcript was imported without its audio. Attach the original recording to play it
            alongside the text and keep the timestamps aligned.
          </p>
          <input
            ref={attachInputRef}
            type="file"
            accept="audio/*,video/mp4"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onAttachAudio(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={attaching}
            onClick={() => attachInputRef.current?.click()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-200/30 px-3 py-1.5 text-xs text-amber-100 transition hover:bg-amber-200/10 disabled:opacity-50"
          >
            {attaching ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
            {attaching
              ? `Attaching${attachProgress !== null ? ` ${attachProgress}%` : "…"}`
              : "Attach audio file"}
          </button>
        </div>
      )}

      <p className="px-1 text-[10px] leading-relaxed text-fog-dim">
        Shortcuts: Space play/pause · ←/→ seek 5s · [ ] speed · / search. Drag the waveform to scrub.
      </p>
    </aside>
  );
}
