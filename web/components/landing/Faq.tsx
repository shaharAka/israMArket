import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { IconPlus } from "@/lib/icons";
import { NO_CARD_AT_SIGNUP, NO_COMMITMENT_LABEL, VAT_NOTE, formatPrice } from "@/lib/pricing";

type Question = { q: string; a: ReactNode };

const LINK = "font-bold text-[#191b18] underline decoration-[#c7c4b7] underline-offset-4 hover:decoration-[#191b18]";

/**
 * Six short answers. Native <details>: keyboard and screen-reader support for free, and
 * the answers stay in the page for search engines and for find-in-page.
 */
const QUESTIONS: Question[] = [
  {
    q: "מה קורה אחרי החודש החינמי?",
    a: (
      <>
        מהחודש השני: {formatPrice()} לחודש. {VAT_NOTE}.{" "}
        {NO_CARD_AT_SIGNUP ? "בהרשמה לא מבקשים כרטיס אשראי, ולכן שום חיוב לא יוצא לבד." : null}
      </>
    ),
  },
  {
    q: "צריך אתר כדי להתחיל?",
    a: "לא. אפשר להתחיל עם אינסטגרם, פייסבוק או טיקטוק, או פשוט לספר לנו על העסק.",
  },
  {
    // OAuth: meta.authorization_url sends the owner to facebook.com; we only get a token.
    q: "מה אתם עושים עם הסיסמה לאינסטגרם?",
    a: "שום דבר, כי אנחנו לא רואים אותה. מחברים את אינסטגרם במסך של פייסבוק עצמה, ומשם מקבלים רק גישה לראות את הפוסטים והנתונים. אין לנו הרשאה לפרסם.",
  },
  {
    q: "אפשר לבטל?",
    a: (
      <>
        {NO_COMMITMENT_LABEL}. ואם תרצו, אפשר למחוק את החשבון וכל המידע בעמוד החשבון, בכל רגע.
      </>
    ),
  },
  {
    q: "מי כותב את הפוסטים?",
    a: "מאיה כותבת אותם ב-AI, לפי התוכנית של החודש והסגנון שלכם. אתם קוראים, משנים ומאשרים, ומפרסמים בעצמכם.",
  },
  {
    q: "מה עם המידע שלי?",
    a: (
      <>
        הוא משמש רק כדי לבנות את השיווק שלכם. לא מוכרים ולא משתפים אותו עם מפרסמים.{" "}
        <Link href="/security" className={LINK}>
          כל הפרטים
        </Link>
      </>
    ),
  },
];

export function Faq() {
  return (
    <section aria-labelledby="faq-title" className="border-t border-[#ebe8e0] bg-[#fbfaf8]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1fr_minmax(0,44rem)] lg:gap-16">
        <header data-rv>
          <h2 id="faq-title" className="text-2xl font-black tracking-tight sm:text-[2rem]">
            שאלות ששואלים אותנו
          </h2>
        </header>

        <div data-rv style={{ "--rv-i": 1 } as CSSProperties} className="divide-y divide-[#e6e4dc] border-y border-[#e6e4dc]">
          {QUESTIONS.map(({ q, a }) => (
            <details key={q} className="lp-faq group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-4 py-4 text-base font-bold text-[#191b18] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#191b18] sm:text-lg [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">{q}</span>
                <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e1ded4] bg-white text-[#34372f] transition-transform duration-200 group-open:rotate-45">
                  <IconPlus className="h-4 w-4" />
                </span>
              </summary>
              <p className="max-w-2xl pb-5 text-[15px] leading-7 text-[#4f524b] sm:text-base">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
