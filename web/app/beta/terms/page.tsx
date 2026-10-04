import type { Metadata } from "next";
import Link from "next/link";
import { BETA_FEEDBACK_MINUTES, BETA_NOTICE_DAYS } from "@/lib/beta";
import { CONTACT_EMAIL } from "@/lib/company";
import { LEGAL_LINK as LINK, LegalPage, LegalSection as Section } from "@/components/landing/LegalPage";

export const metadata: Metadata = {
  title: "תנאי הבטא · ישראמארקט",
  description: "תנאים קצרים לבטא הפרטית של ישראמארקט: תקופה, חינם, משוב, פרסום ומחיקה.",
};

/**
 * DRAFT — NOT YET APPROVED BY THE OWNER. Shahar approves this wording before the first
 * invitation goes out (#100; the checklist is in docs/beta/invitation.md). Until then it
 * is reachable only from /beta, which is itself unlinked and noindex.
 *
 * Additions to /terms and /security for the beta, never a contradiction of them:
 * - free: beta accounts run with billing off (#103); a subscription starts only when the
 *   owner starts it on /billing (lib/pricing.ts, docs/billing.md);
 * - notice: the same 30 days /terms gives for any change of price or terms;
 * - publishing: no publish permission is requested (services/meta.py META_SCOPES,
 *   services/publish.py), so the owner publishes; /security "מה לא ביקשנו";
 * - where they got stuck: the beta funnel (#101) reads stages the product already stores;
 * - deleting: /account and /data-deletion, unchanged.
 */

const CONTENTS = [
  { id: "period", title: "תקופת הבטא" },
  { id: "free", title: "בחינם" },
  { id: "changes", title: "מה יכול להשתנות" },
  { id: "feedback", title: "מה נבקש מכם" },
  { id: "publish", title: "לא מפרסמים בשמכם" },
  { id: "leave", title: "לעזוב ולמחוק" },
  { id: "rest", title: "כל השאר" },
] as const;

type SectionId = (typeof CONTENTS)[number]["id"];
const TITLE = Object.fromEntries(CONTENTS.map((item) => [item.id, item.title])) as Record<SectionId, string>;

export default function BetaTermsPage() {
  return (
    <LegalPage
      eyebrow="תנאי הבטא"
      title="מה הבטא נותנת, ומה אנחנו מבקשים"
      lead="תנאים קצרים לתקופת הבטא, בנוסף לתנאי השימוש הרגילים. כתבנו אותם בפשטות."
      contents={[...CONTENTS]}
      current="/beta/terms"
      back={{ href: "/beta", label: "לעמוד הבטא" }}
    >
      <Section id="period" title={TITLE.period}>
        <p>
          הבטא היא תקופה סגורה, בהזמנה אישית, לפני שישראמארקט נפתחת לכולם. היא מתחילה כשאתם נרשמים ונמשכת עד ההשקה
          הציבורית.
        </p>
        <p>לפני שהבטא נגמרת נכתוב לכם באימייל, לפחות {BETA_NOTICE_DAYS} יום מראש, מה משתנה ומה האפשרויות שלכם.</p>
      </Section>

      <Section id="free" title={TITLE.free}>
        <p>כל תקופת הבטא חינם. לא מבקשים כרטיס אשראי ולא מחייבים.</p>
        <p>
          אחרי הבטא אפשר להמשיך במנוי לפי{" "}
          <Link href="/terms" className={LINK}>
            תנאי השימוש
          </Link>
          , או לעזוב. מנוי מתחיל רק אם הפעלתם אותו בעצמכם בעמוד המנוי. שום חיוב לא מתחיל לבד.
        </p>
      </Section>

      <Section id="changes" title={TITLE.changes}>
        <p>
          זו גרסה מוקדמת. מסכים ויכולות ישתנו בזמן הבטא, חלק יתווספו וחלק יוסרו, ולפעמים משהו לא יעבוד. נתקן מהר ככל
          שנוכל, ועל שינוי גדול נספר לכם מראש.
        </p>
        <p>
          החיבור לאינסטגרם, לפייסבוק ולגוגל עדיין מחכה לאישור של החברות האלה. עד שיאשרו, החיבור דורש צעד נוסף מצדכם,
          ונסביר אותו כשתגיעו אליו.
        </p>
      </Section>

      <Section id="feedback" title={TITLE.feedback}>
        <p>
          בערך {BETA_FEEDBACK_MINUTES} דקות בשבוע: לספר לנו בכנות מה היה ברור, מה תקע ומה מיותר. בוואטסאפ, באימייל או
          בשיחה, איך שנוח לכם. ושיחה קצרה אחת אחרי השבוע הראשון.
        </p>
        <p>המשוב הוא בקשה, לא חובה, ואפשר להפסיק בכל רגע.</p>
        <p>
          כדי לדעת איפה קשה, נראה עד איפה הגעתם במוצר: אם נבנתה תוכנית, אם אישרתם פוסט ואם סימנתם שפרסמתם. לא נשתמש
          בשם העסק, בתוכן או בנתונים שלכם בפרסום, בהדגמות או בסיפורי לקוחות בלי רשות מפורשת מכם.
        </p>
      </Section>

      <Section id="publish" title={TITLE.publish}>
        <p>
          אנחנו לא מפרסמים שום דבר בשם העסק. אין לנו הרשאה לפרסם באינסטגרם, בפייסבוק או בגוגל, והפוסטים מחכים לאישור
          שלכם. אתם מחליטים מה יוצא, ומפרסמים בעצמכם.
        </p>
      </Section>

      <Section id="leave" title={TITLE.leave}>
        <p>
          אפשר לעזוב את הבטא בכל רגע, בלי הסבר. את החשבון ואת כל המידע מוחקים בעמוד{" "}
          <Link href="/account" className={LINK}>
            החשבון
          </Link>
          , כמו שמוסבר ב
          <Link href="/data-deletion" className={LINK}>
            איך מוחקים את המידע
          </Link>
          .
        </p>
      </Section>

      <Section id="rest" title={TITLE.rest}>
        <p>
          בכל מה שלא כתוב כאן חלים{" "}
          <Link href="/terms" className={LINK}>
            תנאי השימוש
          </Link>{" "}
          ו
          <Link href="/security" className={LINK}>
            עמוד האבטחה והפרטיות
          </Link>
          . אם משהו כאן שונה מהם, למשל המחיר, בזמן הבטא קובע מה שכתוב כאן.
        </p>
        <p>
          שאלות? כתבו לנו:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr" className={LINK}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </Section>
    </LegalPage>
  );
}
