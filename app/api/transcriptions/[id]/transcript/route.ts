import { EditRequestSchema } from "@/lib/transcript/schema";
import { assertSafeId, readTranscript, writeTranscript } from "@/lib/storage";
import { readJsonBody } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    assertSafeId(id);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const transcript = await readTranscript(id);
  if (!transcript) return Response.json({ error: "Transcript not ready." }, { status: 404 });
  return Response.json({ transcript });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    assertSafeId(id);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const transcript = await readTranscript(id);
  if (!transcript) return Response.json({ error: "Transcript not ready." }, { status: 404 });

  let payload: unknown;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = EditRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid edit request." },
      { status: 400 },
    );
  }

  const { segments: edits, speakers: speakerEdits } = parsed.data;
  const speakerIds = new Set(transcript.speakers.map((speaker) => speaker.id));

  for (const edit of edits) {
    if (edit.text !== undefined && edit.text.trim() === "") {
      return Response.json(
        { error: `Segment ${edit.id} cannot be empty. Delete/merge is not supported yet.` },
        { status: 400 },
      );
    }
    if (edit.speakerId !== undefined && edit.speakerId !== null && !speakerIds.has(edit.speakerId)) {
      return Response.json({ error: `Unknown speaker ${edit.speakerId}.` }, { status: 400 });
    }
  }

  for (const edit of speakerEdits) {
    if (edit.name !== undefined && edit.name.trim() === "") {
      return Response.json({ error: "Speaker names cannot be empty." }, { status: 400 });
    }
    if (!speakerIds.has(edit.id)) {
      return Response.json({ error: `Unknown speaker ${edit.id}.` }, { status: 400 });
    }
  }

  for (const edit of edits) {
    const segment = transcript.segments.find((candidate) => candidate.id === edit.id);
    if (!segment) {
      return Response.json({ error: `Unknown segment ${edit.id}.` }, { status: 404 });
    }
    if (edit.text !== undefined) {
      segment.text = edit.text;
      segment.edited = true;
      // Word timings no longer describe this text; keep them for provenance only.
    }
    if (edit.speakerId !== undefined) {
      segment.speakerId = edit.speakerId;
    }
  }

  for (const edit of speakerEdits) {
    const speaker = transcript.speakers.find((candidate) => candidate.id === edit.id);
    if (!speaker) continue;
    if (edit.name !== undefined) speaker.name = edit.name;
    if (edit.color !== undefined) speaker.color = edit.color;
  }

  try {
    await writeTranscript(transcript);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not save the edit." },
      { status: 500 },
    );
  }

  return Response.json({ transcript });
}
