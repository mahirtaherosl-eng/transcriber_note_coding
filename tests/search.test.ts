import { describe, expect, it } from "vitest";
import { findMatchRanges, splitByRanges } from "@/lib/transcript/search";

describe("findMatchRanges", () => {
  it("matches case-insensitively and finds every occurrence", () => {
    const ranges = findMatchRanges("Hello hello HELLO", "hello");
    expect(ranges).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ]);
  });

  it("finds Cantonese substrings without word segmentation", () => {
    const text = "唔該你，唔該晒。";
    const ranges = findMatchRanges(text, "唔該");
    expect(ranges).toHaveLength(2);
    expect(text.slice(ranges[1].start, ranges[1].end)).toBe("唔該");
  });

  it("finds Bengali words including combining marks", () => {
    const text = "আমি কাল সকালে পাঠিয়ে দেব।";
    const ranges = findMatchRanges(text, "পাঠিয়ে");
    expect(ranges).toHaveLength(1);
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe("পাঠিয়ে");
  });

  it("treats regex metacharacters literally", () => {
    const ranges = findMatchRanges("a.b aXb (test)", "a.b");
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: 0, end: 3 });
  });

  it("returns nothing for an empty query", () => {
    expect(findMatchRanges("anything", "   ")).toEqual([]);
  });
});

describe("splitByRanges", () => {
  it("splits text into plain and match parts", () => {
    const parts = splitByRanges("one two one", [
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ]);

    expect(parts).toEqual([
      { text: "one", match: true },
      { text: " two ", match: false },
      { text: "one", match: true },
    ]);
  });
});
