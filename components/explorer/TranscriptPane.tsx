"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExplorerStore } from "@/lib/client/store";
import { findMatchRanges, type MatchRange } from "@/lib/transcript/search";
import type { Speaker, TranscriptFile } from "@/lib/transcript/schema";
import SearchToolbar from "@/components/explorer/SearchToolbar";
import SpeakerFilter, { UNASSIGNED_KEY } from "@/components/explorer/SpeakerFilter";
import TranscriptRow from "@/components/explorer/TranscriptRow";

const EMPTY_RANGES: MatchRange[] = [];

type Props = {
  transcript: TranscriptFile;
  activeSegmentId: string | null;
  selectedSpeakers: string[];
  readOnly?: boolean;
  onToggleSpeaker: (key: string) => void;
  onClearSpeakers: () => void;
  onRenameSpeaker?: (speakerId: string, name: string) => void;
  onSeek: (ms: number) => void;
  onEditSegment: (
    segmentId: string,
    patch: { text?: string; speakerId?: string | null },
  ) => void;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function TranscriptPane({
  transcript,
  activeSegmentId,
  selectedSpeakers,
  readOnly,
  onToggleSpeaker,
  onClearSpeakers,
  onRenameSpeaker,
  onSeek,
  onEditSegment,
}: Props) {
  const follow = useExplorerStore((state) => state.follow);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastInteractRef = useRef(0);

  const [query, setQuery] = useState("");
  const [hideNonMatches, setHideNonMatches] = useState(false);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const speakerById = useMemo(() => {
    const map = new Map<string, Speaker>();
    for (const speaker of transcript.speakers) map.set(speaker.id, speaker);
    return map;
  }, [transcript.speakers]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const segment of transcript.segments) {
      const key = segment.speakerId ?? UNASSIGNED_KEY;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [transcript.segments]);

  const visibleSegments = useMemo(() => {
    if (selectedSpeakers.length === 0) return transcript.segments;
    const allowed = new Set(selectedSpeakers);
    return transcript.segments.filter((segment) =>
      allowed.has(segment.speakerId ?? UNASSIGNED_KEY),
    );
  }, [transcript.segments, selectedSpeakers]);

  const search = useMemo(() => {
    const bySegment = new Map<string, MatchRange[]>();
    const flat: { segmentId: string; start: number }[] = [];
    const needle = query.trim();
    if (!needle) return { bySegment, flat };

    for (const segment of visibleSegments) {
      const ranges = findMatchRanges(segment.text, needle);
      if (ranges.length === 0) continue;
      bySegment.set(segment.id, ranges);
      for (const range of ranges) {
        flat.push({ segmentId: segment.id, start: range.start });
      }
    }
    return { bySegment, flat };
  }, [visibleSegments, query]);

  useEffect(() => {
    setCurrentMatch(0);
  }, [query, selectedSpeakers]);

  // Segment ids repeat across transcript versions, so never carry an edit across a swap.
  useEffect(() => {
    setEditingId(null);
  }, [transcript.id, transcript.createdAt]);

  useEffect(() => {
    if (currentMatch >= search.flat.length) {
      setCurrentMatch(0);
    }
  }, [currentMatch, search.flat.length]);

  const scrollToSegment = useCallback((id: string, smooth = true) => {
    const container = containerRef.current;
    if (!container) return;
    const row = container.querySelector<HTMLElement>(`[data-seg-id="${CSS.escape(id)}"]`);
    if (!row) return;

    const rowRect = row.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const delta =
      rowRect.top - containerRect.top - (container.clientHeight - rowRect.height) / 2;

    container.scrollTo({
      top: Math.max(0, container.scrollTop + delta),
      behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
    });
  }, []);

  useEffect(() => {
    if (!follow || !activeSegmentId || editingId) return;
    if (Date.now() - lastInteractRef.current < 3000) return;
    scrollToSegment(activeSegmentId);
  }, [activeSegmentId, follow, scrollToSegment, editingId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const markInteract = () => {
      lastInteractRef.current = Date.now();
    };
    container.addEventListener("wheel", markInteract, { passive: true });
    container.addEventListener("pointerdown", markInteract);
    container.addEventListener("touchstart", markInteract, { passive: true });
    container.addEventListener("keydown", markInteract);
    return () => {
      container.removeEventListener("wheel", markInteract);
      container.removeEventListener("pointerdown", markInteract);
      container.removeEventListener("touchstart", markInteract);
      container.removeEventListener("keydown", markInteract);
    };
  }, []);

  const goToMatch = useCallback(
    (delta: number) => {
      if (search.flat.length === 0) return;
      const next = (currentMatch + delta + search.flat.length) % search.flat.length;
      setCurrentMatch(next);
      scrollToSegment(search.flat[next].segmentId);
    },
    [currentMatch, scrollToSegment, search.flat],
  );

  const handleStartEdit = useCallback(
    (segmentId: string) => {
      if (readOnly) return;
      setEditingId(segmentId);
    },
    [readOnly],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleCommit = useCallback(
    (segmentId: string, text: string, speakerId: string | null) => {
      setEditingId(null);
      const segment = transcript.segments.find((candidate) => candidate.id === segmentId);
      if (!segment) return;

      const patch: { text?: string; speakerId?: string | null } = {};
      if (text !== segment.text) patch.text = text;
      if (speakerId !== segment.speakerId) patch.speakerId = speakerId;
      if (Object.keys(patch).length === 0) return;
      onEditSegment(segmentId, patch);
    },
    [onEditSegment, transcript.segments],
  );

  const handleRenameSpeaker = useCallback(
    (speaker: Speaker) => {
      if (readOnly || !onRenameSpeaker) return;
      const name = window.prompt("Speaker name", speaker.name);
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed || trimmed === speaker.name) return;
      onRenameSpeaker(speaker.id, trimmed);
    },
    [onRenameSpeaker, readOnly],
  );

  const current = search.flat[currentMatch];
  const queryActive = query.trim().length > 0;
  let renderedCount = 0;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-edge-soft px-4 py-3">
        <SearchToolbar
          query={query}
          onQueryChange={setQuery}
          current={currentMatch}
          total={search.flat.length}
          onPrev={() => goToMatch(-1)}
          onNext={() => goToMatch(1)}
          hideNonMatches={hideNonMatches}
          onHideNonMatchesChange={setHideNonMatches}
        />
        <SpeakerFilter
          speakers={transcript.speakers}
          counts={counts}
          selected={selectedSpeakers}
          onToggle={onToggleSpeaker}
          onClear={onClearSpeakers}
          onRenameSpeaker={readOnly ? undefined : handleRenameSpeaker}
        />
        <div className="text-[10px] text-fog-dim">
          {readOnly
            ? "Ctrl/Cmd+click a line to jump · Space to play · read-only while re-transcribing"
            : "Ctrl/Cmd+click a line to jump · right-click to edit · Space to play"}
        </div>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {visibleSegments.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-fog-dim">
            No speakers selected.
          </p>
        ) : (
          <div className="space-y-0.5">
            {visibleSegments.map((segment) => {
              const ranges = search.bySegment.get(segment.id) ?? EMPTY_RANGES;
              if (queryActive && hideNonMatches && ranges.length === 0 && editingId !== segment.id) {
                return null;
              }
              renderedCount += 1;
              return (
                <TranscriptRow
                  key={segment.id}
                  segment={segment}
                  speaker={segment.speakerId ? speakerById.get(segment.speakerId) : undefined}
                  speakers={transcript.speakers}
                  active={activeSegmentId === segment.id}
                  dimmed={queryActive && ranges.length === 0}
                  ranges={ranges}
                  currentMatchStart={
                    current?.segmentId === segment.id ? current.start : undefined
                  }
                  editing={editingId === segment.id}
                  readOnly={readOnly}
                  onSeek={onSeek}
                  onStartEdit={handleStartEdit}
                  onCancelEdit={handleCancelEdit}
                  onCommit={handleCommit}
                />
              );
            })}
            {queryActive && hideNonMatches && renderedCount === 0 && (
              <p className="px-4 py-10 text-center text-sm text-fog-dim">
                No lines match “{query.trim()}”.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
