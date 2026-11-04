import { createJob } from "@/lib/jobs/store";
import { TranscriptSchema } from "@/lib/transcript/schema";
import { readJsonBody } from "@/lib/server/http";
import {
  assertSafeId,
  ensureLibraryDir,
  newId,
  readTranscript,
  writeTranscript,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not read the transcript file." },
      { status: 400 },
    );
  }

  const parsed = TranscriptSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        error: `This does not look like a transcript file: ${
          parsed.error.issues[0]?.message ?? "invalid format"
        }`,
      },
      { status: 400 },
    );
  }

  const transcript = parsed.data;

  let id = transcript.id;
  try {
    assertSafeId(id);
  } catch {
    id = newId();
    transcript.id = id;
  }

  if (await readTranscript(id)) {
    return Response.json(
      { error: "A transcription with this id already exists. Delete it first, or import a copy." },
      { status: 409 },
    );
  }

  await ensureLibraryDir(id);
  await writeTranscript(transcript);

  const now = new Date().toISOString();
  await createJob({
    id,
    status: "completed",
    title: transcript.title,
    fileName: transcript.source.fileName,
    mimeType: transcript.source.mimeType,
    sizeBytes: transcript.source.sizeBytes,
    durationMs: transcript.source.durationMs,
    language: transcript.transcription.requestedLanguage,
    provider: transcript.transcription.provider,
    model: transcript.transcription.model,
    sha256: transcript.source.sha256,
    createdAt: transcript.createdAt,
    updatedAt: now,
  });

  return Response.json({ id, needsAudio: true });
}
