import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent, fetch as undiciFetch } from "undici";
import { requireBinary, runBinary } from "@/lib/audio/ffmpeg";
import { providerLanguageCode } from "@/lib/languages";
import { getProviderKey } from "@/lib/settings/server";
import type { ProviderResult, SttProvider, Token } from "@/lib/providers/types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = "gemini-3.5-transcribe";
const MAX_INLINE_BYTES = 14 * 1024 * 1024;
const MAX_DURATION_SEC = 30 * 60;

type WordAnnotation = {
  type?: string;
  text?: string;
  speaker?: string;
  start_offset?: unknown;
  end_offset?: unknown;
  startOffset?: unknown;
  endOffset?: unknown;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ".m4a": "audio/m4a",
  ".mp4": "audio/m4a",
  ".mov": "audio/m4a",
  ".mp3": "audio/mp3",
  ".mpeg": "audio/mp3",
  ".mpga": "audio/mp3",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".webm": "audio/webm",
  ".aac": "audio/aac",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
};

function resolveMime(mimeType: string, fileName: string): string {
  if (mimeType === "audio/mp4" || mimeType === "video/mp4" || mimeType === "audio/x-m4a") {
    return "audio/m4a";
  }
  if (mimeType === "audio/mpeg") return "audio/mp3";
  if (mimeType === "audio/x-wav") return "audio/wav";
  if (mimeType === "audio/x-aiff") return "audio/aiff";
  if (mimeType.startsWith("audio/")) return mimeType;
  return MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()] ?? "audio/mp3";
}

function parseOffset(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value * 1000));
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const milliseconds = /^([\d.]+)\s*ms$/i.exec(trimmed);
  if (milliseconds) return Math.max(0, Math.round(Number(milliseconds[1])));

  const seconds = /^([\d.]+)\s*s$/i.exec(trimmed);
  if (seconds) return Math.max(0, Math.round(Number(seconds[1]) * 1000));

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric * 1000)) : null;
}

function collectWordAnnotations(node: unknown, output: WordAnnotation[], seen: WeakSet<object>): void {
  if (!node || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) collectWordAnnotations(item, output, seen);
    return;
  }

  const record = node as Record<string, unknown>;
  if (
    (record.type === "word_info" || record.type === "wordInfo") &&
    typeof record.text === "string"
  ) {
    output.push(record as WordAnnotation);
  }

  for (const value of Object.values(record)) {
    collectWordAnnotations(value, output, seen);
  }
}

async function prepareAudio(
  audioPath: string,
  fileName: string,
  mimeType: string,
): Promise<{ path: string; mimeType: string; cleanup: () => Promise<void> }> {
  const stats = await fs.stat(audioPath);
  const mime = resolveMime(mimeType, fileName);

  if (stats.size <= MAX_INLINE_BYTES) {
    return { path: audioPath, mimeType: mime, cleanup: async () => undefined };
  }

  // Keep the base64 body under the 20 MB inline limit. Opus at 24 kbps mono is
  // ample for speech and roughly 11 MB per hour.
  const temporary = path.join(os.tmpdir(), `transcriber-gemini-${randomUUID()}.ogg`);
  await runBinary(
    requireBinary("ffmpeg"),
    [
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
    ],
    30 * 60 * 1000,
  );

  return {
    path: temporary,
    mimeType: "audio/ogg",
    cleanup: async () => {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    },
  };
}

export const geminiProvider: SttProvider = {
  id: "gemini",
  label: "Gemini 3.5 Transcribe",
  capabilities: {
    languages: ["auto", "yue", "en", "bn", "zh"],
    diarization: true,
    wordTimestamps: true,
    maxDurationSec: MAX_DURATION_SEC,
  },
  async transcribe(input, ctx): Promise<ProviderResult> {
    const apiKey = getProviderKey("gemini");
    if (!apiKey) {
      throw new Error(
        "No Gemini API key is configured. Add one in Settings, or set GEMINI_API_KEY in .env.local and restart.",
      );
    }

    if (input.durationSec > MAX_DURATION_SEC) {
      throw new Error(
        "Gemini 3.5 Transcribe supports up to 30 minutes per request when diarization and word timestamps are enabled. Split longer audio first.",
      );
    }

    const prepared = await prepareAudio(input.audioPath, input.fileName, input.mimeType);

    try {
      ctx.onProgress?.("Uploading audio to Gemini");
      const base64 = (await fs.readFile(prepared.path)).toString("base64");
      const languageCode = providerLanguageCode("gemini", input.language);

      const transcriptionConfig: Record<string, unknown> = {
        mode: {
          type: "verbatim",
          diarization_mode: "speaker",
          timestamp_granularities: ["word"],
        },
      };
      if (languageCode) transcriptionConfig.language_codes = [languageCode];

      const payload = {
        model: MODEL,
        input: [{ type: "audio", data: base64, mime_type: prepared.mimeType }],
        generation_config: { transcription_config: transcriptionConfig },
      };

      const dispatcher = new Agent({
        connectTimeout: 30_000,
        headersTimeout: 0,
        bodyTimeout: 0,
        keepAliveTimeout: 60_000,
      });

      const response = await undiciFetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
        signal: ctx.signal,
        dispatcher,
      });

      const bodyText = await response.text();
      if (!response.ok) {
        let detail = bodyText.slice(0, 1200);
        try {
          const parsed = JSON.parse(bodyText) as {
            error?: { message?: string };
            message?: string;
          };
          detail = parsed.error?.message ?? parsed.message ?? detail;
        } catch {
          // keep raw text
        }
        throw new Error(`Gemini returned ${response.status}: ${detail}`);
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(bodyText) as Record<string, unknown>;
      } catch {
        throw new Error("Gemini returned an unreadable response.");
      }

      ctx.onProgress?.("Normalizing transcript");

      const annotations: WordAnnotation[] = [];
      collectWordAnnotations(data, annotations, new WeakSet());

      const tokens: Token[] = [];
      for (const annotation of annotations) {
        const text = annotation.text;
        const start = parseOffset(annotation.start_offset ?? annotation.startOffset);
        const end = parseOffset(annotation.end_offset ?? annotation.endOffset);
        if (!text || start === null || end === null) continue;

        tokens.push({
          text,
          type: "word",
          startMs: start,
          endMs: Math.max(start + 1, end),
          speakerId: annotation.speaker ?? null,
        });
      }

      tokens.sort((a, b) => a.startMs - b.startMs);

      if (tokens.length === 0) {
        const outputText =
          typeof data.output_text === "string" ? data.output_text : undefined;
        throw new Error(
          `Gemini returned no word timestamps${
            outputText
              ? ` (it returned ${outputText.length} characters of text, but no annotations)`
              : ""
          }. Check that diarization and word timestamps are available for this model.`,
        );
      }

      return {
        provider: "gemini",
        model: MODEL,
        tokens,
        raw: data,
      };
    } finally {
      await prepared.cleanup();
    }
  },
};
