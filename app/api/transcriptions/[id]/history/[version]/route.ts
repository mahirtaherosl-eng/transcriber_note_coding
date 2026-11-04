import {
  archiveCurrentTranscript,
  assertSafeHistoryVersion,
  loadArchivedTranscript,
} from "@/lib/history";
import { patchJob, readJob } from "@/lib/jobs/store";
import { contentDisposition, slugify } from "@/lib/server/http";
import { toTranscriptJson } from "@/lib/transcript/export";
import { assertSafeId, writeTranscript } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; version: string }> };

function notFound() {
  return Response.json({ error: "Not found" }, { status: 404 });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id, version } = await context.params;
  try {
    assertSafeId(id);
    assertSafeHistoryVersion(version);
  } catch {
    return notFound();
  }

  const result = await loadArchivedTranscript(id, version);
  if (result.status === "missing") return notFound();
  if (result.status === "corrupt") {
    return Response.json({ error: "This transcript version is unreadable." }, { status: 500 });
  }

  const fileName = `${slugify(result.transcript.title)}-${version}.transcript.json`;
  return new Response(toTranscriptJson(result.transcript), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": contentDisposition(fileName),
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id, version } = await context.params;
  try {
    assertSafeId(id);
    assertSafeHistoryVersion(version);
  } catch {
    return notFound();
  }

  if (new URL(request.url).searchParams.get("action") !== "restore") {
    return Response.json({ error: "Unknown action" }, { status: 400 });
  }

  const job = await readJob(id);
  if (!job) return notFound();
  if (job.status === "queued" || job.status === "processing") {
    return Response.json(
      { error: "This transcription is running. Wait for it to finish before restoring a version." },
      { status: 409 },
    );
  }

  const result = await loadArchivedTranscript(id, version);
  if (result.status === "missing") return notFound();
  if (result.status === "corrupt") {
    return Response.json({ error: "This transcript version is unreadable." }, { status: 500 });
  }

  try {
    // Make the restore reversible: the version being replaced becomes history too.
    await archiveCurrentTranscript(id, "restore");
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not archive the current transcript." },
      { status: 500 },
    );
  }

  const transcript = { ...result.transcript, id };
  try {
    await writeTranscript(transcript);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not restore this version." },
      { status: 500 },
    );
  }

  const warning =
    result.transcript.source.sha256 &&
    job.sha256 &&
    result.transcript.source.sha256 !== job.sha256
      ? "This version was transcribed from different audio. Timestamps may not match the attached file."
      : undefined;

  const updated = await patchJob(id, {
    status: "completed",
    provider: transcript.transcription.provider,
    model: transcript.transcription.model,
    language: transcript.transcription.requestedLanguage,
    durationMs: transcript.source.durationMs,
    error: undefined,
    progress: undefined,
    heartbeatAt: undefined,
  });
  if (!updated) return notFound();

  return Response.json({ transcript, job: updated, warning });
}
