export type ByteRange = { start: number; end: number };

/**
 * Parses a single-range `Range` header. Returns:
 * - `null` when there is no Range header (serve the whole file)
 * - `"invalid"` for malformed or unsatisfiable ranges (respond 416)
 *
 * Supports `bytes=start-end`, `bytes=start-`, and suffix `bytes=-n`.
 */
export function parseRangeHeader(header: string | null, size: number): ByteRange | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(.+)$/i.exec(header.trim());
  if (!match) return "invalid";

  const first = match[1].split(",")[0]?.trim();
  if (!first) return "invalid";

  const parts = /^(\d*)-(\d*)$/.exec(first);
  if (!parts) return "invalid";

  const [, startRaw, endRaw] = parts;
  if (startRaw === "" && endRaw === "") return "invalid";

  if (startRaw === "") {
    const suffixLength = Number(endRaw);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid";
    if (size === 0) return "invalid";
    const start = Math.max(0, size - suffixLength);
    return { start, end: size - 1 };
  }

  const start = Number(startRaw);
  if (!Number.isSafeInteger(start) || start < 0) return "invalid";

  let end = endRaw === "" ? size - 1 : Number(endRaw);
  if (!Number.isSafeInteger(end) || end < 0) return "invalid";
  if (start >= size) return "invalid";
  if (end > size - 1) end = size - 1;
  if (end < start) return "invalid";

  return { start, end };
}

export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}
