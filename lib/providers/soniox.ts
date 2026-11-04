import type { SttProvider } from "@/lib/providers/types";

/**
 * Placeholder for the Soniox stt-async-v5 adapter.
 *
 * Soniox is ~half the price of Scribe and handles mid-sentence code-switching, but
 * its Cantonese (`yue`) support is unconfirmed — verify with the Soniox "Get models"
 * endpoint before wiring this up. Bengali (`bn`) is confirmed.
 */
export const sonioxProvider: SttProvider = {
  id: "soniox",
  label: "Soniox (not configured)",
  capabilities: {
    languages: ["auto", "en", "bn"],
    diarization: true,
    wordTimestamps: true,
    maxDurationSec: 5 * 60 * 60,
  },
  async transcribe() {
    throw new Error(
      "The Soniox adapter is a stub. Implement lib/providers/soniox.ts and set SONIOX_API_KEY to enable it.",
    );
  },
};
