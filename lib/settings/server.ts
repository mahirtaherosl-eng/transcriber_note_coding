import crypto from "node:crypto";
import { promises as fs, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/storage";
import {
  KEYED_PROVIDER_IDS,
  isKeyedProviderId,
  isProviderId,
  type KeyedProviderId,
  type ProviderId,
} from "@/lib/providers/ids";
import { providerLabel } from "@/lib/providers/catalog";
import {
  emptySettings,
  parseSettings,
  type AppSettings,
  type KeyStatus,
  type ProviderSource,
  type SettingsStatus,
  type SettingsUpdate,
} from "@/lib/settings/schema";

export const SETTINGS_FILE_NAME = "settings.json";
export const DEFAULT_SETTINGS_PATH = path.join(DATA_DIR, SETTINGS_FILE_NAME);

const MAX_FILE_BYTES = 64 * 1024;

const ENV_KEYS: Record<KeyedProviderId, string> = {
  openrouter: "OPENROUTER_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export function envProviderKey(provider: KeyedProviderId): string | undefined {
  const raw = process.env[ENV_KEYS[provider]];
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

export type ProviderChoice = { id: ProviderId; source: ProviderSource };

/**
 * Pure precedence rule: explicit request → saved default → STT_PROVIDER →
 * first configured key (OpenRouter, ElevenLabs, Gemini) → mock.
 */
export function chooseProviderId(input: {
  explicit?: string | null;
  savedProvider?: string | null;
  envProvider?: string | null;
  availableKeys?: readonly ProviderId[];
}): ProviderChoice {
  if (isProviderId(input.explicit)) return { id: input.explicit, source: "request" };
  if (isProviderId(input.savedProvider)) {
    return { id: input.savedProvider, source: "settings" };
  }
  if (isProviderId(input.envProvider)) {
    return { id: input.envProvider, source: "STT_PROVIDER" };
  }
  for (const id of KEYED_PROVIDER_IDS) {
    if (input.availableKeys?.includes(id)) return { id, source: "detected-key" };
  }
  return { id: "mock", source: "mock" };
}

/**
 * Omitted fields are unchanged. `provider: null` clears the saved default.
 * An empty key string clears that saved key; omitted keys are untouched.
 */
export function mergeSettings(current: AppSettings, update: SettingsUpdate): AppSettings {
  const next: AppSettings = { keys: { ...current.keys } };
  if (current.provider) next.provider = current.provider;

  if (update.provider !== undefined) {
    if (update.provider === null) delete next.provider;
    else next.provider = update.provider;
  }

  if (update.keys) {
    for (const id of KEYED_PROVIDER_IDS) {
      const value = update.keys[id];
      if (value === undefined) continue;
      const trimmed = value.trim();
      if (trimmed) next.keys[id] = trimmed;
      else delete next.keys[id];
    }
  }

  if (!next.provider) delete next.provider;
  return next;
}

type LoadResult = { settings: AppSettings; error?: string };

function loadSettingsFile(filePath: string): LoadResult {
  try {
    const stats = statSync(filePath);
    if (stats.size > MAX_FILE_BYTES) {
      return {
        settings: emptySettings(),
        error: "The settings file is too large; using defaults.",
      };
    }

    const file = readFileSync(filePath, "utf8");
    const raw = file.charCodeAt(0) === 0xfeff ? file.slice(1) : file;
    if (!raw.trim()) return { settings: emptySettings() };
    return { settings: parseSettings(JSON.parse(raw)) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { settings: emptySettings() };
    return {
      settings: emptySettings(),
      error: "The settings file could not be read; using defaults.",
    };
  }
}

function describeStatus(settings: AppSettings, loadError?: string): SettingsStatus {
  const keys = {} as Record<KeyedProviderId, KeyStatus>;
  const available: ProviderId[] = [];

  for (const id of KEYED_PROVIDER_IDS) {
    const saved = Boolean(settings.keys[id]?.trim());
    const env = Boolean(envProviderKey(id));
    keys[id] = { saved, env };
    if (saved || env) available.push(id);
  }

  const choice = chooseProviderId({
    savedProvider: settings.provider,
    envProvider: process.env.STT_PROVIDER,
    availableKeys: available,
  });

  const warnings: string[] = [];
  if (loadError) warnings.push(loadError);
  if (choice.id !== "mock" && isKeyedProviderId(choice.id)) {
    const status = keys[choice.id];
    if (!status.saved && !status.env) {
      warnings.push(
        `The default engine (${providerLabel(choice.id)}) has no API key. Uploads will fail until you add one.`,
      );
    }
  }
  if (available.length === 0) {
    warnings.push(
      "No API key is configured. Uploads will use the offline mock until you add one.",
    );
  }

  return {
    savedProvider: settings.provider ?? null,
    resolvedProvider: choice.id,
    providerSource: choice.source,
    keys,
    warnings: [...new Set(warnings)],
  };
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 3 || (code !== "EPERM" && code !== "EBUSY")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

async function writeSettingsFile(filePath: string, settings: AppSettings): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);

  try {
    await fs.writeFile(temp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    if (process.platform !== "win32") {
      await fs.chmod(temp, 0o600).catch(() => undefined);
    }
    await renameWithRetry(temp, filePath);
    if (process.platform !== "win32") {
      await fs.chmod(filePath, 0o600).catch(() => undefined);
    }
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined);
  }
}

const globalScope = globalThis as typeof globalThis & {
  __transcriberSettingsLock?: Promise<unknown>;
};

function withSettingsLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalScope.__transcriberSettingsLock ?? Promise.resolve();
  const run = previous.then(task, task);
  globalScope.__transcriberSettingsLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export type SettingsStore = {
  path: string;
  read: () => AppSettings;
  status: () => SettingsStatus;
  key: (provider: ProviderId) => string | undefined;
  ready: (provider: ProviderId) => boolean;
  update: (update: SettingsUpdate) => Promise<SettingsStatus>;
};

/** Injectable path so tests never touch the real `.data/settings.json`. */
export function createSettingsStore(filePath = DEFAULT_SETTINGS_PATH): SettingsStore {
  const key = (provider: ProviderId): string | undefined => {
    if (!isKeyedProviderId(provider)) return undefined;
    const saved = loadSettingsFile(filePath).settings.keys[provider]?.trim();
    return saved || envProviderKey(provider);
  };

  return {
    path: filePath,
    read: () => loadSettingsFile(filePath).settings,
    status: () => {
      const loaded = loadSettingsFile(filePath);
      return describeStatus(loaded.settings, loaded.error);
    },
    key,
    ready: (provider) => provider === "mock" || Boolean(key(provider)),
    update: (patch) =>
      withSettingsLock(async () => {
        const current = loadSettingsFile(filePath).settings;
        const next = mergeSettings(current, patch);
        await writeSettingsFile(filePath, next);
        return describeStatus(next);
      }),
  };
}

export const settingsStore = createSettingsStore();

export const readSettings = (): AppSettings => settingsStore.read();
export const getSettingsStatus = (): SettingsStatus => settingsStore.status();
export const getProviderKey = (provider: ProviderId): string | undefined =>
  settingsStore.key(provider);
export const providerReady = (provider: ProviderId): boolean => settingsStore.ready(provider);
export const updateSettings = (update: SettingsUpdate): Promise<SettingsStatus> =>
  settingsStore.update(update);

export function resolveProviderChoice(explicit?: string | null): ProviderChoice {
  const settings = readSettings();
  const available = KEYED_PROVIDER_IDS.filter((id) => {
    const saved = settings.keys[id]?.trim();
    return Boolean(saved) || Boolean(envProviderKey(id));
  });
  return chooseProviderId({
    explicit,
    savedProvider: settings.provider,
    envProvider: process.env.STT_PROVIDER,
    availableKeys: available,
  });
}

export function resolveProviderId(explicit?: string | null): ProviderId {
  return resolveProviderChoice(explicit).id;
}
