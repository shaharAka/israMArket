import Link from "next/link";
import type { CSSProperties } from "react";
import { DeletedNotice } from "@/components/landing/DeletedNotice";
import { BrandMark, IconArrowLeft } from "@/lib/icons";
import { NO_CARD_AT_SIGNUP, NO_COMMITMENT_LABEL, PRICE_ILS, TRIAL_LABEL, VAT_NOTE, formatPrice } from "@/lib/pricing";
import { HERO, MONTH, PART_SUMMARY, STORY, TRUST, WEEK_TOUR, type Step } from "./content";
import { HeroWeek } from "./HeroWeek";
import { PARTS, SheetHeader } from "./PlanSheet";
import { RouteHero } from "./RouteHero";
import { ScenePlayer } from "./ScenePlayer";
import { SceneStep } from "./SceneStep";
import "./lv2.css";

/**
 * The landing page, in the product's own direction (blue and sun, the storefront, the plan
 * as a route). The first screen says what it is, for whom and the one action; the map
 * beside it draws the example plan as a route. Then, once each: how the plan is built, what
 * a week looks like, what the month teaches, trust, price, questions.
 *
 * One filled button on the page (the hero's). Nothing is pinned and nothing waits for the
 * scroll: each scene plays by itself once it is on screen (ScenePlayer).
 */

const FAQ: { q: string; a: string }[] = [
  {
    q: "מה קורה אחרי החודש החינמי?",
    a: `מהחודש השני: ${formatPrice()} לחודש. ${VAT_NOTE}.${NO_CARD_AT_SIGNUP ? " בהרשמה לא מבקשים כרטיס אשראי." : ""} אם רוצים להמשיך, מפעילים מנוי לקראת סוף החודש החינמי.`,
  },
  { q: "צריך אתר כדי להתחיל?", a: "לא. אפשר להתחיל עם אינסטגרם, פייסבוק או טיקטוק, או פשוט לספר לנו על העסק." },
  {
    q: "מה אתם עושים עם הסיסמה לאינסטגרם?",
    a: "אנחנו לא רואים אותה. מחברים דרך פייסבוק, והסיסמה נשארת שם. אנחנו מקבלים הרשאה לקרוא פוסטים ונתונים בלבד.",
  },
  { q: "אפשר לבטל?", a: `${NO_COMMITMENT_LABEL}. אפשר לבטל בעמוד המנוי, ולמחוק את החשבון ואת כל המידע בכל רגע.` },
  {
    q: "מי כותב את הפוסטים?",
    a: "ה-AI שלנו כותב אותם, לפי התוכנית ובסגנון שלכם. אתם קוראים, משנים ומאשרים, ומפרסמים בעצמכם.",
  },
];

/**
 * Runs before the first paint: with motion allowed, the hero map starts empty instead of
 * flashing finished. Under reduced motion it does nothing and the page stays finished.
 */
const EARLY = 'if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.dataset.lv2="on"';

/** Hold per step, in ms: long enough to read the row and look at the picture. */
const STORY_HOLD_MS = 4500;
const TOUR_HOLD_MS = 3200;

/** The rows of a playing scene: each one a step the visitor can pick, with its progress bar. */
function StepList({ steps, label, numbered = false }: { steps: Step[]; label: string; numbered?: boolean }) {
  return (
    <ol className="lv2-steplist" aria-label={label}>
      {steps.map((step, i) => (
        <li key={step.title} data-i={i} className="lv2-stepitem">
          <span className="lv2-stepitem-bar" aria-hidden>
            <i />
          </span>
          <h3 className="lv2-stepitem-title">
            <SceneStep index={i}>
              {numbered ? (
                <span className="lv2-step-num" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
              ) : null}
              {step.title}
            </SceneStep>
          </h3>
          <p className="lv2-stepitem-body">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function Landing() {
  return (
    <div className="lv2">
      <script dangerouslySetInnerHTML={{ __html: EARLY }} />

      <header className="lv2-nav">
        <div className="lv2-wrap lv2-nav-row">
          <Link href="/" className="lv2-brand" aria-label="ישראמארקט">
            <BrandMark className="h-8 w-8 text-[var(--lv2-blue)]" />
            <span>ישראמארקט</span>
          </Link>
          <nav aria-label="בעמוד הזה" className="lv2-nav-links">
            <a href="#story">איך זה עובד</a>
            <a href="#week">השבוע שלכם</a>
            <a href="#price">מחיר</a>
            <a href="#faq">שאלות</a>
          </nav>
          <div className="lv2-nav-end">
            <Link href="/login">להיכנס</Link>
            <Link href="/start" className="lv2-btn-quiet">
              להתחיל
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* What it is, for whom, the one action. The map plays the example plan beside it. */}
        <section className="lv2-hero" aria-labelledby="lv2-title">
          <div className="lv2-wrap lv2-hero-grid">
            <div className="lv2-hero-text">
              <h1 id="lv2-title" className="lv2-display lv2-in" style={{ "--d": 0 } as CSSProperties}>
                {HERO.title}
              </h1>
              <p className="lv2-lead lv2-in" style={{ "--d": 1 } as CSSProperties}>
                {HERO.lead}
              </p>
              <div className="lv2-hero-cta lv2-in" style={{ "--d": 2 } as CSSProperties}>
                <Link href="/start" className="lv2-btn">
                  להתחיל
                  <IconArrowLeft className="h-4 w-4" />
                </Link>
              </div>
              <p className="lv2-fine lv2-in" style={{ "--d": 3 } as CSSProperties}>
                אפשר להתחיל בלי להירשם · {TRIAL_LABEL}
              </p>
            </div>
            <div className="lv2-hero-map lv2-in" style={{ "--d": 2 } as CSSProperties}>
              <RouteHero />
            </div>
          </div>
        </section>

        {/* How the plan is built: three steps, and the plan sheet folding open beside them. */}
        <section
          id="story"
          className="lv2-story"
          data-scene="steps"
          data-hold={STORY_HOLD_MS}
          aria-labelledby="lv2-story-title"
        >
          <div className="lv2-wrap lv2-scene-grid lv2-story-grid">
            <div className="lv2-scene-text">
              <p className="lv2-eyebrow">איך זה עובד</p>
              <h2 id="lv2-story-title" className="lv2-h2">
                קודם בונים תוכנית לעסק שלכם.
              </h2>
              <StepList steps={STORY} label="שלבי בניית התוכנית" numbered />
            </div>
            <div className="lv2-sheet lv2-story-sheet" aria-hidden>
              <SheetHeader />
              <div className="lv2-sheet-stack" data-fold-stack>
                {PARTS.map(({ key, title, Body }, i) => (
                  <section key={key} data-i={i} className="lv2-part lv2-fold">
                    <h3 className="lv2-part-title">
                      {title}
                      <span className="lv2-fold-sum">{PART_SUMMARY[i]}</span>
                    </h3>
                    <div className="lv2-fold-body">
                      <div>
                        <Body live />
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* The weekly screen, as a short tour: each point lights up its part of the card. */}
        <section
          id="week"
          className="lv2-tour"
          data-scene="steps"
          data-hold={TOUR_HOLD_MS}
          aria-labelledby="lv2-week-title"
        >
          <div className="lv2-wrap lv2-scene-grid lv2-tour-grid">
            <div className="lv2-scene-text">
              <p className="lv2-eyebrow">השבוע שלכם</p>
              <h2 id="lv2-week-title" className="lv2-h2">
                כל שבוע, צעד אחד ברור.
              </h2>
              <StepList steps={WEEK_TOUR} label="מה יש במסך השבועי" />
            </div>
            <div className="lv2-tour-stage">
              <HeroWeek tour className="lv2-tour-card" />
            </div>
          </div>
        </section>

        {/* The monthly review, on the brand blue. */}
        <section id="month" className="lv2-month" aria-labelledby="lv2-month-title">
          <div className="lv2-wrap" data-scene="reveal">
            <p className="lv2-eyebrow lv2-eyebrow--sun">בסוף כל חודש</p>
            <h2 id="lv2-month-title" className="lv2-h2 lv2-month-title">
              מה שלמדנו משנה את החודש הבא.
            </h2>
            <dl className="lv2-month-rows">
              {MONTH.map((row, j) => (
                <div key={row.k} style={{ "--j": j } as CSSProperties}>
                  <dt>{row.k}</dt>
                  <dd>{row.v}</dd>
                </div>
              ))}
            </dl>
            <p className="lv2-fine lv2-fine--on-blue">דוגמה מסיכום החודש באפליקציה. אתם מחליטים מה משנים.</p>
          </div>
        </section>

        <section className="lv2-trust" aria-labelledby="lv2-trust-title">
          <div className="lv2-wrap" data-scene="reveal">
            <h2 id="lv2-trust-title" className="lv2-h2">
              המידע של העסק נשאר שלכם.
            </h2>
            <dl className="lv2-trust-rows">
              {TRUST.map((row, j) => (
                <div key={row.k} style={{ "--j": j } as CSSProperties}>
                  <dt>{row.k}</dt>
                  <dd>{row.v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/security" className="lv2-link">
              מה בדיוק אנחנו שומרים
            </Link>
          </div>
        </section>

        <section id="price" className="lv2-price" aria-labelledby="lv2-price-title">
          <div className="lv2-wrap" data-scene="reveal">
            <p className="lv2-eyebrow">מחיר</p>
            <h2 id="lv2-price-title" className="lv2-price-num">
              <span>{PRICE_ILS}</span>
              <small>₪ לחודש</small>
            </h2>
            <p className="lv2-lead">
              {TRIAL_LABEL}
              {NO_CARD_AT_SIGNUP ? ", בלי כרטיס אשראי" : ""}. אין התחייבות.
            </p>
            <p className="lv2-fine">{VAT_NOTE}</p>
            <Link href="/start" className="lv2-btn-quiet lv2-btn-quiet--lg lv2-price-cta">
              להתחיל עם העסק שלכם
            </Link>
          </div>
        </section>

        <section id="faq" className="lv2-faq" aria-labelledby="lv2-faq-title">
          <div className="lv2-wrap lv2-faq-grid">
            <h2 id="lv2-faq-title" className="lv2-h2">
              שאלות ששואלים אותנו
            </h2>
            <div>
              {FAQ.map(({ q, a }) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="lv2-foot">
        <div className="lv2-wrap lv2-foot-row">
          <span>ישראמארקט</span>
          <Link href="/security">אבטחה ופרטיות</Link>
          <Link href="/terms">תנאי שימוש</Link>
        </div>
      </footer>

      <DeletedNotice />
      <ScenePlayer />
    </div>
  );
}
