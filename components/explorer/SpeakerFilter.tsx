"use client";

import { Pencil } from "lucide-react";
import type { Speaker } from "@/lib/transcript/schema";

export const UNASSIGNED_KEY = "__none__";

type Props = {
  speakers: Speaker[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (key: string) => void;
  onClear: () => void;
  onRenameSpeaker?: (speaker: Speaker) => void;
};

function Chip({
  name,
  color,
  count,
  active,
  onClick,
  onRename,
}: {
  name: string;
  color: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onRename?: () => void;
}) {
  return (
    <span
      className={`group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition ${
        active ? "text-paper" : "text-fog hover:text-paper"
      }`}
      style={{
        borderColor: active ? `${color}99` : "var(--color-edge)",
        background: active ? `${color}1f` : "transparent",
      }}
    >
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {name}
        <span className="font-mono text-[10px] text-fog-dim">{count}</span>
      </button>
      {onRename && (
        <button
          type="button"
          aria-label={`Rename ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            onRename();
          }}
          className="rounded p-0.5 text-fog-dim opacity-0 transition hover:text-paper group-hover:opacity-100"
        >
          <Pencil size={10} />
        </button>
      )}
    </span>
  );
}

export default function SpeakerFilter({
  speakers,
  counts,
  selected,
  onToggle,
  onClear,
  onRenameSpeaker,
}: Props) {
  const unknownCount = counts.get(UNASSIGNED_KEY) ?? 0;
  const allSelected = selected.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onClear}
        className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
          allSelected
            ? "border-accent/50 bg-accent-soft text-paper"
            : "border-edge text-fog hover:text-paper"
        }`}
      >
        All speakers
      </button>

      {speakers.map((speaker) => (
        <Chip
          key={speaker.id}
          name={speaker.name}
          color={speaker.color}
          count={counts.get(speaker.id) ?? 0}
          active={selected.includes(speaker.id)}
          onClick={() => onToggle(speaker.id)}
          onRename={onRenameSpeaker ? () => onRenameSpeaker(speaker) : undefined}
        />
      ))}

      {unknownCount > 0 && (
        <Chip
          name="Unassigned"
          color="#8ea3ba"
          count={unknownCount}
          active={selected.includes(UNASSIGNED_KEY)}
          onClick={() => onToggle(UNASSIGNED_KEY)}
        />
      )}
    </div>
  );
}
