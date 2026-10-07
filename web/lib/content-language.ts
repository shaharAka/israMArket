/** Content preferences belong to the business, never the interface-locale storage. */
export const CONTENT_LANGUAGES = ["he", "en", "ar", "ru"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export const CONTENT_LANGUAGE_NAMES: Record<ContentLanguage, string> = { he: "עברית", en: "English", ar: "العربية", ru: "Русский" };
export type ContentLanguagePreferences = { default_language: ContentLanguage; audience_languages: ContentLanguage[]; allow_language_tests: boolean };
export const DEFAULT_CONTENT_LANGUAGE: ContentLanguagePreferences = { default_language: "he", audience_languages: ["he"], allow_language_tests: false };
export const contentDirection = (language?: ContentLanguage) => language === "en" || language === "ru" ? "ltr" : "rtl";
