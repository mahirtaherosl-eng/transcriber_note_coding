export type ProviderId =
  | "elevenlabs"
  | "gemini"
  | "openrouter"
  | "qwen"
  | "soniox"
  | "azure"
  | "mock";

export type AppLanguage = {
  id: string;
  label: string;
  nativeLabel?: string;
  /** ElevenLabs Scribe language code (ISO-639-1/3). */
  elevenlabs?: string;
  /** Gemini BCP-47 language hint (omit for auto/code-switching). */
  gemini?: string;
  soniox?: string;
  azure?: string;
};

/**
 * The extension point for language support. Add a row here and it appears in the
 * language picker automatically. Codes are provider-specific: Cantonese is `yue`
 * for Scribe, not `zh-HK`; Azure uses `zh-HK` and `bn-IN`.
 */
export const LANGUAGES: AppLanguage[] = [
  { id: "auto", label: "Auto-detect" },
  { id: "yue", label: "Cantonese", nativeLabel: "廣東話", elevenlabs: "yue", gemini: "yue-Hant-HK", azure: "zh-HK" },
  { id: "en", label: "English", elevenlabs: "en", gemini: "en-US", soniox: "en", azure: "en-US" },
  { id: "bn", label: "Bengali", nativeLabel: "বাংলা", elevenlabs: "bn", gemini: "bn-IN", soniox: "bn", azure: "bn-IN" },
  { id: "zh", label: "Mandarin Chinese", nativeLabel: "普通话", elevenlabs: "zh", gemini: "zh-CN", azure: "zh-CN" },
  { id: "hi", label: "Hindi", nativeLabel: "हिन्दी", elevenlabs: "hi", azure: "hi-IN" },
  { id: "ur", label: "Urdu", nativeLabel: "اردو", elevenlabs: "ur", azure: "ur-IN" },
  { id: "ta", label: "Tamil", nativeLabel: "தமிழ்", elevenlabs: "ta", azure: "ta-IN" },
  { id: "te", label: "Telugu", nativeLabel: "తెలుగు", elevenlabs: "te", azure: "te-IN" },
  { id: "ml", label: "Malayalam", nativeLabel: "മലയാളം", elevenlabs: "ml", azure: "ml-IN" },
  { id: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", elevenlabs: "kn", azure: "kn-IN" },
  { id: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", elevenlabs: "gu", azure: "gu-IN" },
  { id: "mr", label: "Marathi", nativeLabel: "मराठी", elevenlabs: "mr", azure: "mr-IN" },
  { id: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ", elevenlabs: "pa", azure: "pa-IN" },
  { id: "ne", label: "Nepali", nativeLabel: "नेपाली", elevenlabs: "ne", azure: "ne-NP" },
  { id: "si", label: "Sinhala", nativeLabel: "සිංහල", elevenlabs: "si", azure: "si-LK" },
  { id: "th", label: "Thai", nativeLabel: "ไทย", elevenlabs: "th", azure: "th-TH" },
  { id: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt", elevenlabs: "vi", azure: "vi-VN" },
  { id: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", elevenlabs: "id", azure: "id-ID" },
  { id: "ms", label: "Malay", nativeLabel: "Bahasa Melayu", elevenlabs: "ms", azure: "ms-MY" },
  { id: "fil", label: "Filipino", elevenlabs: "fil", azure: "fil-PH" },
  { id: "ja", label: "Japanese", nativeLabel: "日本語", elevenlabs: "ja", azure: "ja-JP" },
  { id: "ko", label: "Korean", nativeLabel: "한국어", elevenlabs: "ko", azure: "ko-KR" },
  { id: "ar", label: "Arabic", nativeLabel: "العربية", elevenlabs: "ar", azure: "ar-SA" },
  { id: "he", label: "Hebrew", nativeLabel: "עברית", elevenlabs: "he", azure: "he-IL" },
  { id: "fa", label: "Persian", nativeLabel: "فارسی", elevenlabs: "fa", azure: "fa-IR" },
  { id: "tr", label: "Turkish", nativeLabel: "Türkçe", elevenlabs: "tr", azure: "tr-TR" },
  { id: "ru", label: "Russian", nativeLabel: "Русский", elevenlabs: "ru", azure: "ru-RU" },
  { id: "uk", label: "Ukrainian", nativeLabel: "Українська", elevenlabs: "uk", azure: "uk-UA" },
  { id: "pl", label: "Polish", nativeLabel: "Polski", elevenlabs: "pl", azure: "pl-PL" },
  { id: "cs", label: "Czech", nativeLabel: "Čeština", elevenlabs: "cs", azure: "cs-CZ" },
  { id: "sk", label: "Slovak", nativeLabel: "Slovenčina", elevenlabs: "sk", azure: "sk-SK" },
  { id: "ro", label: "Romanian", nativeLabel: "Română", elevenlabs: "ro", azure: "ro-RO" },
  { id: "hu", label: "Hungarian", nativeLabel: "Magyar", elevenlabs: "hu", azure: "hu-HU" },
  { id: "el", label: "Greek", nativeLabel: "Ελληνικά", elevenlabs: "el", azure: "el-GR" },
  { id: "bg", label: "Bulgarian", nativeLabel: "Български", elevenlabs: "bg", azure: "bg-BG" },
  { id: "hr", label: "Croatian", nativeLabel: "Hrvatski", elevenlabs: "hr", azure: "hr-HR" },
  { id: "sr", label: "Serbian", nativeLabel: "Српски", elevenlabs: "sr", azure: "sr-RS" },
  { id: "nl", label: "Dutch", nativeLabel: "Nederlands", elevenlabs: "nl", azure: "nl-NL" },
  { id: "de", label: "German", nativeLabel: "Deutsch", elevenlabs: "de", azure: "de-DE" },
  { id: "fr", label: "French", nativeLabel: "Français", elevenlabs: "fr", azure: "fr-FR" },
  { id: "it", label: "Italian", nativeLabel: "Italiano", elevenlabs: "it", azure: "it-IT" },
  { id: "pt", label: "Portuguese", nativeLabel: "Português", elevenlabs: "pt", azure: "pt-BR" },
  { id: "es", label: "Spanish", nativeLabel: "Español", elevenlabs: "es", azure: "es-ES" },
  { id: "sv", label: "Swedish", nativeLabel: "Svenska", elevenlabs: "sv", azure: "sv-SE" },
  { id: "no", label: "Norwegian", nativeLabel: "Norsk", elevenlabs: "no", azure: "nb-NO" },
  { id: "da", label: "Danish", nativeLabel: "Dansk", elevenlabs: "da", azure: "da-DK" },
  { id: "fi", label: "Finnish", nativeLabel: "Suomi", elevenlabs: "fi", azure: "fi-FI" },
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

export function providerLanguageCode(
  provider: ProviderId | string,
  languageId: string,
): string | undefined {
  if (languageId === "auto") return undefined;
  const language = getLanguage(languageId);
  switch (provider) {
    case "elevenlabs":
      return language.elevenlabs;
    case "gemini":
      return language.gemini;
    case "qwen":
      return languageId;
    case "soniox":
      return language.soniox;
    case "azure":
      return language.azure;
    case "mock":
      return languageId;
    default:
      return undefined;
  }
}

export function supportsLanguage(provider: ProviderId | string, languageId: string): boolean {
  if (languageId === "auto") return true;
  if (provider === "mock") return true;
  // Gemini covers 85+ languages; an unmapped language simply gets no hint and
  // falls back to its auto-detection.
  if (provider === "gemini") return true;
  // OpenRouter's Gemini Transcribe route auto-detects and code-switches.
  if (provider === "openrouter") return true;
  // The local sidecar handles language names/auto itself.
  if (provider === "qwen") return true;
  return Boolean(providerLanguageCode(provider, languageId));
}
