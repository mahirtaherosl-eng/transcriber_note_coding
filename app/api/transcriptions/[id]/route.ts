import { cancelJob, retryJob } from "@/lib/jobs/queue";
import { readJob } from "@/lib/jobs/store";
import { assertSafeId, deleteTranscription } from "@/lib/storage";

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

  const job = await readJob(id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ job });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    assertSafeId(id);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "retry") {
    const ok = await retryJob(id);
    if (!ok) {
      return Response.json(
        { error: "This transcription cannot be retried right now." },
        { status: 409 },
      );
    }
    return Response.json({ ok: true });
  }

  if (action === "cancel") {
    await cancelJob(id);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    assertSafeId(id);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await cancelJob(id);
  await deleteTranscription(id);
  return Response.json({ ok: true });
}
