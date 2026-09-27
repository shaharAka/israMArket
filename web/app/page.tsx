import Link from "next/link";
import { BrandMark } from "@/lib/icons";
import { DemoLink } from "@/components/landing/DemoLink";
import { ExamplesCarousel } from "@/components/landing/ExamplesCarousel";

/**
 * The landing page. Calm on purpose: it says what we do in one breath, asks for one
 * thing ("להתחיל"), and shows examples instead of demanding a website. The site scan
 * that used to be the hero now happens inside /start, and only if the owner has a site.
 *
 * The product is the plan and the ongoing research; posts are what the plan produces.
 * The hero and the examples are both written in that order.
 */

const STEPS = ["מספרים לנו על העסק", "חוקרים ובונים איתכם תוכנית", "כל חודש: כיוון, פוסטים ובדיקה מה הצליח"];

const QUIET_LINK =
  "inline-flex min-h-11 items-center font-bold text-[#191b18] underline decoration-[#c7c4b7] underline-offset-4 hover:decoration-[#191b18] disabled:opacity-60";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f9f8f6] text-[#191b18]">
      <header className="mx-auto flex max-w-7xl items-center gap-2.5 px-4 pt-4 sm:px-8 sm:pt-6">
        <BrandMark className="h-8 w-8 text-[#191b18]" />
        <span className="text-lg font-black tracking-tight">ישראמארקט</span>
      </header>

      <main>
        <section
          aria-labelledby="hero-title"
          data-landing-hero
          className="mx-auto grid max-w-7xl items-center gap-8 px-4 pb-10 pt-8 sm:px-8 sm:pt-14 lg:min-h-[calc(100svh-9rem)] lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pb-16"
        >
          <div className="max-w-xl">
            <p className="text-sm font-bold text-[#2d3f32]">שיווק לעסקים קטנים</p>
            <h1
              id="hero-title"
              className="mt-3 text-[2.15rem] font-black leading-[1.12] tracking-tight [text-wrap:balance] sm:text-5xl lg:text-[3.5rem]"
            >
              בונים יחד את השיווק של העסק, חודש אחרי חודש
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-[#5e6159] sm:text-lg sm:leading-8">
              לומדים את העסק, הלקוחות ולוח השנה. בונים איתכם תוכנית לכל חודש, וממשיכים לבדוק מה הצליח.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <Link
                href="/start"
                className="drawn-button inline-flex min-h-12 w-full items-center justify-center bg-[#191b18] px-10 py-3 text-base font-bold text-white hover:bg-[#2c2f29] sm:w-auto"
              >
                להתחיל
              </Link>
              <p className="text-center text-sm text-[#5e6159] sm:text-right">אפשר להתחיל בלי להירשם.</p>
            </div>

            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-4 text-sm text-[#5e6159] sm:justify-start">
              <span>
                כבר יש לכם חשבון?{" "}
                <Link href="/login" className={QUIET_LINK}>
                  להיכנס
                </Link>
              </span>
              <DemoLink className={QUIET_LINK} />
            </p>
          </div>

          <ol aria-label="איך זה עובד" className="divide-y divide-[#e6e4dc] border-y border-[#e6e4dc]">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-center gap-4 py-3.5 lg:gap-5 lg:py-7">
                <span
                  aria-hidden
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#191b18] text-sm font-bold lg:h-11 lg:w-11 lg:text-lg"
                >
                  {index + 1}
                </span>
                <p className="text-base font-bold leading-6 lg:text-2xl lg:leading-9">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="examples-title" className="border-t border-[#e6e4dc] bg-[#f3f1ec] pb-12 pt-10 sm:pb-16 sm:pt-14">
          <div className="mx-auto max-w-7xl">
            <div className="px-4 sm:px-8">
              <h2 id="examples-title" className="text-2xl font-black tracking-tight sm:text-3xl">
                ככה זה נראה
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e6159] sm:text-base sm:leading-7">
                מחקר, כיוון ופוסט לחודש אחד, בעסקים לדוגמה. העסקים בדויים.
              </p>
            </div>
            <div className="mt-6">
              <ExamplesCarousel />
            </div>
            <div className="mt-8 max-w-2xl space-y-1 px-4 text-sm leading-6 text-[#5e6159] sm:px-8">
              <p>
                ספרו לנו איפה העסק נמצא: אתר, אינסטגרם, פייסבוק או טיקטוק. גם בלי אתר אפשר להתחיל.
              </p>
              <p>את האתר אנחנו קוראים לבד. נתונים מאינסטגרם, רק אחרי שתחברו אותו. לא נמציא לכם מספרים.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
