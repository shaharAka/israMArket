/** Interface and business-content languages are independent choices. No menu is enabled here. */
export const SUPPORTED_LOCALES = ["he", "en", "ar", "ru"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_META: Record<Locale, { name: string; direction: "rtl" | "ltr"; formatLocale: string }> = {
  he: { name: "עברית", direction: "rtl", formatLocale: "he-IL" },
  en: { name: "English", direction: "ltr", formatLocale: "en-IL" },
  ar: { name: "العربية", direction: "rtl", formatLocale: "ar-IL" },
  ru: { name: "Русский", direction: "ltr", formatLocale: "ru-IL" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
