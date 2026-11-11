import type { ProviderId } from "@/lib/providers/ids";

/**
 * Client-safe provider labels. Do not import the provider implementations or the
 * registry here — they pull in `node:fs` and `undici`, which cannot ship to the browser.
 */
export type ProviderOption = {
  id: ProviderId;
  label: string;
};

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: "openrouter", label: "MAI-Transcribe 2 (OpenRouter)" },
  { id: "elevenlabs", label: "ElevenLabs Scribe v2" },
  { id: "gemini", label: "Gemini 3.5 Transcribe" },
  { id: "mock", label: "Offline mock (no API calls)" },
];

export function providerLabel(id: string): string {
  return PROVIDER_OPTIONS.find((option) => option.id === id)?.label ?? id;
}
