import { z } from "zod";
import {
  KEYED_PROVIDER_IDS,
  PROVIDER_IDS,
  type KeyedProviderId,
  type ProviderId,
} from "@/lib/providers/ids";

/** API keys are short; this also bounds a hand-edited settings file. */
export const MAX_SETTINGS_KEY_LENGTH = 4096;

const providerEnum = z.enum(PROVIDER_IDS as unknown as [ProviderId, ...ProviderId[]]);
const keyOptional = z
  .string()
  .max(MAX_SETTINGS_KEY_LENGTH)
  .optional()
  .catch(undefined);

/**
 * Shape of `.data/settings.json`. Every field is salvageable: a hand-edited bad
 * provider or key must not discard the rest of the file.
 */
export const SettingsFileSchema = z.object({
  provider: providerEnum.optional().catch(undefined),
  keys: z
    .object({
      openrouter: keyOptional,
      elevenlabs: keyOptional,
      gemini: keyOptional,
    })
    .default({})
    .catch({}),
});

export type AppSettings = z.infer<typeof SettingsFileSchema>;

/** PUT body. Omitted fields are unchanged; `provider: null` clears the default. */
export const SettingsUpdateSchema = z
  .object({
    provider: providerEnum.nullable().optional(),
    keys: z
      .object({
        openrouter: z.string().max(MAX_SETTINGS_KEY_LENGTH).optional(),
        elevenlabs: z.string().max(MAX_SETTINGS_KEY_LENGTH).optional(),
        gemini: z.string().max(MAX_SETTINGS_KEY_LENGTH).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

export type ProviderSource =
  | "request"
  | "settings"
  | "STT_PROVIDER"
  | "detected-key"
  | "mock";

export type KeyStatus = {
  /** A key is saved in the app. The value is never returned. */
  saved: boolean;
  /** A key comes from `.env.local` / the process environment. */
  env: boolean;
};

export type SettingsStatus = {
  savedProvider: ProviderId | null;
  resolvedProvider: ProviderId;
  providerSource: ProviderSource;
  keys: Record<KeyedProviderId, KeyStatus>;
  warnings: string[];
};

export function emptySettings(): AppSettings {
  return { keys: {} };
}

export function parseSettings(raw: unknown): AppSettings {
  const parsed = SettingsFileSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptySettings();
}

export function keyedProviderIds(): readonly KeyedProviderId[] {
  return KEYED_PROVIDER_IDS;
}
