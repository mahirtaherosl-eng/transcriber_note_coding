import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024 * 1024;

export class UploadTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
  }
}

/**
 * Streams a raw request body to disk. Never buffers the file in memory, and aborts
 * the write as soon as the byte budget is exceeded.
 */
export async function saveRequestBody(
  request: Request,
  destination: string,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<number> {
  if (!request.body) {
    throw new Error("No request body.");
  }

  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(new UploadTooLargeError(maxBytes));
        return;
      }
      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]),
    limiter,
    createWriteStream(destination),
  );

  return bytes;
}
