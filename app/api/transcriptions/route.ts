import { promises as fs } from "node:fs";
import { isProviderId, PROVIDERS, resolveProviderId } from "@/lib/providers";
import { supportsLanguage } from "@/lib/languages";
import { providerReady } from "@/lib/settings/server";
import { enqueue } from "@/lib/jobs/queue";
import { createJob } from "@/lib/jobs/store";
import { probeAudio } from "@/lib/audio/probe";
import {
  audioPath,
  ensureLibraryDir,
  hashFile,
  libraryDir,
  listJobs as listStoredJobs,
  newId,
  safeBaseName,
  safeExtension,
} from "@/lib/storage";
import { mimeForFileName } from "@/lib/server/http";
import { saveRequestBody, UploadTooLargeError } from "@/lib/server/upload";
import type { Job } from "@/lib/transcript/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DURATION_SEC = 4 * 60 * 60;

export async function GET() {
  const jobs = await listStoredJobs();
  const defaultProvider = resolveProviderId();
  return Response.json({
    jobs,
    defaultProvider,
    defaultProviderReady: providerReady(defaultProvider),
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const fileName = (url.searchParams.get("fileName") ?? "recording").slice(0, 240);
  const language = url.searchParams.get("language") ?? "auto";
  const requestedProvider = url.searchParams.get("provider");
  if (requestedProvider && requestedProvider !== "auto" && !isProviderId(requestedProvider)) {
    return Response.json({ error: `Unknown provider "${requestedProvider}".` }, { status: 400 });
  }
  const providerId = resolveProviderId(requestedProvider);

  if (!providerReady(providerId)) {
    return Response.json(
      {
        error: `The ${PROVIDERS[providerId].label} engine needs an API key. Add one in Settings (or .env.local) and try again.`,
      },
      { status: 400 },
    );
  }

  if (!supportsLanguage(providerId, language)) {
    return Response.json(
      { error: `The selected provider does not support the language "${language}".` },
      { status: 400 },
    );
  }

  const numSpeakersRaw = Number(url.searchParams.get("numSpeakers"));
  const numSpeakers =
    Number.isInteger(numSpeakersRaw) && numSpeakersRaw >= 1 && numSpeakersRaw <= 32
      ? numSpeakersRaw
      : undefined;

  const mimeType =
    url.searchParams.get("mimeType") || mimeForFileName(fileName, "application/octet-stream");

  const id = newId();
  const extension = safeExtension(fileName);
  const storedName = `original${extension}`;

  await ensureLibraryDir(id);
  const destination = audioPath(id, storedName);

  let sizeBytes: number;
  try {
    sizeBytes = await saveRequestBody(request, destination);
  } catch (error) {
    await fs.rm(libraryDir(id), { recursive: true, force: true });
    if (error instanceof UploadTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 },
    );
  }

  if (sizeBytes === 0) {
    await fs.rm(libraryDir(id), { recursive: true, force: true });
    return Response.json({ error: "The uploaded file is empty." }, { status: 400 });
  }

  try {
    const probe = await probeAudio(destination);
    if (probe.durationMs > MAX_DURATION_SEC * 1000) {
      throw new Error(`Audio is longer than the ${MAX_DURATION_SEC / 3600}-hour limit.`);
    }

    const timestamp = new Date().toISOString();
    const job: Job = {
      id,
      status: "queued",
      title: safeBaseName(fileName),
      fileName,
      mimeType,
      sizeBytes,
      durationMs: probe.durationMs,
      language,
      numSpeakers,
      provider: providerId,
      audioFile: storedName,
      sha256: await hashFile(destination),
      createdAt: timestamp,
      updatedAt: timestamp,
      progress: "Queued",
    };

    await createJob(job);
    enqueue(id);
    return Response.json({ id });
  } catch (error) {
    await fs.rm(libraryDir(id), { recursive: true, force: true });
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not read this audio file." },
      { status: 400 },
    );
  }
}
