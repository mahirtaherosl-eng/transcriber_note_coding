import { promises as fs } from "node:fs";
import path from "node:path";
import { generatePeaks } from "@/lib/audio/peaks";
import { probeAudio } from "@/lib/audio/probe";
import { patchJob } from "@/lib/jobs/store";
import {
  assertSafeId,
  atomicWriteJson,
  audioPath,
  findAudioFile,
  hashFile,
  peaksPath,
  readJob,
  readTranscript,
  safeExtension,
  writeTranscript,
} from "@/lib/storage";
import { mimeForFileName } from "@/lib/server/http";
import { saveRequestBody, UploadTooLargeError } from "@/lib/server/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    assertSafeId(id);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const job = await readJob(id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const fileName = (url.searchParams.get("fileName") ?? job.fileName ?? "audio").slice(0, 240);
  const mimeType = url.searchParams.get("mimeType") || mimeForFileName(fileName);
  const storedName = `original${safeExtension(fileName)}`;
  const destination = audioPath(id, storedName);
  const previous = await findAudioFile(job);

  let sizeBytes: number;
  try {
    sizeBytes = await saveRequestBody(request, destination);
  } catch (error) {
    if (error instanceof UploadTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    return Response.json({ error: "Could not save the audio file." }, { status: 400 });
  }

  try {
    const probe = await probeAudio(destination);
    const sha256 = await hashFile(destination);

    if (previous && path.resolve(previous) !== path.resolve(destination)) {
      await fs.rm(previous, { force: true });
    }

    const transcript = await readTranscript(id);
    let warning: string | undefined;
    if (transcript?.source.sha256 && sha256 !== transcript.source.sha256) {
      warning =
        "This audio file does not match the one this transcript was made from. Timestamps may not line up.";
    }

    if (transcript) {
      transcript.source.fileName = fileName;
      transcript.source.mimeType = mimeType;
      transcript.source.sizeBytes = sizeBytes;
      transcript.source.durationMs = probe.durationMs;
      await writeTranscript(transcript);
    }

    const updatedJob = await patchJob(id, {
      audioFile: storedName,
      fileName,
      mimeType,
      sizeBytes,
      durationMs: probe.durationMs,
      sha256,
      status: "completed",
      error: undefined,
      progress: undefined,
    });

    try {
      const peaks = await generatePeaks(destination, probe.durationMs);
      await atomicWriteJson(peaksPath(id), peaks);
    } catch (error) {
      console.warn("Peak generation failed after attaching audio:", error);
    }

    return Response.json({ job: updatedJob, warning });
  } catch (error) {
    await fs.rm(destination, { force: true }).catch(() => undefined);
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not read this audio file." },
      { status: 400 },
    );
  }
}
