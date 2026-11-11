"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { saveSettings } from "@/lib/client/api";
import { PROVIDER_OPTIONS, providerLabel } from "@/lib/providers/catalog";
import {
  KEYED_PROVIDER_IDS,
  isProviderId,
  type KeyedProviderId,
} from "@/lib/providers/ids";
import type { SettingsStatus, SettingsUpdate } from "@/lib/settings/schema";

const EMPTY_DRAFT: Record<KeyedProviderId, string> = {
  openrouter: "",
  elevenlabs: "",
  gemini: "",
};

const SOURCE_LABEL: Record<SettingsStatus["providerSource"], string> = {
  request: "requested for this upload",
  settings: "set here",
  STT_PROVIDER: "set by STT_PROVIDER in .env.local",
  "detected-key": "detected from a configured key",
  mock: "offline mock",
};

const KEY_HELP: Record<KeyedProviderId, string> = {
  openrouter: "OpenRouter key (sk-or-…) — recommended for Cantonese and code-switching.",
  elevenlabs: "ElevenLabs key — good for English and long files.",
  gemini: "Google AI Studio key for Gemini 3.5 Transcribe.",
};

export default function SettingsForm({ initial }: { initial: SettingsStatus }) {
  const [status, setStatus] = useState(initial);
  const [provider, setProvider] = useState(initial.savedProvider ?? "auto");
  const [draft, setDraft] = useState<Record<KeyedProviderId, string>>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState<KeyedProviderId[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedId = provider === "auto" ? null : isProviderId(provider) ? provider : null;
  const selectedKeyStatus =
    selectedId && selectedId !== "mock" ? status.keys[selectedId] : null;
  const selectedUnready = selectedKeyStatus
    ? !selectedKeyStatus.saved && !selectedKeyStatus.env
    : false;

  const markDirty = (id: KeyedProviderId, value: string) => {
    setDraft((previous) => ({ ...previous, [id]: value }));
    setDirty((previous) => (previous.includes(id) ? previous : [...previous, id]));
  };

  const buildPayload = (extraKeys?: SettingsUpdate["keys"]): SettingsUpdate => {
    const payload: SettingsUpdate = {};
    const savedChoice = status.savedProvider ?? "auto";

    if (provider !== savedChoice) {
      payload.provider = provider === "auto" ? null : isProviderId(provider) ? provider : null;
    }

    const keys: NonNullable<SettingsUpdate["keys"]> = {};
    for (const id of KEYED_PROVIDER_IDS) {
      const value = draft[id].trim();
      // A dirty-but-empty field is a no-op, never an accidental clear.
      if (dirty.includes(id) && value) keys[id] = value;
    }
    if (extraKeys) Object.assign(keys, extraKeys);
    if (Object.keys(keys).length > 0) payload.keys = keys;

    return payload;
  };

  const submit = async (extraKeys?: SettingsUpdate["keys"]) => {
    const payload = buildPayload(extraKeys);
    if (!extraKeys && payload.provider === undefined && !payload.keys) {
      setMessage("No changes to save.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await saveSettings(payload);
      setStatus(next);
      setProvider(next.savedProvider ?? "auto");
      setDraft(EMPTY_DRAFT);
      setDirty([]);
      setMessage("Saved. Key changes apply immediately.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  };

  const clearKey = (id: KeyedProviderId) => {
    if (
      !window.confirm(
        `Remove the saved ${providerLabel(id)} key? A .env.local key, if present, will be used instead.`,
      )
    ) {
      return;
    }
    void submit({ [id]: "" } as NonNullable<SettingsUpdate["keys"]>);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-edge bg-panel/80 p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-edge bg-panel-2 p-2 text-accent">
            <KeyRound size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium text-paper">Default engine</h2>
            <p className="mt-0.5 text-xs text-fog">
              Effective default:{" "}
              <span className="text-paper">{providerLabel(status.resolvedProvider)}</span>{" "}
              <span className="text-fog-dim">({SOURCE_LABEL[status.providerSource]})</span>
            </p>

            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="mt-3 w-full rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-paper outline-none focus:border-accent"
            >
              <option value="auto">Auto ({providerLabel(status.resolvedProvider)})</option>
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>

            {selectedUnready && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-200/90">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                This engine has no key yet. Add one below, or choose Auto until you do.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-edge bg-panel/80 p-5">
        <h2 className="text-sm font-medium text-paper">API keys</h2>
        <p className="mt-0.5 text-xs text-fog">
          Values are never shown again after saving. Use “Remove saved key” to delete one.
        </p>

        <div className="mt-4 space-y-4">
          {KEYED_PROVIDER_IDS.map((id) => {
            const keyStatus = status.keys[id];
            return (
              <div key={id} className="rounded-lg border border-edge-soft bg-panel-2/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-paper">{providerLabel(id)}</div>
                    <div className="mt-0.5 text-[10px] text-fog-dim">{KEY_HELP[id]}</div>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      keyStatus.saved
                        ? "border-ok/40 bg-ok/10 text-ok"
                        : keyStatus.env
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-edge text-fog-dim"
                    }`}
                  >
                    {keyStatus.saved
                      ? "Saved in this app"
                      : keyStatus.env
                        ? "Using .env.local"
                        : "Not configured"}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={draft[id]}
                    onChange={(event) => markDirty(id, event.target.value)}
                    placeholder={
                      keyStatus.saved ? "Enter a new key to replace it" : "Paste a key"
                    }
                    className="min-w-0 flex-1 rounded-md border border-edge bg-ink/60 px-2.5 py-1.5 font-mono text-xs text-paper outline-none placeholder:text-fog-dim focus:border-accent"
                  />
                  {keyStatus.saved && (
                    <button
                      type="button"
                      onClick={() => clearKey(id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-md border border-edge px-2 py-1.5 text-[11px] text-fog transition hover:border-danger/40 hover:text-danger disabled:opacity-60"
                    >
                      <Trash2 size={11} /> Remove saved key
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {status.warnings.length > 0 && (
          <div className="mt-4 space-y-1">
            {status.warnings.map((warning) => (
              <p key={warning} className="flex items-start gap-1.5 text-[11px] text-amber-200/90">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                {warning}
              </p>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        {message && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ok">
            <CheckCircle2 size={13} /> {message}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[10px] text-fog-dim">
            <ShieldCheck size={12} /> Stored locally, plaintext. Encrypt backups or exclude the file.
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-[#07101c] disabled:opacity-60"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        </div>
      </section>

      <p className="text-[11px] leading-relaxed text-fog-dim">
        Saved keys take effect immediately. Keys in <span className="font-mono">.env.local</span>{" "}
        are read at server start, so changing that file still requires restarting{" "}
        <span className="font-mono">npm run dev</span>. If the project folder is cloud-synced
        (OneDrive, Dropbox), <span className="font-mono">.data/settings.json</span> and{" "}
        <span className="font-mono">.env.local</span> sync off this machine too.
      </p>
    </div>
  );
}
