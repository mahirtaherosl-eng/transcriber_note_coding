import { SPEAKER_COLORS, type Segment, type Speaker, type Word } from "@/lib/transcript/schema";
import type { Token } from "@/lib/providers/types";

const GAP_MS = 700;
const MAX_CHARS = 120;
const MAX_DURATION_MS = 15_000;
const SENTENCE_END = /[。！？!?；;]$/;
const NO_LEADING_SPACE = /^[，。！？、；：,.!?;:)\]）】》〉」』»”’]/;
const NO_TRAILING_SPACE = /[(\[（【《〈「『«“‘]$/;
const CJK_OR_THAI = /[฀-๿　-〿぀-ヿ㐀-䶿一-鿿豈-﫿]/;

type WorkingSegment = {
  speakerId: string | null;
  startMs: number;
  endMs: number;
  parts: string[];
  words: Word[];
  charCount: number;
  endsSentence: boolean;
  lastWasSpacing: boolean;
};

function needsSpaceBetween(previousText: string, nextText: string): boolean {
  if (!previousText || !nextText) return false;
  const previousChar = previousText[previousText.length - 1];
  const nextChar = nextText[0];
  // Only CJK/Thai-to-CJK/Thai runs join without a space; Latin↔CJK gets one.
  if (CJK_OR_THAI.test(previousChar) && CJK_OR_THAI.test(nextChar)) return false;
  // Punctuation never gets a following space when the next script is CJK.
  if (/[，。！？、；：,.!?;:]$/.test(previousText) && CJK_OR_THAI.test(nextChar)) return false;
  if (NO_LEADING_SPACE.test(nextText)) return false;
  if (NO_TRAILING_SPACE.test(previousText)) return false;
  return true;
}

function createSpeakerRegistry() {
  const byProviderId = new Map<string, string>();
  const speakers: Speaker[] = [];

  return {
    speakers,
    resolve(providerId: string | null | undefined): string | null {
      if (!providerId) return null;
      const existing = byProviderId.get(providerId);
      if (existing) return existing;
      const index = speakers.length;
      const id = `spk_${index + 1}`;
      byProviderId.set(providerId, id);
      speakers.push({
        id,
        name: `Speaker ${index + 1}`,
        color: SPEAKER_COLORS[index % SPEAKER_COLORS.length],
      });
      return id;
    },
  };
}

/**
 * Scribe returns float timestamps; converting them to integer milliseconds can
 * invert adjacent boundaries by a millisecond, and other providers may return
 * genuinely overlapping tokens. The schema and the playhead both require
 * ordered, non-overlapping half-open intervals, so reconcile them here: keep
 * each line's start anchor (what the user seeks to) and trim the preceding
 * line's end instead.
 */
function normalizeSegmentBounds(segments: Segment[]): Segment[] {
  if (segments.length === 0) return segments;

  const ordered = [...segments].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
  );

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const nextStart = ordered[index + 1].startMs;
    if (ordered[index].endMs > nextStart) {
      ordered[index].endMs = Math.max(ordered[index].startMs + 1, nextStart);
    }
  }

  let previousEnd = -1;
  ordered.forEach((segment, index) => {
    if (previousEnd >= 0 && segment.startMs < previousEnd) {
      segment.startMs = previousEnd;
    }
    if (segment.endMs <= segment.startMs) {
      segment.endMs = segment.startMs + 1;
    }
    segment.id = `seg_${String(index + 1).padStart(4, "0")}`;
    previousEnd = segment.endMs;
  });

  return ordered;
}

/**
 * Turns a provider's flat token stream into speaker turns.
 *
 * A new segment starts on speaker change, a gap longer than 700 ms, a sentence
 * ending once the segment is already long, or a hard 15 s cap. Display text is
 * built from word + spacing tokens so English does not collapse into `helloworld`.
 */
export function segmentTokens(
  tokens: Token[],
  options: { durationMs?: number } = {},
): { segments: Segment[]; speakers: Speaker[] } {
  const registry = createSpeakerRegistry();
  const segments: Segment[] = [];
  let current: WorkingSegment | null = null;

  const flush = () => {
    if (!current) return;
    const text = current.parts.join("").trim();
    if (text.length > 0 && current.words.length > 0) {
      const startMs = Math.max(0, Math.round(current.startMs));
      const endMs = Math.max(startMs + 1, Math.round(current.endMs));
      segments.push({
        id: `seg_${String(segments.length + 1).padStart(4, "0")}`,
        speakerId: current.speakerId,
        startMs,
        endMs,
        text,
        words: current.words,
      });
    }
    current = null;
  };

  const start = (speakerId: string | null, token: Token): WorkingSegment => ({
    speakerId,
    startMs: token.startMs,
    endMs: token.endMs,
    parts: [],
    words: [],
    charCount: 0,
    endsSentence: false,
    lastWasSpacing: false,
  });

  for (const token of tokens) {
    if (token.type === "audio_event") continue;

    const speakerId =
      token.type === "word" ? registry.resolve(token.speakerId) : (current?.speakerId ?? null);

    if (!current) {
      if (token.type === "spacing") continue;
      current = start(speakerId, token);
    } else if (token.type === "word") {
      const speakerChanged = speakerId !== current.speakerId;
      const gap = token.startMs - current.endMs > GAP_MS;
      const tooLong = token.startMs - current.startMs > MAX_DURATION_MS;
      const sentenceBreak = current.endsSentence && current.charCount > MAX_CHARS;

      if (speakerChanged || gap || tooLong || sentenceBreak) {
        flush();
        current = start(speakerId, token);
      }
    }

    if (!current) continue;

    if (token.type === "spacing") {
      current.parts.push(token.text);
      current.lastWasSpacing = true;
    } else {
      if (!current.lastWasSpacing && current.parts.length > 0) {
        const previousText = current.parts.join("");
        if (needsSpaceBetween(previousText, token.text)) {
          current.parts.push(" ");
        }
      }
      current.parts.push(token.text);
      current.lastWasSpacing = false;
      current.charCount += token.text.length;
      current.words.push({
        text: token.text,
        startMs: Math.max(0, Math.round(token.startMs)),
        endMs: Math.max(Math.round(token.startMs) + 1, Math.round(token.endMs)),
        confidence: token.confidence,
      });
      current.endsSentence = SENTENCE_END.test(token.text.trim());
    }

    current.endMs = Math.max(current.endMs, token.endMs);
  }

  flush();

  const normalized = normalizeSegmentBounds(segments);
  const durationMs = options.durationMs;
  if (durationMs && durationMs > 0) {
    // Clamping only shortens or drops tail segments, so it cannot reintroduce
    // an overlap.
    const kept = normalized.filter((segment) => segment.startMs < durationMs);
    for (const segment of kept) {
      segment.endMs = Math.min(segment.endMs, durationMs);
      if (segment.endMs <= segment.startMs) segment.endMs = durationMs;
    }
    return { segments: kept, speakers: registry.speakers };
  }

  return { segments: normalized, speakers: registry.speakers };
}
