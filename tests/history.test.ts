import { describe, expect, it } from "vitest";
import {
  assertSafeHistoryVersion,
  buildHistoryMeta,
  compareHistoryEntries,
  hasDuplicateHistoryEntry,
  makeHistoryVersion,
  transcriptDigest,
} from "@/lib/history";
import type { HistoryEntry, TranscriptFile } from "@/lib/transcript/schema";

const transcript: TranscriptFile = {
  schemaVersion: 1,
  id: "abc123",
  title: "Meeting",
  createdAt: "2026-11-04T14:30:12.345Z",
  source: {
    fileName: "meeting.m4a",
    mimeType: "audio/mp4",
    sizeBytes: 1234,
    durationMs: 118_000,
    sha256: "audio-digest",
  },
  transcription: {
    provider: "openrouter",
    model: "microsoft/mai-transcribe-2",
    requestedLanguage: "yue",
    detectedLanguage: "mixed",
  },
  speakers: [
    { id: "spk_1", name: "Speaker 1", color: "#60a5fa" },
    { id: "spk_2", name: "Speaker 2", color: "#f472b6" },
  ],
  segments: [
    {
      id: "seg_0001",
      speakerId: "spk_1",
      startMs: 0,
      endMs: 1000,
      text: "你好",
      words: [{ text: "你好", startMs: 0, endMs: 1000 }],
    },
    {
      id: "seg_0002",
      speakerId: "spk_2",
      startMs: 1000,
      endMs: 2000,
      text: "Hello",
      edited: true,
      words: [{ text: "Hello", startMs: 1000, endMs: 2000 }],
    },
  ],
};

function entry(version: string): HistoryEntry {
  return {
    version,
    archivedAt: "2026-11-04T15:00:00.000Z",
    transcribedAt: "2026-11-04T14:00:00.000Z",
    reason: "rerun",
    provider: "openrouter",
    model: "microsoft/mai-transcribe-2",
    requestedLanguage: "yue",
    segmentCount: 1,
    speakerCount: 1,
    durationMs: 1000,
    sha256: "digest",
  };
}

describe("history versions", () => {
  it("formats a fixed-width UTC version", () => {
    const date = new Date("2026-11-04T14:30:12.345Z");
    expect(makeHistoryVersion(date, "abcdef123456")).toBe("20261104T143012Z-abcdef");
  });

  it("pads short random suffixes", () => {
    const date = new Date("2026-01-02T03:04:05.000Z");
    expect(makeHistoryVersion(date, "ab")).toBe("20260102T030405Z-ab0000");
  });

  it("rejects unsafe or malformed versions", () => {
    expect(() => assertSafeHistoryVersion("20261104T143012Z-abcdef")).not.toThrow();
    expect(() => assertSafeHistoryVersion("../escape")).toThrow();
    expect(() => assertSafeHistoryVersion("")).toThrow();
    expect(() => assertSafeHistoryVersion("20261104T143012Z-ABCDEF")).toThrow();
    expect(() => assertSafeHistoryVersion("x".repeat(80))).toThrow();
  });

  it("sorts newest first by version id", () => {
    const entries = [entry("20261104T143012Z-aaaaaa"), entry("20261105T090000Z-bbbbbb")];
    expect(entries.sort(compareHistoryEntries).map((item) => item.version)).toEqual([
      "20261105T090000Z-bbbbbb",
      "20261104T143012Z-aaaaaa",
    ]);
  });
});

describe("history metadata", () => {
  it("derives metadata from the transcript, not the job", () => {
    const meta = buildHistoryMeta(
      transcript,
      "20261104T150000Z-abcdef",
      "rerun",
      "2026-11-04T15:00:00.000Z",
    );

    expect(meta.transcribedAt).toBe(transcript.createdAt);
    expect(meta.reason).toBe("rerun");
    expect(meta.provider).toBe("openrouter");
    expect(meta.model).toBe("microsoft/mai-transcribe-2");
    expect(meta.requestedLanguage).toBe("yue");
    expect(meta.detectedLanguage).toBe("mixed");
    expect(meta.segmentCount).toBe(2);
    expect(meta.speakerCount).toBe(2);
    expect(meta.durationMs).toBe(118_000);
    expect(meta.sha256).toBe(transcriptDigest(transcript));
  });

  it("detects duplicates anywhere in the history", () => {
    const digest = transcriptDigest(transcript);
    expect(hasDuplicateHistoryEntry([], digest)).toBe(false);
    expect(
      hasDuplicateHistoryEntry(
        [
          entry("20261105T090000Z-bbbbbb"),
          { ...entry("20261104T150000Z-abcdef"), sha256: digest },
        ],
        digest,
      ),
    ).toBe(true);
    expect(hasDuplicateHistoryEntry([entry("20261104T150000Z-abcdef")], digest)).toBe(false);
  });

  it("hashes the parsed transcript stably", () => {
    const copy = structuredClone(transcript);
    expect(transcriptDigest(copy)).toBe(transcriptDigest(transcript));

    copy.segments[0].text = "再見";
    expect(transcriptDigest(copy)).not.toBe(transcriptDigest(transcript));
  });
});
