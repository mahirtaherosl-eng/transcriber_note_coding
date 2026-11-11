import { openAsBlob } from "node:fs";
import path from "node:path";
import { Agent, FormData, fetch as undiciFetch } from "undici";
import { providerLanguageCode } from "@/lib/languages";
import { getProviderKey } from "@/lib/settings/server";
import type { ProviderResult, SttProvider, Token, TokenType } from "@/lib/providers/types";

const ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";
const MODEL = "scribe_v2";

type ScribeWord = {
  text?: string;
  start?: number;
  end?: number;
  type?: string;
  speaker_id?: string | null;
  logprob?: number;
};

type ScribeResponse = {
  language_code?: string;
  language_probability?: number;
  text?: string;
  words?: ScribeWord[];
  audio_duration_secs?: number;
};

const VALID_TYPES = new Set<TokenType>(["word", "spacing", "audio_event"]);

function toToken(word: ScribeWord): Token | null {
  if (typeof word.start !== "number" || typeof word.end !== "number") return null;
  const type = (word.type ?? "word") as TokenType;
  if (!VALID_TYPES.has(type)) return null;
  return {
    text: word.text ?? "",
    type,
    startMs: Math.max(0, Math.round(word.start * 1000)),
    endMs: Math.max(Math.round(word.start * 1000) + 1, Math.round(word.end * 1000)),
    speakerId: word.speaker_id ?? null,
    confidence: typeof word.logprob === "number" ? Math.exp(word.logprob) : undefined,
  };
}

export const elevenLabsProvider: SttProvider = {
  id: "elevenlabs",
  label: "ElevenLabs Scribe v2",
  capabilities: {
    languages: ["auto", "yue", "en", "bn"],
    diarization: true,
    wordTimestamps: true,
    maxDurationSec: 10 * 60 * 60,
    maxBytes: 3 * 1024 * 1024 * 1024,
  },
  async transcribe(input, ctx): Promise<ProviderResult> {
    const apiKey = getProviderKey("elevenlabs");
    if (!apiKey) {
      throw new Error(
        "No ElevenLabs API key is configured. Add one in Settings, or set ELEVENLABS_API_KEY in .env.local and restart.",
      );
    }

    const blob = await openAsBlob(input.audioPath);
    const form = new FormData();
    form.append("file", blob, path.basename(input.audioPath));
    form.append("model_id", MODEL);
    form.append("diarize", "true");
    form.append("timestamps_granularity", "word");
    form.append("tag_audio_events", "false");

    const languageCode = providerLanguageCode("elevenlabs", input.language);
    if (languageCode) form.append("language_code", languageCode);
    if (input.numSpeakers && input.numSpeakers > 1) {
      form.append("num_speakers", String(input.numSpeakers));
    }

    // Scribe can take many minutes for multi-hour audio; disable undici's default
    // 300s headers/body timeouts so long jobs are not cut off mid-flight.
    const dispatcher = new Agent({
      connectTimeout: 30_000,
      headersTimeout: 0,
      bodyTimeout: 0,
      keepAliveTimeout: 60_000,
    });

    ctx.onProgress?.("Uploading audio to ElevenLabs");

    const response = await undiciFetch(ENDPOINT, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
      signal: ctx.signal,
      dispatcher,
    });

    const bodyText = await response.text();
    if (!response.ok) {
      let detail = bodyText.slice(0, 1200);
      try {
        const parsed = JSON.parse(bodyText) as { detail?: unknown };
        if (typeof parsed.detail === "string") detail = parsed.detail;
      } catch {
        // keep raw text
      }
      throw new Error(`ElevenLabs returned ${response.status}: ${detail}`);
    }

    let parsed: ScribeResponse;
    try {
      parsed = JSON.parse(bodyText) as ScribeResponse;
    } catch {
      throw new Error("ElevenLabs returned an unreadable response.");
    }

    ctx.onProgress?.("Normalizing transcript");

    const tokens = (parsed.words ?? [])
      .map(toToken)
      .filter((token): token is Token => token !== null);

    if (tokens.length === 0) {
      throw new Error("ElevenLabs returned no words. The file may be silent or unsupported.");
    }

    return {
      provider: "elevenlabs",
      model: MODEL,
      detectedLanguage: parsed.language_code,
      languageProbability: parsed.language_probability,
      tokens,
      raw: parsed,
    };
  },
};
