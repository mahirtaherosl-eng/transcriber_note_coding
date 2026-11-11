import { isProviderId } from "@/lib/providers/ids";

export type { ProviderId } from "@/lib/providers/ids";

export type AppLanguage = {
  id: string;
  label: string;
  nativeLabel?: string;
  /** ElevenLabs Scribe language code (ISO-639-1/3). */
  elevenlabs?: string;
  /** Gemini BCP-47 language hint (omit for auto/code-switching). */
  gemini?: string;
};

/**
 * The extension point for language support. Add a row here and it appears in the
 * language picker automatically. Codes are provider-specific: Cantonese is `yue`
 * for Scribe, not `zh-HK`.
 */
export const LANGUAGES: AppLanguage[] = [
  { id: "auto", label: "Auto-detect" },
  { id: "yue", label: "Cantonese", nativeLabel: "廣東話", elevenlabs: "yue", gemini: "yue-Hant-HK" },
  { id: "en", label: "English", elevenlabs: "en", gemini: "en-US" },
  { id: "bn", label: "Bengali", nativeLabel: "বাংলা", elevenlabs: "bn", gemini: "bn-IN" },
  { id: "zh", label: "Mandarin Chinese", nativeLabel: "普通话", elevenlabs: "zh", gemini: "zh-CN" },
  { id: "hi", label: "Hindi", nativeLabel: "हिन्दी", elevenlabs: "hi" },
  { id: "ur", label: "Urdu", nativeLabel: "اردو", elevenlabs: "ur" },
  { id: "ta", label: "Tamil", nativeLabel: "தமிழ்", elevenlabs: "ta" },
  { id: "te", label: "Telugu", nativeLabel: "తెలుగు", elevenlabs: "te" },
  { id: "ml", label: "Malayalam", nativeLabel: "മലയാളം", elevenlabs: "ml" },
  { id: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", elevenlabs: "kn" },
  { id: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", elevenlabs: "gu" },
  { id: "mr", label: "Marathi", nativeLabel: "मराठी", elevenlabs: "mr" },
  { id: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ", elevenlabs: "pa" },
  { id: "ne", label: "Nepali", nativeLabel: "नेपाली", elevenlabs: "ne" },
  { id: "si", label: "Sinhala", nativeLabel: "සිංහල", elevenlabs: "si" },
  { id: "th", label: "Thai", nativeLabel: "ไทย", elevenlabs: "th" },
  { id: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt", elevenlabs: "vi" },
  { id: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", elevenlabs: "id" },
  { id: "ms", label: "Malay", nativeLabel: "Bahasa Melayu", elevenlabs: "ms" },
  { id: "fil", label: "Filipino", elevenlabs: "fil" },
  { id: "ja", label: "Japanese", nativeLabel: "日本語", elevenlabs: "ja" },
  { id: "ko", label: "Korean", nativeLabel: "한국어", elevenlabs: "ko" },
  { id: "ar", label: "Arabic", nativeLabel: "العربية", elevenlabs: "ar" },
  { id: "he", label: "Hebrew", nativeLabel: "עברית", elevenlabs: "he" },
  { id: "fa", label: "Persian", nativeLabel: "فارسی", elevenlabs: "fa" },
  { id: "tr", label: "Turkish", nativeLabel: "Türkçe", elevenlabs: "tr" },
  { id: "ru", label: "Russian", nativeLabel: "Русский", elevenlabs: "ru" },
  { id: "uk", label: "Ukrainian", nativeLabel: "Українська", elevenlabs: "uk" },
  { id: "pl", label: "Polish", nativeLabel: "Polski", elevenlabs: "pl" },
  { id: "cs", label: "Czech", nativeLabel: "Čeština", elevenlabs: "cs" },
  { id: "sk", label: "Slovak", nativeLabel: "Slovenčina", elevenlabs: "sk" },
  { id: "ro", label: "Romanian", nativeLabel: "Română", elevenlabs: "ro" },
  { id: "hu", label: "Hungarian", nativeLabel: "Magyar", elevenlabs: "hu" },
  { id: "el", label: "Greek", nativeLabel: "Ελληνικά", elevenlabs: "el" },
  { id: "bg", label: "Bulgarian", nativeLabel: "Български", elevenlabs: "bg" },
  { id: "hr", label: "Croatian", nativeLabel: "Hrvatski", elevenlabs: "hr" },
  { id: "sr", label: "Serbian", nativeLabel: "Српски", elevenlabs: "sr" },
  { id: "nl", label: "Dutch", nativeLabel: "Nederlands", elevenlabs: "nl" },
  { id: "de", label: "German", nativeLabel: "Deutsch", elevenlabs: "de" },
  { id: "fr", label: "French", nativeLabel: "Français", elevenlabs: "fr" },
  { id: "it", label: "Italian", nativeLabel: "Italiano", elevenlabs: "it" },
  { id: "pt", label: "Portuguese", nativeLabel: "Português", elevenlabs: "pt" },
  { id: "es", label: "Spanish", nativeLabel: "Español", elevenlabs: "es" },
  { id: "sv", label: "Swedish", nativeLabel: "Svenska", elevenlabs: "sv" },
  { id: "no", label: "Norwegian", nativeLabel: "Norsk", elevenlabs: "no" },
  { id: "da", label: "Danish", nativeLabel: "Dansk", elevenlabs: "da" },
  { id: "fi", label: "Finnish", nativeLabel: "Suomi", elevenlabs: "fi" },
];

export const QUICK_LANGUAGE_IDS = ["auto", "yue", "en", "bn"] as const;

export function getLanguage(id: string): AppLanguage {
  return LANGUAGES.find((language) => language.id === id) ?? LANGUAGES[0];
}

export function languageLabel(id: string | undefined): string {
  if (!id) return "Unknown";
  if (id === "auto") return "Auto-detect";
  if (id === "mixed") return "Mixed languages";
  return getLanguage(id).label;
}

export function providerLanguageCode(provider: string, languageId: string): string | undefined {
  if (languageId === "auto" || !isProviderId(provider)) return undefined;
  const language = getLanguage(languageId);
  switch (provider) {
    case "elevenlabs":
      return language.elevenlabs;
    case "gemini":
      return language.gemini;
    case "mock":
      return languageId;
    default:
      return undefined;
  }
}

export function supportsLanguage(provider: string, languageId: string): boolean {
  if (!isProviderId(provider)) return false;
  if (languageId === "auto") return true;
  if (provider === "mock") return true;
  // Gemini covers 85+ languages; an unmapped language simply gets no hint and
  // falls back to its auto-detection.
  if (provider === "gemini") return true;
  // OpenRouter's MAI route auto-detects and code-switches.
  if (provider === "openrouter") return true;
  return Boolean(providerLanguageCode(provider, languageId));
}
