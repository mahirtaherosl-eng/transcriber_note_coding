import { elevenLabsProvider } from "@/lib/providers/elevenlabs";
import { geminiProvider } from "@/lib/providers/gemini";
import { isProviderId, type ProviderId } from "@/lib/providers/ids";
import { openRouterProvider } from "@/lib/providers/openrouter";
import { mockProvider } from "@/lib/providers/mock";
import { resolveProviderId } from "@/lib/settings/server";
import type { SttProvider } from "@/lib/providers/types";

export const PROVIDERS: Record<ProviderId, SttProvider> = {
  openrouter: openRouterProvider,
  elevenlabs: elevenLabsProvider,
  gemini: geminiProvider,
  mock: mockProvider,
};

export { isProviderId, resolveProviderId };

export function getProvider(explicit?: string | null): SttProvider {
  if (explicit && explicit !== "auto" && !isProviderId(explicit)) {
    throw new Error(`Unknown provider "${explicit}".`);
  }
  return PROVIDERS[resolveProviderId(explicit)];
}
