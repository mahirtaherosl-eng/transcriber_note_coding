import { describe, expect, it } from "vitest";
import { contentRangeHeader, parseRangeHeader } from "@/lib/audio/range";

describe("parseRangeHeader", () => {
  const size = 1000;

  it("returns null when there is no range", () => {
    expect(parseRangeHeader(null, size)).toBeNull();
  });

  it("parses a closed range", () => {
    expect(parseRangeHeader("bytes=0-99", size)).toEqual({ start: 0, end: 99 });
  });

  it("parses an open-ended range", () => {
    expect(parseRangeHeader("bytes=100-", size)).toEqual({ start: 100, end: 999 });
  });

  it("parses a suffix range (needed for M4A moov atoms at the end)", () => {
    expect(parseRangeHeader("bytes=-500", size)).toEqual({ start: 500, end: 999 });
  });

  it("clamps an end beyond the file size", () => {
    expect(parseRangeHeader("bytes=900-5000", size)).toEqual({ start: 900, end: 999 });
  });

  it("uses the first range in a multi-range header", () => {
    expect(parseRangeHeader("bytes=0-10, 20-30", size)).toEqual({ start: 0, end: 10 });
  });

  it("rejects unsatisfiable and malformed ranges", () => {
    expect(parseRangeHeader("bytes=1000-", size)).toBe("invalid");
    expect(parseRangeHeader("bytes=50-10", size)).toBe("invalid");
    expect(parseRangeHeader("bytes=-", size)).toBe("invalid");
    expect(parseRangeHeader("items=0-10", size)).toBe("invalid");
    expect(parseRangeHeader("bytes=abc", size)).toBe("invalid");
  });

  it("formats a Content-Range header", () => {
    expect(contentRangeHeader({ start: 100, end: 199 }, 1000)).toBe("bytes 100-199/1000");
  });
});
