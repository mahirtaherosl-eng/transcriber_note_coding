import type { ProviderId } from "@/lib/providers/ids";

export type TokenType = "word" | "spacing" | "audio_event";

export type Token = {
  text: string;
  type: TokenType;
  startMs: number;
  endMs: number;
  speakerId?: string | null;
  confidence?: number;
};

export type TranscribeInput = {
  audioPath: string;
  fileName: string;
  mimeType: string;
  durationSec: number;
  language: string;
  numSpeakers?: number;
};

export type TranscribeContext = {
  signal: AbortSignal;
  onProgress?: (phase: string) => void;
};

export type ProviderResult = {
  provider: ProviderId;
  model: string;
  detectedLanguage?: string;
  languageProbability?: number;
  tokens: Token[];
  raw: unknown;
};

export type SttProvider = {
  id: ProviderId;
  label: string;
  capabilities: {
    languages: string[];
    diarization: boolean;
    wordTimestamps: boolean;
    maxDurationSec?: number;
    maxBytes?: number;
  };
  transcribe(input: TranscribeInput, ctx: TranscribeContext): Promise<ProviderResult>;
};
