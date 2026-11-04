import type { Segment } from "@/lib/transcript/schema";

/** Last segment whose half-open interval [startMs, endMs) contains the time. */
export function findSegmentAtTime(segments: Segment[], timeMs: number): Segment | null {
  let low = 0;
  let high = segments.length - 1;
  let found = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    if (segments[middle].startMs <= timeMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  if (found === -1) return null;
  const segment = segments[found];
  return timeMs < segment.endMs ? segment : null;
}
