import { describe, expect, it } from "vitest";
import { segmentTokens } from "@/lib/transcript/segment";
import type { Token } from "@/lib/providers/types";

function word(text: string, startMs: number, endMs: number, speakerId = "speaker_0"): Token {
  return { type: "word", text, startMs, endMs, speakerId, confidence: 0.9 };
}

function space(text: string, startMs: number, endMs: number): Token {
  return { type: "spacing", text, startMs, endMs };
}

describe("segmentTokens", () => {
  it("keeps spacing tokens so English words do not collapse", () => {
    const { segments } = segmentTokens([
      word("Hello", 0, 300),
      space(" ", 300, 320),
      word("world", 320, 700),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("Hello world");
    expect(segments[0].words.map((entry) => entry.text)).toEqual(["Hello", "world"]);
  });

  it("joins CJK characters without inserting spaces", () => {
    const { segments } = segmentTokens([
      word("我", 0, 200),
      word("哋", 200, 400),
      word("走", 400, 600),
    ]);

    expect(segments[0].text).toBe("我哋走");
  });

  it("inserts a space between Latin and CJK when spacing is absent", () => {
    const { segments } = segmentTokens([
      word("We", 0, 200),
      word("用", 200, 400),
      word("Zoom", 400, 600),
    ]);

    expect(segments[0].text).toBe("We 用 Zoom");
  });

  it("does not put a space before fullwidth punctuation", () => {
    const { segments } = segmentTokens([
      word("我", 0, 100),
      word("唔", 100, 200),
      word("該", 200, 300),
      word("，", 300, 320),
      word("唔", 320, 400),
      word("該", 400, 500),
    ]);

    expect(segments[0].text).toBe("我唔該，唔該");
  });

  it("keeps Bengali words separated", () => {
    const { segments } = segmentTokens([
      word("আমি", 0, 200),
      word("ভালো", 200, 400),
      word("আছি", 400, 600),
    ]);

    expect(segments[0].text).toBe("আমি ভালো আছি");
  });

  it("splits on speaker change and creates stable speaker ids", () => {
    const { segments, speakers } = segmentTokens([
      word("Hi", 0, 200, "speaker_7"),
      space(" ", 200, 210),
      word("there", 210, 500, "speaker_7"),
      word("你好", 600, 900, "speaker_3"),
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0].speakerId).toBe("spk_1");
    expect(segments[1].speakerId).toBe("spk_2");
    expect(speakers.map((speaker) => speaker.name)).toEqual(["Speaker 1", "Speaker 2"]);
  });

  it("splits on a gap longer than 700ms", () => {
    const { segments } = segmentTokens([
      word("First", 0, 500),
      word("Second", 1300, 1600),
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[1].startMs).toBe(1300);
  });

  it("drops audio events", () => {
    const { segments } = segmentTokens([
      word("Hello", 0, 300),
      { type: "audio_event", text: "(laughter)", startMs: 300, endMs: 500 },
      space(" ", 500, 510),
      word("again", 510, 800),
    ]);

    expect(segments[0].text).toBe("Hello again");
    expect(segments[0].words).toHaveLength(2);
  });

  it("skips leading spacing and clamps to the duration", () => {
    const { segments } = segmentTokens(
      [space(" ", 0, 100), word("Late", 9000, 10_000)],
      { durationMs: 9500 },
    );

    expect(segments).toHaveLength(1);
    expect(segments[0].startMs).toBe(9000);
    expect(segments[0].endMs).toBe(9500);
  });

  it("resolves a 1ms rounding overlap at a speaker change", () => {
    const { segments } = segmentTokens([
      word("Hello", 0, 1000, "speaker_0"),
      word("there", 999, 1500, "speaker_1"),
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0].endMs).toBeLessThanOrEqual(segments[1].startMs);
    expect(segments[0].endMs).toBe(999);
    expect(segments.map((segment) => segment.text)).toEqual(["Hello", "there"]);
  });

  it("trims a larger overshoot without dropping either line", () => {
    const { segments } = segmentTokens([
      word("First", 0, 1500, "speaker_0"),
      word("Second", 1200, 1800, "speaker_1"),
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0].endMs).toBe(1200);
    expect(segments[1].startMs).toBe(1200);
    expect(segments.map((segment) => segment.text)).toEqual(["First", "Second"]);
  });

  it("orders segments by time when a provider returns out-of-order tokens", () => {
    const { segments } = segmentTokens([
      word("Later", 1000, 1200, "speaker_1"),
      word("Earlier", 500, 700, "speaker_0"),
    ]);

    expect(segments.map((segment) => segment.text)).toEqual(["Earlier", "Later"]);
    expect(segments[0].startMs).toBeLessThan(segments[1].startMs);
    expect(segments.map((segment) => segment.id)).toEqual(["seg_0001", "seg_0002"]);
  });

  it("drops segments that begin after the audio duration", () => {
    const { segments } = segmentTokens(
      [word("Inside", 0, 500), word("Outside", 2000, 2500)],
      { durationMs: 1000 },
    );

    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("Inside");
  });

  it("returns no segments for an empty token stream", () => {
    expect(segmentTokens([]).segments).toHaveLength(0);
  });
});
