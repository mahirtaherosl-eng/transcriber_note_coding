import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { contentRangeHeader, parseRangeHeader } from "@/lib/audio/range";
import { assertSafeId, findAudioFile, readJob } from "@/lib/storage";
import { mimeForFileName } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function streamAudio(
  request: Request,
  context: RouteContext,
  includeBody = true,
): Promise<Response> {
  const { id } = await context.params;
  try {
    assertSafeId(id);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const job = await readJob(id);
  if (!job) return new Response("Not found", { status: 404 });

  const audioFile = await findAudioFile(job);
  if (!audioFile) return new Response("Audio not attached", { status: 404 });

  let size: number;
  try {
    size = (await fs.stat(audioFile)).size;
  } catch {
    return new Response("Audio not found", { status: 404 });
  }

  const rangeHeader = request.headers.get("range");
  const range = parseRangeHeader(rangeHeader, size);
  const mime = job.mimeType || mimeForFileName(job.fileName);

  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  };

  if (!range) {
    if (!includeBody) {
      return new Response(null, {
        status: 200,
        headers: { ...baseHeaders, "Content-Length": String(size) },
      });
    }
    const stream = createReadStream(audioFile);
    request.signal.addEventListener("abort", () => stream.destroy());
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(size) },
    });
  }

  if (!includeBody) {
    return new Response(null, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": contentRangeHeader(range, size),
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }

  const stream = createReadStream(audioFile, { start: range.start, end: range.end });
  request.signal.addEventListener("abort", () => stream.destroy());

  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Range": contentRangeHeader(range, size),
      "Content-Length": String(range.end - range.start + 1),
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  return streamAudio(request, context);
}

export async function HEAD(request: Request, context: RouteContext) {
  return streamAudio(request, context, false);
}
