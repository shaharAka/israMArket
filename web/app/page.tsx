import Link from "next/link";
import { BrandMark, IconArrowLeft } from "@/lib/icons";
import { Cycle } from "@/components/landing/Cycle";
import { DeletedNotice } from "@/components/landing/DeletedNotice";
import { DemoLink } from "@/components/landing/DemoLink";
import { Faq } from "@/components/landing/Faq";
import { LandingMotion } from "@/components/landing/LandingMotion";
import { Pricing } from "@/components/landing/Pricing";
import { RouteMap } from "@/components/landing/RouteMap";
import { Security } from "@/components/landing/Security";
import { Showcase } from "@/components/landing/Showcase";
import "@/components/landing/landing.css";

/**
 * The landing page. Calm on purpose: it says what we do in one breath, asks for one
 * thing ("להתחיל"), and shows examples instead of demanding a website. The site scan
 * that used to be the hero now happens inside /start, and only if the owner has a site.
 *
 * The product is the PLAN, not the post: a marketing plan for 3 months built for this
 * one business. The page tells it in order: research → strategy → the 3-month plan
 * (hero route, showcase) → measure → adjust (Cycle). Posts appear only as titles inside
 * a plan.
 *
 * Order: hero → showcase → cycle → security → pricing → FAQ → closing ask. Each section
 * has at most one dark button. The headline is the LCP; the route beside it is inline SVG.
 */

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
          className="mx-auto grid max-w-7xl items-center gap-7 px-4 pb-10 pt-7 sm:px-8 sm:pt-14 lg:min-h-[calc(100svh-9rem)] lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pb-16"
        >
          <div className="max-w-xl">
            <p className="text-sm font-bold text-[#2d3f32]">שיווק לעסקים קטנים</p>
            <h1
              id="hero-title"
              className="mt-3 text-[2.4rem] font-black leading-[1.1] tracking-tight [text-wrap:balance] sm:text-5xl lg:text-[3.5rem]"
            >
              תוכנית שיווק שנבנית רק לעסק שלכם
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-[#5e6159] sm:text-lg sm:leading-8">
              חוקרים את העסק, הלקוחות ולוח השנה, ובונים איתכם תוכנית ל-3 החודשים הקרובים. כל חודש בודקים מה הצליח ומעדכנים.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <Link
                href="/start"
                className="drawn-button lp-press inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[#191b18] px-10 py-3 text-base font-bold text-white hover:bg-[#2c2f29] sm:w-auto"
              >
                להתחיל
                <IconArrowLeft className="lp-cta-arrow h-4 w-4" />
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

          <RouteMap variant="wide" className="hidden lg:block" />
          <RouteMap variant="compact" className="mx-auto w-full max-w-[520px] lg:hidden" />
        </section>

        <section aria-labelledby="examples-title" className="border-t border-[#e6e4dc]">
          <Showcase />
        </section>

        <Cycle />

        <Security />

        <Pricing />

        <Faq />

        <section aria-labelledby="closing-title" className="lp-closing border-t border-[#ebe8e0]">
          <div data-rv className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-20">
            <div className="max-w-xl">
              <h2 id="closing-title" className="text-2xl font-black leading-tight tracking-tight [text-wrap:balance] sm:text-[2rem]">
                נבנה יחד את החודש הבא של העסק
              </h2>
              <p className="mt-3 text-base leading-7 text-[#34372f] sm:text-lg">
                ספרו לנו איפה העסק נמצא: אתר, אינסטגרם, פייסבוק או טיקטוק. גם בלי אתר אפשר להתחיל.
              </p>
            </div>
            <Link
              href="/start"
              className="drawn-button lp-press inline-flex min-h-12 w-full shrink-0 items-center justify-center bg-[#191b18] px-10 py-3 text-base font-bold text-white hover:bg-[#2c2f29] sm:w-auto"
            >
              להתחיל עם העסק שלכם
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#ebe8e0] bg-[#f9f8f6]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-[#5e6159] sm:px-8">
          <span className="font-bold text-[#34372f]">ישראמארקט</span>
          <Link href="/security" className={QUIET_LINK}>
            אבטחה ופרטיות
          </Link>
        </div>
      </footer>

      <DeletedNotice />
      <LandingMotion />
    </div>
  );
}
