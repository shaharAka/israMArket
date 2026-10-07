"use client";
import { useCopy } from "./LanguageProvider";

/** Catalog coverage is not screen coverage: only list views whose runtime bindings are shipped. */
export function TranslationCoverage() {
  const t = useCopy();
  return <details id="translations" className="mt-5 border-t border-[var(--rule)] py-5 text-[14px] leading-7 text-[var(--ink-soft)]">
    <summary className="min-h-11 cursor-pointer font-semibold text-[var(--ink)]">{t("אילו מסכים כבר מתורגמים?")}</summary>
    <p className="mt-2">{t("עברית, אנגלית, ערבית ורוסית זמינות בעמוד הבית, בכניסה ובהרשמה, בניווט, בעדכונים ובתצוגת ההדגמה של התוצאות. גם בחירת שפת הפוסטים מתורגמת.")}</p>
    <p className="mt-2">{t("עדיין בתרגום: שאלות ההיכרות, בניית התוכנית והמסכים בתוך החשבון — היום שלי, תוכנית, נושאים ותמונות, עורך הפוסטים, לוח שנה, חיבורים, תוצאות מפורטות, עסק ומותג, עזרה, חשבון ותשלום. גם המסכים המשפטיים וכלי סקירת העיצוב צריכים השלמה ובדיקת שפה.")}</p>
    <p className="mt-2">{t("תוכן אישי של העסק, תוכניות ופוסטים שכבר נשמרו נשארים בשפה שבה נכתבו. הם לא מתורגמים אוטומטית כשמחליפים את שפת האתר.")}</p>
  </details>;
}
