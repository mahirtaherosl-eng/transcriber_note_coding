import path from "node:path";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
  ".mpeg": "audio/mpeg",
  ".mpga": "audio/mpeg",
  ".mov": "video/quicktime",
};

export function mimeForFileName(fileName: string, fallback = "application/octet-stream"): string {
  return MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()] ?? fallback;
}

export function slugify(value: string, fallback = "transcript"): string {
  const slug = value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return slug || fallback;
}

export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function errorResponse(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export async function readJsonBody<T = unknown>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) throw new Error("Request body is empty.");
  if (text.length > 5 * 1024 * 1024) throw new Error("Request body is too large.");
  return JSON.parse(text) as T;
}
