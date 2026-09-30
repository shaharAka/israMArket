import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CONTACT_EMAIL } from "@/lib/company";
import { BrandMark } from "@/lib/icons";
import { formatPrice, TRIAL_LABEL, VAT_NOTE } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "תנאי שימוש · ישראמארקט",
  description: "מה ישראמארקט עושה, מה אתם אחראים עליו, מחיר, ביטול ומחיקה.",
};

/**
 * Terms of use. Meta asks for a Terms of Service URL for App Review, next to the privacy
 * page (/security) and data deletion (/security#delete).
 *
 * Same rule as /security: state only what the product does. Price and trial come from
 * lib/pricing.ts. There is no billing system yet, so nothing here describes charges,
 * invoices or refunds.
 *
 * OPEN (owner): the legal entity, governing-law clause and a lawyer's review before launch.
 */

const LINK = "font-bold text-[var(--ink)] underline decoration-[var(--rule-dark)] underline-offset-4 hover:decoration-[var(--ink)]";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-[var(--rule)] py-8 sm:py-10">
      <h2 id={id} className="text-xl font-black tracking-tight text-[var(--ink)] sm:text-2xl">
        {title}
      </h2>
      <div className="mt-4 space-y-3 text-[15px] leading-7 text-[var(--ink-soft)] sm:text-base sm:leading-8">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2.5">
          <BrandMark className="h-8 w-8 text-[var(--primary)]" />
          <span className="text-lg font-black tracking-tight">ישראמארקט</span>
        </Link>
        <Link href="/" className={`${LINK} inline-flex min-h-11 items-center text-sm`}>
          לעמוד הראשי
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-8">
        <div className="pb-8 pt-8 sm:pt-12">
          <p className="text-sm font-bold text-[var(--primary)]">תנאי שימוש</p>
          <h1 className="mt-2 text-[2rem] font-black leading-[1.15] tracking-tight [text-wrap:balance] sm:text-[2.6rem]">
            מה אנחנו עושים, ומה נשאר אצלכם
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--ink-soft)] sm:text-lg sm:leading-8">
            השימוש בישראמארקט אומר שאתם מסכימים לתנאים האלה. כתבנו אותם קצר ובפשטות.
          </p>
        </div>

        <Section id="service" title="השירות">
          <p>
            ישראמארקט בונה לעסק תוכנית שיווק, מציעה פוסטים ומשימות לכל שבוע, ומראה מה עבד. חלק מהתוכן נכתב בעזרת בינה
            מלאכותית, ולכן הוא הצעה. לפני שמפרסמים, קוראים ומאשרים.
          </p>
          <p>
            התוכנית מבוססת על מה שסיפרתם ועל נתונים שחיברתם. היעדים בה הם השערות שאנחנו בודקים יחד. אנחנו לא מבטיחים
            תוצאה מסוימת במכירות, בעוקבים או בפניות.
          </p>
        </Section>

        <Section id="yours" title="מה אתם אחראים עליו">
          <p>
            אתם מפרסמים בעצמכם. אין לנו הרשאה לפרסם בשמכם. לכן האחריות על מה שמתפרסם, על המחירים, המבצעים והמוצרים
            שמוזכרים בו, היא שלכם.
          </p>
          <p>
            תעלו רק תמונות וטקסטים שמותר לכם להשתמש בהם. אל תשתמשו בשירות לתוכן שקרי, פוגעני או לא חוקי, ואל תנסו
            לפרוץ אליו או להעמיס עליו.
          </p>
          <p>שמרו על הסיסמה שלכם. חשבון אחד שייך לעסק אחד ולמי שפתח אותו.</p>
        </Section>

        <Section id="content" title="של מי התוכן">
          <p>
            התמונות, הטקסטים והנתונים שלכם נשארים שלכם. גם הפוסטים והתוכניות שיצרנו בשבילכם שלכם, ואפשר להשתמש בהם
            בכל מקום. אנחנו משתמשים בהם רק כדי לתת לכם את השירות. מה נשמר ואצל מי, כתוב ב
            <Link href="/security" className={LINK}>
              עמוד האבטחה והפרטיות
            </Link>
            .
          </p>
        </Section>

        <Section id="price" title="מחיר וביטול">
          <p>
            {TRIAL_LABEL}. אחר כך {formatPrice()} לחודש. {VAT_NOTE}.
          </p>
          <p>אין התחייבות. אפשר להפסיק בכל רגע, ולא נחייב על חודש שלא התחיל.</p>
          <p>
            אם נשנה את המחיר או את התנאים, נודיע באימייל לפחות 30 יום מראש.
          </p>
        </Section>

        <Section id="end" title="סיום">
          <p>
            אפשר למחוק את החשבון בכל רגע בעמוד{" "}
            <Link href="/account" className={LINK}>
              החשבון
            </Link>
            . המחיקה מוחקת את כל המידע, כמו שמתואר ב
            <Link href="/security#delete" className={LINK}>
              איך מוחקים
            </Link>
            .
          </p>
          <p>אם החשבון משמש לפגיעה באחרים או בשירות, נוכל לסגור אותו. נכתוב לכם לפני כן, חוץ ממקרה דחוף.</p>
        </Section>

        <Section id="limits" title="גבולות האחריות">
          <p>
            השירות ניתן כמו שהוא. נעשה הכול כדי שיעבוד ושהמידע יישמר, אבל ייתכנו תקלות. אנחנו לא אחראים לנזק עקיף, כמו
            אובדן מכירות, בגלל תקלה או בגלל תוכן שפרסמתם.
          </p>
          <p>גוגל, פייסבוק ואינסטגרם הם שירותים של חברות אחרות, והתנאים שלהם חלים עליהם.</p>
        </Section>

        <Section id="contact" title="שאלות">
          <p>
            כתבו לנו:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr" className={LINK}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>
      </main>
    </div>
  );
}
