"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { LANGUAGES, supportsLanguage } from "@/lib/languages";
import { PROVIDER_OPTIONS, providerLabel } from "@/lib/providers/catalog";
import type { Job } from "@/lib/transcript/schema";

export type RetranscribeOptions = {
  provider: string;
  language: string;
  numSpeakers: number | null;
};

type Props = {
  job: Job;
  disabled?: boolean;
  onStart: (options: RetranscribeOptions) => Promise<void>;
};

export default function RetranscribeMenu({ job, disabled, onStart }: Props) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState(job.provider);
  const [language, setLanguage] = useState(job.language);
  const [speakers, setSpeakers] = useState(job.numSpeakers ? String(job.numSpeakers) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProvider(job.provider);
    setLanguage(supportsLanguage(job.provider, job.language) ? job.language : "auto");
    setSpeakers(job.numSpeakers ? String(job.numSpeakers) : "");
    setError(null);
  }, [open, job.provider, job.language, job.numSpeakers]);

  const providers = useMemo(() => {
    if (PROVIDER_OPTIONS.some((option) => option.id === job.provider)) return PROVIDER_OPTIONS;
    return [{ id: job.provider, label: providerLabel(job.provider) }, ...PROVIDER_OPTIONS];
  }, [job.provider]);

  const languages = useMemo(
    () => LANGUAGES.filter((option) => supportsLanguage(provider, option.id)),
    [provider],
  );

  const changeProvider = (next: string) => {
    setProvider(next);
    if (!supportsLanguage(next, language)) setLanguage("auto");
  };

  const submit = async () => {
    const parsedSpeakers = speakers.trim() === "" ? null : Number(speakers);
    if (
      parsedSpeakers !== null &&
      (!Number.isInteger(parsedSpeakers) || parsedSpeakers < 1 || parsedSpeakers > 32)
    ) {
      setError("Speakers must be a whole number between 1 and 32.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onStart({ provider, language, numSpeakers: parsedSpeakers });
      setOpen(false);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start the run.");
    } finally {
      setBusy(false);
    }
  };

  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-xs text-fog-dim">
        <RefreshCw size={14} /> Re-transcribe
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-xs text-fog transition hover:border-accent/50 hover:text-paper"
      >
        <RefreshCw size={14} /> Re-transcribe
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-edge bg-panel p-3 shadow-xl">
          <div className="space-y-2.5">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-fog-dim">
                Engine
              </span>
              <select
                value={provider}
                onChange={(event) => changeProvider(event.target.value)}
                className="w-full rounded-md border border-edge bg-panel-2 px-2 py-1.5 text-xs text-paper outline-none focus:border-accent"
              >
                {providers.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-fog-dim">
                Language
              </span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="w-full rounded-md border border-edge bg-panel-2 px-2 py-1.5 text-xs text-paper outline-none focus:border-accent"
              >
                {languages.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-fog-dim">
                Speakers <span className="normal-case">(optional)</span>
              </span>
              <input
                type="number"
                min={1}
                max={32}
                value={speakers}
                onChange={(event) => setSpeakers(event.target.value)}
                placeholder="Auto-detect"
                className="w-full rounded-md border border-edge bg-panel-2 px-2 py-1.5 text-xs text-paper outline-none placeholder:text-fog-dim focus:border-accent"
              />
            </label>

            {error && <p className="text-[11px] text-danger">{error}</p>}

            <p className="text-[10px] leading-relaxed text-fog-dim">
              The current transcript is kept as a version you can restore. The audio is reused; no
              re-upload.
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-edge px-2 py-1 text-xs text-fog hover:text-paper"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-[#07101c] disabled:opacity-60"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
