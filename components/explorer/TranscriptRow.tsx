"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { formatClockWithTenths } from "@/lib/format";
import type { MatchRange } from "@/lib/transcript/search";
import type { Segment, Speaker } from "@/lib/transcript/schema";

type Props = {
  segment: Segment;
  speaker?: Speaker;
  speakers: Speaker[];
  active: boolean;
  dimmed: boolean;
  ranges: MatchRange[];
  currentMatchStart?: number;
  editing: boolean;
  readOnly?: boolean;
  onSeek: (ms: number) => void;
  onStartEdit: (segmentId: string) => void;
  onCancelEdit: () => void;
  onCommit: (segmentId: string, text: string, speakerId: string | null) => void;
};

function TextWithMatches({
  text,
  ranges,
  currentMatchStart,
}: {
  text: string;
  ranges: MatchRange[];
  currentMatchStart?: number;
}) {
  if (ranges.length === 0) return <>{text}</>;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      nodes.push(<span key={`p-${index}`}>{text.slice(cursor, range.start)}</span>);
    }
    nodes.push(
      <mark
        key={`m-${index}`}
        data-current={range.start === currentMatchStart ? "true" : undefined}
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  }
  return <>{nodes}</>;
}

function TranscriptRowImpl({
  segment,
  speaker,
  speakers,
  active,
  dimmed,
  ranges,
  currentMatchStart,
  editing,
  readOnly,
  onSeek,
  onStartEdit,
  onCancelEdit,
  onCommit,
}: Props) {
  const [draft, setDraft] = useState(segment.text);
  const [draftSpeaker, setDraftSpeaker] = useState<string | null>(segment.speakerId);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    setDraft(segment.text);
    setDraftSpeaker(segment.speakerId);
    committedRef.current = false;
    const frame = requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, segment.text, segment.speakerId]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!editing || !element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft, editing]);

  const cancel = () => {
    committedRef.current = true;
    onCancelEdit();
  };

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (draft.trim() === "") {
      onCancelEdit();
      return;
    }
    onCommit(segment.id, draft, draftSpeaker);
  };

  const color = speaker?.color ?? "#8ea3ba";

  return (
    <div
      data-seg-id={segment.id}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!editing && !readOnly) onStartEdit(segment.id);
      }}
      onClick={(event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          onSeek(segment.startMs);
        }
      }}
      title={
        editing
          ? undefined
          : readOnly
            ? "Ctrl/Cmd+click to jump here"
            : "Right-click to edit · Ctrl/Cmd+click to jump here"
      }
      className={`group scroll-mt-3 rounded-lg border px-3 py-2 transition ${
        active
          ? "border-accent/40 bg-accent-soft/35"
          : "border-transparent hover:border-edge-soft hover:bg-panel-2/45"
      } ${dimmed ? "opacity-35" : ""}`}
    >
      <div className="flex gap-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSeek(segment.startMs);
          }}
          className="mt-0.5 h-fit shrink-0 rounded px-1 py-0.5 font-mono text-[11px] tabular-nums text-fog-dim transition hover:bg-panel-2 hover:text-accent"
          title="Jump to this line"
        >
          {formatClockWithTenths(segment.startMs)}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ color, borderColor: `${color}55`, background: `${color}14` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              {speaker?.name ?? "Unassigned"}
            </span>
            {segment.edited && (
              <span className="rounded border border-edge px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-fog-dim">
                edited
              </span>
            )}
          </div>

          {editing ? (
            <div
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit();
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    cancel();
                  } else if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    commit();
                  }
                }}
                spellCheck={false}
                className="w-full resize-none rounded-md border border-accent/50 bg-ink/70 px-2 py-1.5 text-sm leading-relaxed text-paper outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={draftSpeaker ?? ""}
                  onChange={(event) => setDraftSpeaker(event.target.value || null)}
                  className="rounded-md border border-edge bg-panel-2 px-2 py-1 text-xs text-paper outline-none focus:border-accent"
                >
                  <option value="">Unassigned</option>
                  {speakers.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={commit}
                  className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-[#07101c]"
                >
                  <Check size={12} /> Save
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  className="inline-flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-xs text-fog hover:text-paper"
                >
                  <X size={12} /> Cancel
                </button>
                <span className="text-[10px] text-fog-dim">
                  Enter saves · Shift+Enter newline · Esc cancels
                </span>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-paper/95">
              <TextWithMatches
                text={segment.text}
                ranges={ranges}
                currentMatchStart={currentMatchStart}
              />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const TranscriptRow = React.memo(TranscriptRowImpl);
export default TranscriptRow;
