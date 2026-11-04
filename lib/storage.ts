import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { JobSchema, TranscriptSchema, type Job, type TranscriptFile } from "@/lib/transcript/schema";

export const DATA_DIR = path.join(process.cwd(), ".data");
export const LIBRARY_DIR = path.join(DATA_DIR, "library");

const ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

export function assertSafeId(id: string): string {
  if (!ID_PATTERN.test(id)) {
    throw new Error("Invalid transcription id");
  }
  return id;
}

export function libraryDir(id: string): string {
  return path.join(LIBRARY_DIR, assertSafeId(id));
}

export function jobPath(id: string): string {
  return path.join(libraryDir(id), "job.json");
}

export function transcriptPath(id: string): string {
  return path.join(libraryDir(id), "transcript.json");
}

export function peaksPath(id: string): string {
  return path.join(libraryDir(id), "peaks.json");
}

export function rawPath(id: string): string {
  return path.join(libraryDir(id), "raw.json");
}

export function audioPath(id: string, fileName: string): string {
  return path.join(libraryDir(id), fileName);
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function ensureLibraryDir(id: string): Promise<string> {
  const dir = libraryDir(id);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function atomicWriteFile(filePath: string, data: string | Buffer): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(temp, data);
  await fs.rename(temp, filePath);
}

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function readJob(id: string): Promise<Job | null> {
  try {
    const raw = await readJson<unknown>(jobPath(id));
    const parsed = JobSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeJob(job: Job): Promise<void> {
  await atomicWriteJson(jobPath(job.id), JobSchema.parse(job));
}

export async function readTranscriptFile(filePath: string): Promise<TranscriptFile | null> {
  try {
    const raw = await readJson<unknown>(filePath);
    const parsed = TranscriptSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function readTranscript(id: string): Promise<TranscriptFile | null> {
  return readTranscriptFile(transcriptPath(id));
}

export async function writeTranscript(transcript: TranscriptFile): Promise<void> {
  const parsed = TranscriptSchema.safeParse(transcript);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") || "root";
    throw new Error(
      `Transcript validation failed at ${path}: ${issue?.message ?? "unknown error"}`,
    );
  }
  await atomicWriteJson(transcriptPath(parsed.data.id), parsed.data);
}

export async function listJobIds(): Promise<string[]> {
  try {
    const entries = await fs.readdir(LIBRARY_DIR, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function listJobs(): Promise<Job[]> {
  const ids = await listJobIds();
  const jobs = await Promise.all(ids.map((id) => readJob(id)));
  return jobs
    .filter((job): job is Job => Boolean(job))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function deleteTranscription(id: string): Promise<void> {
  await fs.rm(libraryDir(id), { recursive: true, force: true });
}

export async function hashFile(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

/** Finds the stored audio file for a job by its recorded name, falling back to `original.*`. */
export async function findAudioFile(job: Job): Promise<string | null> {
  const dir = libraryDir(job.id);
  if (job.audioFile) {
    const candidate = path.join(dir, job.audioFile);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // fall through
    }
  }
  try {
    const entries = await fs.readdir(dir);
    const match = entries.find((name) => name.startsWith("original."));
    return match ? path.join(dir, match) : null;
  } catch {
    return null;
  }
}

export function safeExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "");
  if (!ext || ext.length > 8) return ".bin";
  return ext;
}

export function safeBaseName(fileName: string): string {
  return (
    path
      .basename(fileName, path.extname(fileName))
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Conversation"
  );
}
