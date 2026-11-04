import { Readable } from "node:stream";
import archiver from "archiver";
import { assertSafeId, findAudioFile, readJob, readTranscript } from "@/lib/storage";
import { contentDisposition, slugify } from "@/lib/server/http";
import { toPlainText, toSrt, toTranscriptJson, toVtt } from "@/lib/transcript/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const FORMATS = new Set(["json", "srt", "vtt", "txt", "zip"]);

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    assertSafeId(id);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const format = new URL(request.url).searchParams.get("format") ?? "json";
  if (!FORMATS.has(format)) {
    return Response.json({ error: "Unknown export format." }, { status: 400 });
  }

  const transcript = await readTranscript(id);
  if (!transcript) return Response.json({ error: "Transcript not ready." }, { status: 404 });

  const slug = slugify(transcript.title);

  if (format === "json") {
    return new Response(toTranscriptJson(transcript), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": contentDisposition(`${slug}.transcript.json`),
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "srt" || format === "vtt" || format === "txt") {
    const body = format === "srt" ? toSrt(transcript) : format === "vtt" ? toVtt(transcript) : toPlainText(transcript);
    return new Response(body, {
      headers: {
        "Content-Type": format === "txt" ? "text/plain; charset=utf-8" : `text/${format === "vtt" ? "vtt" : "plain"}; charset=utf-8`,
        "Content-Disposition": contentDisposition(`${slug}.${format}`),
        "Cache-Control": "no-store",
      },
    });
  }

  const job = await readJob(id);
  const archive = archiver("zip", { zlib: { level: 5 } });
  archive.on("error", (error) => {
    console.error("Zip export failed:", error);
  });

  archive.append(Buffer.from(toTranscriptJson(transcript)), {
    name: `${slug}.transcript.json`,
  });

  if (job) {
    const audioFile = await findAudioFile(job);
    if (audioFile) {
      const extension = audioFile.slice(audioFile.lastIndexOf("."));
      archive.file(audioFile, { name: job.fileName || `${slug}${extension}` });
    }
  }

  archive.finalize();

  return new Response(Readable.toWeb(archive as unknown as Readable) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(`${slug}.zip`),
      "Cache-Control": "no-store",
    },
  });
}
