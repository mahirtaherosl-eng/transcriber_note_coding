"use client";

import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  hideNonMatches: boolean;
  onHideNonMatchesChange: (value: boolean) => void;
};

export default function SearchToolbar({
  query,
  onQueryChange,
  current,
  total,
  onPrev,
  onNext,
  hideNonMatches,
  onHideNonMatchesChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog-dim" />
        <input
          data-search-input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search this transcript…"
          className="w-full rounded-lg border border-edge bg-panel-2 py-2 pl-8 pr-16 text-sm text-paper outline-none placeholder:text-fog-dim focus:border-accent"
        />
        {query && (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            <span className="font-mono text-[10px] text-fog-dim">
              {total === 0 ? "0" : `${current + 1}/${total}`}
            </span>
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onQueryChange("")}
              className="rounded p-0.5 text-fog-dim hover:text-paper"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center rounded-lg border border-edge bg-panel-2">
        <button
          type="button"
          aria-label="Previous match"
          disabled={total === 0}
          onClick={onPrev}
          className="p-2 text-fog transition hover:text-paper disabled:opacity-30"
        >
          <ChevronUp size={15} />
        </button>
        <button
          type="button"
          aria-label="Next match"
          disabled={total === 0}
          onClick={onNext}
          className="border-l border-edge p-2 text-fog transition hover:text-paper disabled:opacity-30"
        >
          <ChevronDown size={15} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onHideNonMatchesChange(!hideNonMatches)}
        className={`rounded-lg border px-2.5 py-2 text-xs transition ${
          hideNonMatches
            ? "border-accent/40 bg-accent-soft text-paper"
            : "border-edge bg-panel-2 text-fog hover:text-paper"
        }`}
        title="Show only lines that match the search"
      >
        Only matches
      </button>
    </div>
  );
}
