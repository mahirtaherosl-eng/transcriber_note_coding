import { promises as fs } from "node:fs";
import { generatePeaks, type PeaksFile } from "@/lib/audio/peaks";
import { assertSafeId, atomicWriteJson, findAudioFile, peaksPath, readJob } from "@/lib/storage";

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

  const cached = peaksPath(id);
  try {
    const raw = await fs.readFile(cached, "utf8");
    return new Response(raw, {
      headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=300" },
    });
  } catch {
    // not cached yet
  }

  const job = await readJob(id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });

  const audioFile = await findAudioFile(job);
  if (!audioFile) return Response.json({ error: "Audio not attached" }, { status: 404 });
  if (!job.durationMs) return Response.json({ error: "Duration unknown" }, { status: 409 });

  try {
    const peaks: PeaksFile = await generatePeaks(audioFile, job.durationMs);
    await atomicWriteJson(cached, peaks);
    return Response.json(peaks);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not build the waveform." },
      { status: 500 },
    );
  }
}
