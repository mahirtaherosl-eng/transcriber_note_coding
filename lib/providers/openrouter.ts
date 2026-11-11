import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent, fetch as undiciFetch } from "undici";
import { requireBinary, runBinary } from "@/lib/audio/ffmpeg";
import { getProviderKey } from "@/lib/settings/server";
import type { ProviderResult, SttProvider, Token } from "@/lib/providers/types";

const ENDPOINT = "https://openrouter.ai/api/v1/audio/transcriptions";
const DEFAULT_MODEL = "microsoft/mai-transcribe-2";
// OpenRouter caps the request at 25 MB; base64 inflates by ~33%.
const MAX_RAW_BYTES = 16 * 1024 * 1024;
const CONFIGURED_MODEL = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

function isMaiModel(model: string): boolean {
  return model === "microsoft/mai-transcribe-2" || model.startsWith("microsoft/mai-transcribe-2-");
}

type TranscriptItem = {
  text?: string;
  word?: string;
  start?: number;
  end?: number;
  speaker?: string | number | null;
  speaker_label?: string | null;
};

type OpenRouterResponse = {
  text?: string;
  language?: string;
  duration?: number;
  segments?: TranscriptItem[];
  words?: TranscriptItem[];
  error?: { message?: string } | string;
  detail?: unknown;
};

const FORMAT_BY_EXTENSION: Record<string, string> = {
  ".mp3": "mp3",
  ".mpeg": "mp3",
  ".mpga": "mp3",
  ".wav": "wav",
  ".m4a": "m4a",
  ".mp4": "m4a",
  ".mov": "m4a",
  ".flac": "flac",
  ".ogg": "ogg",
  ".oga": "ogg",
  ".opus": "ogg",
  ".webm": "webm",
  ".aac": "aac",
};

// MAI-Transcribe-2 is served by OpenRouter's Azure upstream, which rejects
// M4A/MP4/AAC/WebM/OGG. This is unrelated to the removed direct Azure adapter:
// the formats and provider.options.azure below are required for MAI.
const AZURE_AUDIO_FORMATS = new Set(["mp3", "wav", "flac"]);

function formatFor(fileName: string, mimeType: string): string {
  const fromName = FORMAT_BY_EXTENSION[path.extname(fileName).toLowerCase()];
  if (fromName) return fromName;
  if (mimeType === "audio/mp4" || mimeType === "video/mp4" || mimeType === "audio/x-m4a") {
    return "m4a";
  }
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/x-wav") return "wav";
  if (mimeType === "audio/x-aiff") return "wav";
  return "mp3";
}

async function prepareAudio(
  audioPath: string,
  fileName: string,
  mimeType: string,
  model: string,
  durationSec: number,
): Promise<{ path: string; format: string; cleanup: () => Promise<void> }> {
  const format = formatFor(fileName, mimeType);
  const stats = await fs.stat(audioPath);
  const needsAzureMp3 = isMaiModel(model) && !AZURE_AUDIO_FORMATS.has(format);

  if (!needsAzureMp3 && stats.size <= MAX_RAW_BYTES) {
    return {
      path: audioPath,
      format,
      cleanup: async () => undefined,
    };
  }

  const useMp3 = isMaiModel(model);
  const temporary = path.join(
    os.tmpdir(),
    `transcriber-openrouter-${randomUUID()}.${useMp3 ? "mp3" : "ogg"}`,
  );
  // 64 kbps mono is plenty for speech; drop to 32 kbps on long files so the
  // base64 body stays under OpenRouter's 25 MB request cap.
  const bitrate = durationSec > 1800 ? "32k" : "64k";
  const args = useMp3
    ? ["-y", "-i", audioPath, "-ac", "1", "-ar", "16000", "-b:a", bitrate, temporary]
    : [
        "-y",
        "-i",
        audioPath,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libopus",
        "-b:a",
        "24k",
        temporary,
      ];

  await runBinary(requireBinary("ffmpeg"), args, 30 * 60 * 1000);

  return {
    path: temporary,
    format: useMp3 ? "mp3" : "ogg",
    cleanup: async () => {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    },
  };
}

function normalizeSpeaker(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!text) return null;
  return /^\d+$/.test(text) ? `speaker_${text}` : text;
}

function itemText(item: TranscriptItem): string {
  if (typeof item.text === "string" && item.text) return item.text;
  if (typeof item.word === "string" && item.word) return item.word;
  return "";
}

function itemSpeaker(item: TranscriptItem): string | null {
  return normalizeSpeaker(item.speaker ?? item.speaker_label);
}

function errorMessage(data: OpenRouterResponse, fallback: string): string {
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error === "object" && data.error.message) {
    return data.error.message;
  }
  if (typeof data.detail === "string") return data.detail;
  return fallback;
}

export const openRouterProvider: SttProvider = {
  id: "openrouter",
  label: isMaiModel(CONFIGURED_MODEL)
    ? "MAI-Transcribe 2 (OpenRouter)"
    : "Gemini 3.5 Transcribe (OpenRouter)",
  capabilities: {
    languages: ["auto", "yue", "zh", "en", "bn"],
    // MAI's Azure endpoint supports diarization; Gemini's Google AI Studio
    // endpoint reports supports_diarization=false through OpenRouter.
    diarization: isMaiModel(CONFIGURED_MODEL),
    wordTimestamps: true,
    maxDurationSec: 60 * 60,
    maxBytes: 25 * 1024 * 1024,
  },
  async transcribe(input, ctx): Promise<ProviderResult> {
    const apiKey = getProviderKey("openrouter");
    if (!apiKey) {
      throw new Error(
        "No OpenRouter API key is configured. Add one in Settings, or set OPENROUTER_API_KEY in .env.local and restart.",
      );
    }

    if (input.durationSec > 30 * 60) {
      throw new Error(
        "Gemini 3.5 Transcribe supports up to 30 minutes when diarization and word timestamps are enabled. Split longer audio first.",
      );
    }

    const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
    const prepared = await prepareAudio(
      input.audioPath,
      input.fileName,
      input.mimeType,
      model,
      input.durationSec,
    );

    try {
      ctx.onProgress?.("Uploading audio to OpenRouter");
      const base64 = (await fs.readFile(prepared.path)).toString("base64");

      const payload: Record<string, unknown> = {
        model,
        input_audio: { format: prepared.format, data: base64 },
        response_format: "verbose_json",
        timestamp_granularities: ["segment", "word"],
      };

      if (isMaiModel(model)) {
        payload.provider = {
          options: {
            azure: {
              diarization: { enabled: true },
            },
          },
        };
      }

      const dispatcher = new Agent({
        connectTimeout: 30_000,
        headersTimeout: 120_000,
        bodyTimeout: 120_000,
        keepAliveTimeout: 60_000,
      });

      const response = await undiciFetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://127.0.0.1:3000",
          "X-Title": "Transcriber",
        },
        body: JSON.stringify(payload),
        signal: ctx.signal,
        dispatcher,
      });

      const bodyText = await response.text();
      let data: OpenRouterResponse;
      try {
        data = JSON.parse(bodyText) as OpenRouterResponse;
      } catch {
        throw new Error(
          `OpenRouter returned ${response.status} with an unreadable response.`,
        );
      }

      if (!response.ok) {
        throw new Error(
          `OpenRouter returned ${response.status}: ${errorMessage(
            data,
            bodyText.slice(0, 500),
          )}`,
        );
      }

      ctx.onProgress?.("Normalizing transcript");

      const segments = Array.isArray(data.segments) ? data.segments : [];
      const words = Array.isArray(data.words) ? data.words : [];
      const items = segments.length > 0 ? segments : words;

      const tokens: Token[] = [];
      for (const item of items) {
        const text = itemText(item);
        if (!text) continue;
        const startSeconds = typeof item.start === "number" ? item.start : null;
        const endSeconds = typeof item.end === "number" ? item.end : null;
        if (startSeconds === null || endSeconds === null) continue;

        const startMs = Math.max(0, Math.round(startSeconds * 1000));
        tokens.push({
          text,
          type: "word",
          startMs,
          endMs: Math.max(startMs + 1, Math.round(endSeconds * 1000)),
          speakerId: itemSpeaker(item),
        });
      }

      if (tokens.length === 0 && data.text) {
        const durationMs = Math.round(
          (data.duration ?? input.durationSec) * 1000,
        );
        tokens.push({
          text: data.text,
          type: "word",
          startMs: 0,
          endMs: Math.max(1, durationMs),
          speakerId: null,
        });
      }

      if (tokens.length === 0) {
        throw new Error("OpenRouter returned an empty transcript.");
      }

      const fullText =
        typeof data.text === "string"
          ? data.text
          : tokens.map((token) => token.text).join(" ");
      const hasCjk = /[㐀-鿿]/.test(fullText);
      const hasLatin = /[A-Za-z]/.test(fullText);

      return {
        provider: "openrouter",
        model,
        // OpenRouter reports the dominant language (often "en") even when the
        // transcript is code-switched; label that case honestly.
        detectedLanguage: hasCjk && hasLatin ? "mixed" : data.language,
        tokens,
        raw: data,
      };
    } finally {
      await prepared.cleanup();
    }
  },
};
