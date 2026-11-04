import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  HISTORY_VERSION_PATTERN,
  HistoryMetaSchema,
  type HistoryEntry,
  type HistoryReason,
  type TranscriptFile,
} from "@/lib/transcript/schema";
import {
  atomicWriteJson,
  libraryDir,
  readJson,
  readTranscriptFile,
  transcriptPath,
} from "@/lib/storage";

export function historyDir(id: string): string {
  return path.join(libraryDir(id), "history");
}

export function assertSafeHistoryVersion(version: string): string {
  if (!HISTORY_VERSION_PATTERN.test(version)) {
    throw new Error("Invalid history version");
  }
  return version;
}

export function historyTranscriptPath(id: string, version: string): string {
  return path.join(historyDir(id), `${assertSafeHistoryVersion(version)}.transcript.json`);
}

export function historyMetaPath(id: string, version: string): string {
  return path.join(historyDir(id), `${assertSafeHistoryVersion(version)}.meta.json`);
}

function compactUtc(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(
    11,
    13,
  )}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

/** `YYYYMMDDThhmmssZ-<6 hex>`; versions sort lexicographically by archive time. */
export function makeHistoryVersion(
  date: Date = new Date(),
  random: string = crypto.randomUUID(),
): string {
  const suffix = random.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 6).padEnd(6, "0");
  return `${compactUtc(date)}-${suffix}`;
}

/** Stable digest of a parsed transcript. Never hash raw file bytes: formatting differs. */
export function transcriptDigest(transcript: TranscriptFile): string {
  return crypto.createHash("sha256").update(JSON.stringify(transcript)).digest("hex");
}

export function buildHistoryMeta(
  transcript: TranscriptFile,
  version: string,
  reason: HistoryReason,
  archivedAt: string,
): HistoryEntry {
  return HistoryMetaSchema.parse({
    version,
    archivedAt,
    transcribedAt: transcript.createdAt,
    reason,
    provider: transcript.transcription.provider,
    model: transcript.transcription.model,
    requestedLanguage: transcript.transcription.requestedLanguage,
    detectedLanguage: transcript.transcription.detectedLanguage,
    segmentCount: transcript.segments.length,
    speakerCount: transcript.speakers.length,
    durationMs: transcript.source.durationMs,
    sha256: transcriptDigest(transcript),
  });
}

/** Newest first. Version ids embed a fixed-width UTC timestamp, so lexical order is time order. */
export function compareHistoryEntries(a: HistoryEntry, b: HistoryEntry): number {
  return a.version < b.version ? 1 : a.version > b.version ? -1 : 0;
}

export function hasDuplicateHistoryEntry(entries: HistoryEntry[], digest: string): boolean {
  return entries.some((entry) => entry.sha256 === digest);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listHistory(id: string): Promise<HistoryEntry[]> {
  const dir = historyDir(id);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }

  const entries = await Promise.all(
    names
      .filter((name) => name.endsWith(".meta.json"))
      .map(async (name) => {
        try {
          const parsed = HistoryMetaSchema.safeParse(
            await readJson<unknown>(path.join(dir, name)),
          );
          if (!parsed.success) return null;
          if (`${parsed.data.version}.meta.json` !== name) return null;
          if (!(await fileExists(historyTranscriptPath(id, parsed.data.version)))) return null;
          return parsed.data;
        } catch {
          return null;
        }
      }),
  );

  return entries
    .filter((entry): entry is HistoryEntry => Boolean(entry))
    .sort(compareHistoryEntries);
}

/**
 * Copy the current `transcript.json` into `history/` before it is overwritten.
 * Returns null when there is no current transcript or it is already the newest
 * history version. Throws when a transcript exists but cannot be parsed: silently
 * overwriting a corrupt file would destroy the only copy.
 */
export async function archiveCurrentTranscript(
  id: string,
  reason: HistoryReason,
): Promise<HistoryEntry | null> {
  const source = transcriptPath(id);
  if (!(await fileExists(source))) return null;

  const transcript = await readTranscriptFile(source);
  if (!transcript) {
    throw new Error(
      "The current transcript file is unreadable; refusing to overwrite it. Export or delete it first.",
    );
  }

  const entries = await listHistory(id);
  const digest = transcriptDigest(transcript);
  if (hasDuplicateHistoryEntry(entries, digest)) return null;

  const now = new Date();
  const used = new Set(entries.map((entry) => entry.version));
  let version = makeHistoryVersion(now);
  while (used.has(version)) version = makeHistoryVersion(now);

  await atomicWriteJson(historyTranscriptPath(id, version), transcript);
  const meta = buildHistoryMeta(transcript, version, reason, now.toISOString());
  await atomicWriteJson(historyMetaPath(id, version), meta);
  return meta;
}

export type ArchivedTranscriptResult =
  | { status: "missing" }
  | { status: "corrupt" }
  | { status: "ok"; transcript: TranscriptFile };

export async function loadArchivedTranscript(
  id: string,
  version: string,
): Promise<ArchivedTranscriptResult> {
  const filePath = historyTranscriptPath(id, version);
  if (!(await fileExists(filePath))) return { status: "missing" };
  const transcript = await readTranscriptFile(filePath);
  return transcript ? { status: "ok", transcript } : { status: "corrupt" };
}
