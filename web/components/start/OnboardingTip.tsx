"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";
import type { ResearchJourney } from "@/lib/researchJourney";
import styles from "./tip.module.css";

// Purpose: help owners answer the current question, without recommending a plan
// before research or adding a second action to the interview.
export function OnboardingTip({ journey }: { journey: ResearchJourney }) {
  const t = useCopy();
  const { step, segment } = journey;
  let text: string | undefined;
  switch (step) {
    case "offer":
      text = {
        services: "תארו שירות אחד שאתם נותנים ולמי הוא מתאים. למשל: עיצוב דירות למשפחות לפני שיפוץ.",
        online_shop: "ציינו מה אתם מוכרים ולמי. למשל: בגדי תינוקות מכותנה, עם משלוח עד הבית.",
        physical_shop: "ציינו מה אפשר למצוא אצלכם ואיפה. למשל: מאפייה בחיפה עם לחמי מחמצת ואיסוף בבוקר.",
        software: "ספרו איזו משימה המוצר פותר ולמי. למשל: מערכת לתיאום תורים עבור מרפאות קטנות.",
        fundraising: "ספרו למי אתם עוזרים ומה התרומה מאפשרת. למשל: חונכות שבועית לילדים שצריכים עזרה בלימודים.",
      }[segment];
      break;
    case "different":
      text = "חשבו על סיבה שבגללה בוחרים דווקא בכם: התמחות מסוימת, שירות אישי או מוצר שקשה למצוא במקום אחר.";
      break;
    case "audiences":
      text = segment === "fundraising" ? "חשבו מי ירצה לתמוך בעשייה שלכם. למשל: תושבי הקהילה או תורמים שכבר מכירים את הפעילות." : "קהל שקל לזהות יעזור לדייק בהמשך. למשל: בעלי דירות לפני שיפוץ, במקום ״כולם״.";
      break;
    case "links":
      text = "הוסיפו קישור לעמוד העסקי עצמו, לא לפוסט בודד. כך נוכל להכיר גם את התוכן וגם את הסגנון שלכם.";
      break;
    case "sources":
      text = "בחרו את הדרכים שכבר מביאות אליכם אנשים, גם אם אלה המלצות מפה לאוזן ולא פרסום בתשלום.";
      break;
    case "connections":
      text = "כדאי להתחיל מהערוץ שבו אתם פעילים היום. בחיבור Google, בחרו את החשבון שמנהל את נתוני העסק.";
      break;
    case "software_offer":
      text = "אם יש כמה מסלולים, התחילו במוצר או במסלול שהכי חשוב לכם לקדם כרגע.";
      break;
    case "software":
      text = "תארו מה הלקוח מצליח לעשות בעזרת המוצר, ולא רק אילו תכונות יש בו.";
      break;
    case "metrics":
      text = segment === "online_shop"
        ? "ספרו הזמנות שהושלמו, לא כניסות לאתר או מוצרים שנוספו לסל. אם המספר לא מולכם, אפשר לבחור טווח."
        : segment === "fundraising"
          ? "ספרו תרומות או תורמים לפי המדד שבחרתם, ולא לחיצות על קישור התרומה. אפשר להיעזר בדוח החודשי של מערכת התרומות."
          : segment === "software"
            ? "בחרו את השלב שחשוב לכם לקדם: התנסות, הדגמה או תשלום. ספרו רק את מי שהגיע לשלב הזה."
            : segment === "physical_shop"
              ? "ספרו קניות, לא מבקרים בחנות. דוח הקופה של החודש האחרון יכול לעזור למצוא את המספר."
              : "הפרידו בין פניות לבין עבודות שנסגרו. ספרו את התוצאה שבחרתם, לפי היומן או רשימת הלקוחות שלכם.";
      break;
  }
  if (!text) return null;
  return (
    <aside className={styles.tip} aria-label={t("טיפ לשאלה הזו")}>
      <span className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 17v-1.5C9 14 6.5 12.5 6.5 9.5a5.5 5.5 0 0 1 11 0c0 3-2.5 4.5-2.5 6V17M9 17h6M10 20h4M12 1v1M3 9H2m20 0h-1M4.5 3.5l1 1m13-1-1 1" />
        </svg>
      </span>
      <div><strong><Copy text="טיפ קטן" /></strong><p><Copy text={text} /></p></div>
    </aside>
  );
}
