import { Agent, fetch as undiciFetch } from "undici";
import type { ProviderResult, SttProvider, Token } from "@/lib/providers/types";

const DEFAULT_URL = "http://127.0.0.1:8001";
const MODEL = "Qwen/Qwen3-ASR-1.7B";

type SidecarWord = {
  text?: string;
  startMs?: number;
  endMs?: number;
  speakerId?: string | null;
};

type SidecarResponse = {
  words?: SidecarWord[];
  language?: string;
  model?: string;
  diarized?: boolean;
  diarizationError?: string | null;
  detail?: unknown;
};

function formatDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : JSON.stringify(item),
      )
      .join("; ");
  }
  return fallback;
}

export const qwenProvider: SttProvider = {
  id: "qwen",
  label: "Qwen3-ASR 1.7B + pyannote (local)",
  capabilities: {
    languages: ["auto", "yue", "zh", "en", "bn"],
    diarization: true,
    wordTimestamps: true,
    maxDurationSec: 2 * 60 * 60,
  },
  async transcribe(input, ctx): Promise<ProviderResult> {
    const base = (process.env.QWEN_ASR_URL || DEFAULT_URL).replace(/\/+$/, "");
    const token = process.env.QWEN_ASR_TOKEN;

    const dispatcher = new Agent({
      connectTimeout: 5_000,
      headersTimeout: 0,
      bodyTimeout: 0,
      keepAliveTimeout: 60_000,
    });

    ctx.onProgress?.("Sending audio to the local Qwen sidecar");

    let response;
    try {
      response = await undiciFetch(`${base}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-sidecar-token": token } : {}),
        },
        body: JSON.stringify({
          audioPath: input.audioPath,
          language: input.language,
          numSpeakers: input.numSpeakers,
        }),
        signal: ctx.signal,
        dispatcher,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new Error(
        "The Qwen sidecar is not running. Start it with `npm run sidecar` in another terminal, then retry.",
      );
    }

    const bodyText = await response.text();
    let data: SidecarResponse;
    try {
      data = JSON.parse(bodyText) as SidecarResponse;
    } catch {
      throw new Error("The Qwen sidecar returned an unreadable response.");
    }

    if (!response.ok) {
      throw new Error(
        `Qwen sidecar returned ${response.status}: ${formatDetail(
          data.detail,
          bodyText.slice(0, 500),
        )}`,
      );
    }

    ctx.onProgress?.("Normalizing transcript");

    const words = data.words ?? [];
    const tokens: Token[] = [];
    for (const word of words) {
      if (typeof word.text !== "string" || !word.text) continue;
      if (typeof word.startMs !== "number" || typeof word.endMs !== "number") continue;
      const startMs = Math.max(0, Math.round(word.startMs));
      tokens.push({
        text: word.text,
        type: "word",
        startMs,
        endMs: Math.max(startMs + 1, Math.round(word.endMs)),
        speakerId: word.speakerId ?? null,
      });
    }

    if (tokens.length === 0) {
      throw new Error("The Qwen sidecar returned no words.");
    }

    if (data.diarizationError) {
      console.warn(`Qwen diarization unavailable: ${data.diarizationError}`);
    }

    return {
      provider: "qwen",
      model: data.model ?? MODEL,
      detectedLanguage: data.language,
      tokens,
      raw: data,
    };
  },
};
