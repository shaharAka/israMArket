import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/company";
import { formatPrice, NO_CARD_AT_SIGNUP, TRIAL_LABEL, VAT_NOTE } from "@/lib/pricing";
import { LEGAL_LINK as LINK, LegalPage, LegalSection as Section } from "@/components/landing/LegalPage";

export const metadata: Metadata = {
  title: "תנאי שימוש · ישראמארקט",
  description: "מה ישראמארקט עושה, מה אתם אחראים עליו, מחיר, ביטול ומחיקה.",
};

/**
 * Terms of use. Meta asks for a Terms of Service URL for App Review, next to the privacy
 * page (/security) and data deletion (/security#delete).
 *
 * Same rule as /security: state only what the product does. Price and trial come from
 * lib/pricing.ts. Payment is a monthly PayPal subscription (api/app/routers/billing.py),
 * cancelled from /billing. No tax invoices are issued yet, so none are promised here.
 *
 * OPEN (owner): the legal entity, governing-law clause and a lawyer's review before launch.
 */

/** The sections, in order: the contents rail and the section titles below. */
const CONTENTS = [
  { id: "service", title: "השירות" },
  { id: "yours", title: "מה אתם אחראים עליו" },
  { id: "content", title: "של מי התוכן" },
  { id: "price", title: "מחיר וביטול" },
  { id: "end", title: "סיום" },
  { id: "limits", title: "גבולות האחריות" },
  { id: "contact", title: "שאלות" },
] as const;

type SectionId = (typeof CONTENTS)[number]["id"];
const TITLE = Object.fromEntries(CONTENTS.map((item) => [item.id, item.title])) as Record<SectionId, string>;

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="תנאי שימוש"
      title="מה אנחנו עושים, ומה נשאר אצלכם"
      lead="השימוש בישראמארקט אומר שאתם מסכימים לתנאים האלה. כתבנו אותם בקצרה ובפשטות."
      contents={[...CONTENTS]}
      current="/terms"
    >
        <Section id="service" title={TITLE.service}>
          <p>
            ישראמארקט בונה לעסק תוכנית שיווק, מציעה פוסטים ומשימות לכל שבוע ומראה מה הצליח. חלק מהתוכן נכתב בעזרת AI, ולכן הוא
            הצעה. לפני שמפרסמים, קוראים ומאשרים.
          </p>
          <p>
            התוכנית נבנית לפי מה שסיפרתם ולפי הנתונים שחיברתם. היעדים בה הם השערות שאנחנו בודקים יחד. אנחנו לא מבטיחים
            תוצאה מסוימת במכירות, בעוקבים או בפניות.
          </p>
        </Section>

        <Section id="yours" title={TITLE.yours}>
          <p>
            אתם מפרסמים בעצמכם. אין לנו הרשאה לפרסם בשמכם. לכן האחריות על מה שמתפרסם, על המחירים, המבצעים והמוצרים
            שמוזכרים בו, היא שלכם.
          </p>
          <p>
            העלו רק תמונות וטקסטים שמותר לכם להשתמש בהם. אל תשתמשו בשירות לתוכן שקרי, פוגעני או לא חוקי, ואל תנסו
            לפרוץ אליו או להעמיס עליו.
          </p>
          <p>שמרו על הסיסמה שלכם. חשבון אחד שייך לעסק אחד ולמי שפתח אותו.</p>
        </Section>

        <Section id="content" title={TITLE.content}>
          <p>
            התמונות, הטקסטים והנתונים שלכם נשארים שלכם. גם הפוסטים והתוכניות שיצרנו בשבילכם הם שלכם, ואפשר להשתמש בהם
            בכל מקום. אנחנו משתמשים בהם רק כדי לתת לכם את השירות. מה נשמר ואצל מי, כתוב ב
            <Link href="/security" className={LINK}>
              עמוד האבטחה והפרטיות
            </Link>
            .
          </p>
        </Section>

        <Section id="price" title={TITLE.price}>
          <p>
            {TRIAL_LABEL}. אחר כך {formatPrice()} לחודש. {VAT_NOTE}.
          </p>
          <p>
            {NO_CARD_AT_SIGNUP ? "בהרשמה לא מבקשים כרטיס אשראי. " : ""}לקראת סוף החודש החינמי אפשר להפעיל מנוי בעמוד{" "}
            <Link href="/billing" className={LINK}>
              המנוי
            </Link>
            . משלמים דרך פייפאל, בחשבון פייפאל או בכרטיס אשראי, פעם בחודש. החיוב הראשון הוא רק אחרי שהחודש החינמי נגמר.
          </p>
          <p>
            אין התחייבות. אפשר לבטל בכל רגע בעמוד המנוי. אחרי ביטול לא נחייב שוב, והשירות נשאר פתוח עד סוף החודש ששילמתם
            עליו.
          </p>
          <p>
            אם נשנה את המחיר או את התנאים, נודיע באימייל לפחות 30 יום מראש.
          </p>
        </Section>

        <Section id="end" title={TITLE.end}>
          <p>
            אפשר למחוק את החשבון בכל רגע בעמוד{" "}
            <Link href="/account" className={LINK}>
              החשבון
            </Link>
            . המחיקה מוחקת את כל המידע, כמו שמפורט ב
            <Link href="/security#delete" className={LINK}>
              עמוד האבטחה והפרטיות
            </Link>
            .
          </p>
          <p>אם החשבון משמש לפגיעה באחרים או בשירות, נוכל לסגור אותו. נכתוב לכם לפני כן, חוץ ממקרים דחופים.</p>
        </Section>

        <Section id="limits" title={TITLE.limits}>
          <p>
            השירות ניתן כמו שהוא. נעשה הכול כדי שיעבוד ושהמידע יישמר, אבל ייתכנו תקלות. אנחנו לא אחראים לנזק עקיף, כמו
            אובדן מכירות, בגלל תקלה או בגלל תוכן שפרסמתם.
          </p>
          <p>גוגל, פייסבוק ואינסטגרם הם שירותים של חברות אחרות, והתנאים שלהם חלים עליהם.</p>
        </Section>

        <Section id="contact" title={TITLE.contact}>
          <p>
            כתבו לנו:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr" className={LINK}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>
    </LegalPage>
  );
}
