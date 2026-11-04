/**
 * Client-safe provider labels. Do not import the provider implementations or the
 * registry here — they pull in `node:fs` and `undici`, which cannot ship to the browser.
 */
export type ProviderOption = {
  id: string;
  label: string;
};

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: "openrouter", label: "MAI-Transcribe 2 (OpenRouter)" },
  { id: "gemini", label: "Gemini 3.5 Transcribe" },
  { id: "qwen", label: "Qwen3-ASR 1.7B + pyannote (local)" },
  { id: "elevenlabs", label: "ElevenLabs Scribe v2" },
  { id: "mock", label: "Offline mock (no API calls)" },
];

export function providerLabel(id: string): string {
  return PROVIDER_OPTIONS.find((option) => option.id === id)?.label ?? id;
}
