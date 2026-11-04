import type { SttProvider } from "@/lib/providers/types";

/**
 * Placeholder for Azure Speech fast transcription.
 *
 * Azure is the recommended fallback for Bengali (`bn-IN`) and Cantonese (`zh-HK`),
 * and its diarization is strong, but it costs roughly 4-5x Scribe. Wire this up only
 * if the language-quality spike shows Scribe is insufficient.
 */
export const azureProvider: SttProvider = {
  id: "azure",
  label: "Azure Speech (not configured)",
  capabilities: {
    languages: ["auto", "yue", "bn", "en"],
    diarization: true,
    wordTimestamps: true,
  },
  async transcribe() {
    throw new Error(
      "The Azure adapter is a stub. Implement lib/providers/azure.ts and set AZURE_SPEECH_KEY / AZURE_SPEECH_REGION to enable it.",
    );
  },
};
