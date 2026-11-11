/**
 * The single source of truth for provider ids. This module must stay
 * dependency-free: it is imported by client components, schemas, and scripts.
 */
export const PROVIDER_IDS = ["openrouter", "elevenlabs", "gemini", "mock"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Providers that need an API key. Mock never does. */
export const KEYED_PROVIDER_IDS = ["openrouter", "elevenlabs", "gemini"] as const;

export type KeyedProviderId = (typeof KEYED_PROVIDER_IDS)[number];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

export function isKeyedProviderId(value: unknown): value is KeyedProviderId {
  return typeof value === "string" && (KEYED_PROVIDER_IDS as readonly string[]).includes(value);
}
