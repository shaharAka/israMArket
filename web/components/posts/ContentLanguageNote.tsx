"use client";
import { useCopy } from "@/components/language/LanguageProvider";
import { CONTENT_LANGUAGE_NAMES, type ContentLanguage } from "@/lib/content-language";

export function ContentLanguageNote({ language, reason }: { language?: ContentLanguage; reason?: string }) {
  const t = useCopy();
  if (!language) return null;
  return <div className="mt-2 text-[13px] leading-6 text-[var(--ink-soft)]">
    <span>{t("שפת הפוסט")}: <bdi lang={language}>{CONTENT_LANGUAGE_NAMES[language]}</bdi></span>
    {reason ? <details className="mt-1"><summary className="min-h-11 cursor-pointer text-[var(--primary)]">{t("למה הצענו ניסוי בשפה הזו?")}</summary><p dir="auto">{reason}</p><p>{t("זו הצעה לבדיקה, לא הוכחה שהשפה הזו תביא יותר לקוחות. בדקו את הטיוטה לפני הפרסום.")}</p></details> : null}
  </div>;
}
