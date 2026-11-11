import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chooseProviderId,
  createSettingsStore,
  mergeSettings,
} from "@/lib/settings/server";
import { emptySettings } from "@/lib/settings/schema";

const tempDirs: string[] = [];

function tempFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "transcriber-settings-"));
  tempDirs.push(dir);
  return path.join(dir, "settings.json");
}

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("ELEVENLABS_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("STT_PROVIDER", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("provider precedence", () => {
  it("prefers an explicit request", () => {
    expect(
      chooseProviderId({
        explicit: "gemini",
        savedProvider: "openrouter",
        envProvider: "elevenlabs",
        availableKeys: ["openrouter", "elevenlabs", "gemini"],
      }),
    ).toEqual({ id: "gemini", source: "request" });
  });

  it("treats auto/unknown explicit values as no request", () => {
    for (const explicit of ["auto", "constructor", "qwen", ""]) {
      expect(
        chooseProviderId({
          explicit,
          savedProvider: "elevenlabs",
          envProvider: "",
          availableKeys: ["elevenlabs"],
        }),
      ).toEqual({ id: "elevenlabs", source: "settings" });
    }
  });

  it("falls back from an invalid saved provider to STT_PROVIDER", () => {
    expect(
      chooseProviderId({
        savedProvider: "qwen",
        envProvider: "gemini",
        availableKeys: ["gemini"],
      }),
    ).toEqual({ id: "gemini", source: "STT_PROVIDER" });
  });

  it("auto-detects in OpenRouter, ElevenLabs, Gemini order", () => {
    expect(
      chooseProviderId({ availableKeys: ["gemini", "elevenlabs", "openrouter"] }),
    ).toEqual({ id: "openrouter", source: "detected-key" });
    expect(chooseProviderId({ availableKeys: ["gemini", "elevenlabs"] })).toEqual({
      id: "elevenlabs",
      source: "detected-key",
    });
    expect(chooseProviderId({ availableKeys: ["gemini"] })).toEqual({
      id: "gemini",
      source: "detected-key",
    });
  });

  it("uses mock when nothing is configured", () => {
    expect(chooseProviderId({ availableKeys: [] })).toEqual({ id: "mock", source: "mock" });
  });
});

describe("settings merge", () => {
  it("leaves omitted fields unchanged", () => {
    const current = { provider: "openrouter" as const, keys: { openrouter: "a", gemini: "g" } };
    expect(mergeSettings(current, {})).toEqual(current);
  });

  it("clears the provider with null and keys with an empty string", () => {
    const current = { provider: "openrouter" as const, keys: { openrouter: "a", gemini: "g" } };
    const next = mergeSettings(current, { provider: null, keys: { openrouter: "" } });
    expect(next).toEqual({ keys: { gemini: "g" } });
  });

  it("trims and sets new keys", () => {
    const next = mergeSettings(emptySettings(), { keys: { elevenlabs: "  sk-test  " } });
    expect(next.keys.elevenlabs).toBe("sk-test");
  });
});

describe("settings store", () => {
  it("saves, masks, and falls back to env after a clear", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "env-key");
    const filePath = tempFile();
    const store = createSettingsStore(filePath);

    const saved = await store.update({ keys: { openrouter: "saved-key" } });
    expect(saved.keys.openrouter).toEqual({ saved: true, env: true });
    expect(JSON.stringify(saved)).not.toContain("saved-key");
    expect(JSON.stringify(saved)).not.toContain("env-key");
    expect(store.key("openrouter")).toBe("saved-key");
    expect(store.ready("openrouter")).toBe(true);

    const cleared = await store.update({ keys: { openrouter: "" } });
    expect(cleared.keys.openrouter).toEqual({ saved: false, env: true });
    expect(store.key("openrouter")).toBe("env-key");
    expect(store.read().keys.openrouter).toBeUndefined();
  });

  it("keeps a valid field when another field is corrupt", async () => {
    const filePath = tempFile();
    writeFileSync(
      filePath,
      JSON.stringify({ provider: "qwen", keys: { openrouter: "ok", gemini: 5 } }),
    );
    const store = createSettingsStore(filePath);
    expect(store.read()).toEqual({ keys: { openrouter: "ok" } });
  });

  it("strips a UTF-8 BOM", async () => {
    const filePath = tempFile();
    writeFileSync(filePath, `﻿${JSON.stringify({ provider: "mock", keys: {} })}`);
    const store = createSettingsStore(filePath);
    expect(store.read().provider).toBe("mock");
  });

  it("never throws on malformed or oversized files", async () => {
    const malformed = tempFile();
    writeFileSync(malformed, "{not json");
    const store = createSettingsStore(malformed);
    expect(store.read()).toEqual({ keys: {} });
    expect(store.status().warnings.join(" ")).toMatch(/could not be read/i);

    const oversized = tempFile();
    writeFileSync(oversized, " ".repeat(70 * 1024));
    const oversizedStore = createSettingsStore(oversized);
    expect(oversizedStore.read()).toEqual({ keys: {} });
    expect(oversizedStore.status().warnings.join(" ")).toMatch(/too large/i);
  });

  it("serializes concurrent updates", async () => {
    const filePath = tempFile();
    const store = createSettingsStore(filePath);
    await Promise.all([
      store.update({ keys: { openrouter: "concurrent-key" } }),
      store.update({ provider: "mock" }),
    ]);
    expect(store.read()).toEqual({ provider: "mock", keys: { openrouter: "concurrent-key" } });
  });

  it("writes the file with 0600 on POSIX", async () => {
    if (process.platform === "win32") return;
    const filePath = tempFile();
    const store = createSettingsStore(filePath);
    await store.update({ keys: { gemini: "g" } });
    const mode = statSync(filePath).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(readFileSync(filePath, "utf8")).toContain("gemini");
  });
});
