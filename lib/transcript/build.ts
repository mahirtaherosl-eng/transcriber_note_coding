import { SCHEMA_VERSION, type Job, type TranscriptFile } from "@/lib/transcript/schema";
import { segmentTokens } from "@/lib/transcript/segment";
import type { ProviderResult } from "@/lib/providers/types";

export function buildTranscript(
  job: Job,
  result: ProviderResult,
  createdAt: string = job.createdAt,
): TranscriptFile {
  const durationMs = job.durationMs ?? 0;
  const { segments, speakers } = segmentTokens(result.tokens, { durationMs });

  if (segments.length === 0) {
    throw new Error("The provider returned no usable words. The file may be silent.");
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: job.id,
    title: job.title,
    createdAt,
    source: {
      fileName: job.fileName,
      mimeType: job.mimeType,
      sizeBytes: job.sizeBytes,
      durationMs,
      sha256: job.sha256 ?? "",
    },
    transcription: {
      provider: result.provider,
      model: result.model,
      requestedLanguage: job.language,
      detectedLanguage: result.detectedLanguage,
      languageProbability: result.languageProbability,
    },
    speakers,
    segments,
  };
}
