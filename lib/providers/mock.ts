import type { SttProvider, Token } from "@/lib/providers/types";

const SCRIPT: { speaker: number; text: string }[] = [
  { speaker: 0, text: "So, how did the meeting go this morning?" },
  { speaker: 1, text: "都幾順利，不過有幾樣嘢要跟進。" },
  { speaker: 0, text: "Okay, what needs following up?" },
  { speaker: 1, text: "我哋要同 client 確認個 deadline。" },
  { speaker: 0, text: "Right. And the Bengali copy?" },
  { speaker: 1, text: "আমি কাল সকালে পাঠিয়ে দেব।" },
  { speaker: 0, text: "Perfect. Can you also send the updated budget?" },
  { speaker: 1, text: "冇問題，我今晚整理好份文件。" },
  { speaker: 0, text: "Thanks. Let's catch up again on Friday." },
  { speaker: 1, text: "好呀，到時見。" },
];

const CJK_OR_THAI = /[฀-๿　-〿぀-ヿ㐀-鿿豈-﫿]/;

function tokenize(text: string, speakerId: string, startMs: number, endMs: number): Token[] {
  const tokens: Token[] = [];
  const hasSpaces = /\s/.test(text);
  const parts = hasSpaces ? text.split(/(\s+)/).filter(Boolean) : Array.from(text);
  const duration = Math.max(1, endMs - startMs);
  const per = duration / Math.max(1, parts.length);

  parts.forEach((part, index) => {
    const tokenStart = Math.round(startMs + index * per);
    const tokenEnd = Math.max(tokenStart + 1, Math.round(startMs + (index + 1) * per));
    if (/^\s+$/.test(part)) {
      tokens.push({ type: "spacing", text: part, startMs: tokenStart, endMs: tokenEnd });
    } else {
      tokens.push({
        type: "word",
        text: part,
        startMs: tokenStart,
        endMs: tokenEnd,
        speakerId,
        confidence: 0.95,
      });
    }
  });

  return tokens;
}

function buildMockTokens(durationSec: number): Token[] {
  const totalMs = Math.max(1000, Math.round(durationSec * 1000));
  const tokens: Token[] = [];
  let cursor = 0;
  let guard = 0;
  const weightOf = (text: string) =>
    text.length + (CJK_OR_THAI.test(text) ? 2 : 8);
  const totalWeight = SCRIPT.reduce((sum, line) => sum + weightOf(line.text), 0);

  while (cursor < totalMs && guard < 5000) {
    for (const line of SCRIPT) {
      if (cursor >= totalMs) break;
      const slot = Math.max(600, (weightOf(line.text) / totalWeight) * totalMs);
      const slotEnd = Math.min(totalMs, Math.round(cursor + slot));
      const contentEnd = Math.max(cursor + 1, Math.round(cursor + slot * 0.86));
      tokens.push(
        ...tokenize(line.text, `speaker_${line.speaker}`, cursor, Math.min(contentEnd, slotEnd)),
      );
      cursor = slotEnd;
      if (cursor >= totalMs) break;
    }
    guard += 1;
  }

  return tokens;
}

export const mockProvider: SttProvider = {
  id: "mock",
  label: "Mock (offline)",
  capabilities: {
    languages: ["auto", "yue", "en", "bn"],
    diarization: true,
    wordTimestamps: true,
    maxDurationSec: 10 * 60 * 60,
  },
  async transcribe(input, ctx) {
    ctx.onProgress?.("Generating offline sample transcript");
    const tokens = buildMockTokens(input.durationSec);
    return {
      provider: "mock",
      model: "mock-v1",
      detectedLanguage: input.language === "auto" ? "en" : input.language,
      languageProbability: 0.99,
      tokens,
      raw: { mock: true, tokenCount: tokens.length },
    };
  },
};
