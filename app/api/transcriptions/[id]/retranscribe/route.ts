import { enqueue } from "@/lib/jobs/queue";
import { patchJob, readJob } from "@/lib/jobs/store";
import { LANGUAGES, supportsLanguage, type ProviderId } from "@/lib/languages";
import { PROVIDERS } from "@/lib/providers";
import { RetranscribeRequestSchema } from "@/lib/transcript/schema";
import { readJsonBody } from "@/lib/server/http";
import { assertSafeId, findAudioFile } from "@/lib/storage";

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

  if (job.status === "queued" || job.status === "processing") {
    return Response.json(
      { error: "This transcription is already running." },
      { status: 409 },
    );
  }

  if (!(await findAudioFile(job))) {
    return Response.json(
      { error: "The audio file for this transcription is missing. Attach it first." },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = RetranscribeRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid re-transcribe request." },
      { status: 400 },
    );
  }

  const { provider: providerInput, language: languageInput, numSpeakers } = parsed.data;

  const providerCandidate = providerInput ?? job.provider;
  if (!(providerCandidate in PROVIDERS)) {
    return Response.json(
      { error: `Unknown provider "${providerCandidate}".` },
      { status: 400 },
    );
  }
  const providerId = providerCandidate as ProviderId;

  const language = languageInput ?? job.language;
  if (!LANGUAGES.some((candidate) => candidate.id === language)) {
    return Response.json({ error: `Unknown language "${language}".` }, { status: 400 });
  }
  if (!supportsLanguage(providerId, language)) {
    return Response.json(
      { error: `The selected provider does not support the language "${language}".` },
      { status: 400 },
    );
  }

  const speakers =
    numSpeakers === undefined ? job.numSpeakers : numSpeakers === null ? undefined : numSpeakers;

  const updated = await patchJob(id, {
    status: "queued",
    provider: providerId,
    language,
    numSpeakers: speakers,
    model: undefined,
    error: undefined,
    progress: "Queued",
    heartbeatAt: undefined,
  });
  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });

  enqueue(id);
  return Response.json({ job: updated });
}
