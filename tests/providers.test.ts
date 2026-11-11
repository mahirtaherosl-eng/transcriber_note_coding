import { describe, expect, it } from "vitest";
import { providerLanguageCode, supportsLanguage } from "@/lib/languages";
import { getProvider } from "@/lib/providers";
import { isProviderId, KEYED_PROVIDER_IDS, PROVIDER_IDS } from "@/lib/providers/ids";

describe("provider ids", () => {
  it("accepts only the supported providers", () => {
    expect(PROVIDER_IDS).toEqual(["openrouter", "elevenlabs", "gemini", "mock"]);
    expect(KEYED_PROVIDER_IDS).toEqual(["openrouter", "elevenlabs", "gemini"]);

    for (const id of PROVIDER_IDS) expect(isProviderId(id)).toBe(true);
    for (const id of [
      "qwen",
      "soniox",
      "azure",
      "constructor",
      "toString",
      "",
      null,
      undefined,
      1,
      {},
    ]) {
      expect(isProviderId(id)).toBe(false);
    }
  });

  it("rejects prototype keys instead of falling through", () => {
    expect(() => getProvider("constructor")).toThrow(/Unknown provider/);
    expect(getProvider("mock").id).toBe("mock");
  });

  it("no longer maps languages for removed providers", () => {
    expect(providerLanguageCode("qwen", "en")).toBeUndefined();
    expect(providerLanguageCode("soniox", "en")).toBeUndefined();
    expect(providerLanguageCode("azure", "en")).toBeUndefined();
    expect(supportsLanguage("azure", "auto")).toBe(false);
    expect(providerLanguageCode("elevenlabs", "yue")).toBe("yue");
  });
});
