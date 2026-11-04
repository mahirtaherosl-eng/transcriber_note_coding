export type MatchRange = { start: number; end: number };

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive substring matching on the ORIGINAL text, so ranges always map
 * back to the characters we render. `u` handles astral characters; CJK needs no
 * word segmentation and Bengali works as a plain substring.
 */
export function findMatchRanges(text: string, query: string): MatchRange[] {
  const needle = query.trim();
  if (!needle) return [];

  let pattern: RegExp;
  try {
    pattern = new RegExp(escapeRegExp(needle), "giu");
  } catch {
    return [];
  }

  const ranges: MatchRange[] = [];
  let match: RegExpExecArray | null;
  let guard = 0;
  while ((match = pattern.exec(text)) !== null && guard < 5000) {
    guard += 1;
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
      continue;
    }
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

export function splitByRanges(
  text: string,
  ranges: MatchRange[],
): { text: string; match: boolean }[] {
  if (ranges.length === 0) return [{ text, match: false }];

  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push({ text: text.slice(cursor, range.start), match: false });
    }
    parts.push({ text: text.slice(range.start, range.end), match: true });
    cursor = range.end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), match: false });
  }
  return parts;
}
