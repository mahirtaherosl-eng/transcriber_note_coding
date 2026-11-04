import { z } from "zod";

export const SCHEMA_VERSION = 1;

/** Fixed palette used for speaker pills and waveform bands. */
export const SPEAKER_COLORS = [
  "#60a5fa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#fb923c",
  "#22d3ee",
  "#f87171",
  "#a3e635",
  "#c084fc",
] as const;

export const WordSchema = z.object({
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  confidence: z.number().optional(),
});

export const SegmentSchema = z.object({
  id: z.string().min(1),
  speakerId: z.string().nullable(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
  edited: z.boolean().optional(),
  words: z.array(WordSchema),
});

export const SpeakerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  color: z.string(),
});

export const TranscriptSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: z.string().min(1),
    title: z.string(),
    createdAt: z.string().min(1),
    source: z.object({
      fileName: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      durationMs: z.number().int().nonnegative(),
      sha256: z.string(),
    }),
    transcription: z.object({
      provider: z.enum([
        "elevenlabs",
        "gemini",
        "openrouter",
        "qwen",
        "soniox",
        "azure",
        "mock",
      ]),
      model: z.string(),
      requestedLanguage: z.string(),
      detectedLanguage: z.string().optional(),
      languageProbability: z.number().optional(),
    }),
    speakers: z.array(SpeakerSchema),
    segments: z.array(SegmentSchema),
  })
  .superRefine((value, ctx) => {
    const speakerIds = new Set(value.speakers.map((s) => s.id));
    let previousEnd = -1;

    value.segments.forEach((segment, index) => {
      if (segment.endMs <= segment.startMs) {
        ctx.addIssue({
          code: "custom",
          message: `Segment ${segment.id} must end after it starts`,
          path: ["segments", index, "endMs"],
        });
      }
      if (segment.startMs < previousEnd) {
        ctx.addIssue({
          code: "custom",
          message: `Segment ${segment.id} overlaps or is out of order`,
          path: ["segments", index, "startMs"],
        });
      }
      if (segment.speakerId !== null && !speakerIds.has(segment.speakerId)) {
        ctx.addIssue({
          code: "custom",
          message: `Segment ${segment.id} references unknown speaker ${segment.speakerId}`,
          path: ["segments", index, "speakerId"],
        });
      }
      previousEnd = segment.endMs;
    });
  });

export type Word = z.infer<typeof WordSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type Speaker = z.infer<typeof SpeakerSchema>;
export type TranscriptFile = z.infer<typeof TranscriptSchema>;

export const JobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "interrupted",
  "cancelled",
]);

export const JobSchema = z.object({
  id: z.string().min(1),
  status: JobStatusSchema,
  title: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().optional(),
  language: z.string(),
  numSpeakers: z.number().int().positive().optional(),
  provider: z.string(),
  model: z.string().optional(),
  audioFile: z.string().optional(),
  sha256: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  heartbeatAt: z.string().optional(),
  progress: z.string().optional(),
  error: z.string().optional(),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type Job = z.infer<typeof JobSchema>;

export const EditRequestSchema = z.object({
  segments: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().optional(),
        speakerId: z.string().nullable().optional(),
      }),
    )
    .default([]),
  speakers: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        color: z.string().optional(),
      }),
    )
    .default([]),
});
export type EditRequest = z.infer<typeof EditRequestSchema>;
