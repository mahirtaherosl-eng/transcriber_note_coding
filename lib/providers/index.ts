import { elevenLabsProvider } from "@/lib/providers/elevenlabs";
import { geminiProvider } from "@/lib/providers/gemini";
import { openRouterProvider } from "@/lib/providers/openrouter";
import { qwenProvider } from "@/lib/providers/qwen";
import { mockProvider } from "@/lib/providers/mock";
import { azureProvider } from "@/lib/providers/azure";
import { sonioxProvider } from "@/lib/providers/soniox";
import type { ProviderId } from "@/lib/languages";
import type { SttProvider } from "@/lib/providers/types";

export const PROVIDERS: Record<ProviderId, SttProvider> = {
  mock: mockProvider,
  elevenlabs: elevenLabsProvider,
  gemini: geminiProvider,
  openrouter: openRouterProvider,
  qwen: qwenProvider,
  soniox: sonioxProvider,
  azure: azureProvider,
};

export function resolveProviderId(explicit?: string | null): ProviderId {
  if (explicit && explicit in PROVIDERS) return explicit as ProviderId;
  const configured = process.env.STT_PROVIDER;
  if (configured && configured in PROVIDERS) return configured as ProviderId;
  return process.env.ELEVENLABS_API_KEY
    ? "elevenlabs"
    : process.env.GEMINI_API_KEY
      ? "gemini"
      : process.env.OPENROUTER_API_KEY
        ? "openrouter"
        : "mock";
}

export function getProvider(explicit?: string | null): SttProvider {
  return PROVIDERS[resolveProviderId(explicit)];
}

export type { SttProvider };
