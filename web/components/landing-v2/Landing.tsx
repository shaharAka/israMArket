import Link from "next/link";
import type { CSSProperties } from "react";
import { DeletedNotice } from "@/components/landing/DeletedNotice";
import { BrandMark, IconArrowLeft } from "@/lib/icons";
import { NO_CARD_AT_SIGNUP, NO_COMMITMENT_LABEL, PRICE_ILS, TRIAL_LABEL, VAT_NOTE, formatPrice } from "@/lib/pricing";
import { MONTH, PART_SUMMARY, STORY, TRUST, WEEK_TOUR } from "./content";
import { HeroWeek } from "./HeroWeek";
import { PARTS, SheetHeader } from "./PlanSheet";
import { RouteHero } from "./RouteHero";
import { ScrollScenes } from "./ScrollScenes";
import "./lv2.css";

/**
 * The landing page, in the product's own direction (blue and sun, the storefront, the plan
 * as a route). The hero is a navigation map that draws the route as you scroll; then the
 * plan fills in, the weekly screen, the monthly review, trust, price, questions.
 *
 * One filled button on the page (the hero's). Motion follows the scroll (ScrollScenes).
 */

const FAQ: { q: string; a: string }[] = [
  {
    q: "מה קורה אחרי החודש החינמי?",
    a: `מהחודש השני: ${formatPrice()} לחודש. ${VAT_NOTE}.${NO_CARD_AT_SIGNUP ? " בהרשמה לא מבקשים כרטיס אשראי." : ""}`,
  },
  { q: "צריך אתר כדי להתחיל?", a: "לא. אפשר להתחיל עם אינסטגרם, פייסבוק או טיקטוק, או פשוט לספר לנו על העסק." },
  {
    q: "מה אתם עושים עם הסיסמה לאינסטגרם?",
    a: "אנחנו לא רואים אותה. החיבור נעשה דרך פייסבוק, והסיסמה נשארת שם. אנחנו מקבלים הרשאה לקרוא פוסטים ונתונים בלבד.",
  },
  { q: "אפשר לבטל?", a: `${NO_COMMITMENT_LABEL}. אפשר לבטל בעמוד המנוי, ולמחוק את החשבון וכל המידע בכל רגע.` },
  {
    q: "מי כותב את הפוסטים?",
    a: "הפוסטים נכתבים לפי התוכנית והסגנון שלכם. אתם קוראים, משנים ומאשרים, ומפרסמים בעצמכם.",
  },
];

/** Set before the first paint, so the scroll-driven start states never flash. */
const EARLY = 'document.documentElement.dataset.lv2="on"';

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
        {/* Hero, pinned on desktop: the text stays, the route draws itself on the map. */}
        <section className="lv2-hero" data-scene="track" data-steps="1" aria-labelledby="lv2-title">
          <div className="lv2-hero-pin">
            <div className="lv2-wrap lv2-hero-grid">
              <div className="lv2-hero-text">
                <p className="lv2-eyebrow lv2-in" style={{ "--d": 0 } as CSSProperties}>
                  שיווק לעסקים קטנים
                </p>
                <h1 id="lv2-title" className="lv2-display lv2-in" style={{ "--d": 1 } as CSSProperties}>
                  תוכנית שיווק שמתאימה לעסק שלכם.
                </h1>
                <p className="lv2-lead lv2-in" style={{ "--d": 2 } as CSSProperties}>
                  תוכנית שיווק מתמשכת שמתחילה בעסק שלכם. בוחרים צעד קרוב, מכינים תוכן ולומדים מהתוצאות.
                </p>
                <div className="lv2-hero-cta lv2-in" style={{ "--d": 3 } as CSSProperties}>
                  <Link href="/start" className="lv2-btn">
                    להתחיל
                    <IconArrowLeft className="h-4 w-4" />
                  </Link>
                </div>
                <p className="lv2-fine lv2-in" style={{ "--d": 4 } as CSSProperties}>
                  אפשר להתחיל בלי להירשם · {TRIAL_LABEL}
                </p>
              </div>
              <div className="lv2-hero-map lv2-in" style={{ "--d": 2 } as CSSProperties}>
                <RouteHero />
              </div>
            </div>
            <p className="lv2-scroll-hint" aria-hidden>
              <span />
              גללו כדי לראות את המסלול
            </p>
          </div>
        </section>

        {/* How the plan is built, pinned (desktop): the text changes, the plan folds open. */}
        <section id="story" className="lv2-story" data-scene="track" data-steps={STORY.length} aria-label="איך בונים את התוכנית">
          <div className="lv2-story-pin">
            <div className="lv2-wrap lv2-story-grid">
              <div className="lv2-story-text">
                <p className="lv2-eyebrow">איך בונים את התוכנית</p>
                <ol className="lv2-steps">
                  {STORY.map((step, i) => (
                    <li key={step.label} data-i={i} className="lv2-step">
                      <span className="lv2-step-num">{String(i + 1).padStart(2, "0")}</span>
                      <h2 className="lv2-h2">{step.title}</h2>
                      <p className="lv2-lead">{step.body}</p>
                    </li>
                  ))}
                </ol>
                <div className="lv2-ticks" aria-hidden>
                  {STORY.map((step, i) => (
                    <span key={step.label} data-i={i}>
                      <i />
                      {step.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="lv2-sheet lv2-story-sheet" aria-hidden>
                <SheetHeader />
                <div className="lv2-sheet-stack">
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
          </div>
        </section>

        {/* The same story, stacked (phones and tablets). */}
        <section className="lv2-story-stacked" aria-label="איך בונים את התוכנית">
          <div className="lv2-wrap">
            <p className="lv2-eyebrow">איך בונים את התוכנית</p>
            {STORY.map((step, i) => {
              const { title, Body } = PARTS[i];
              return (
                <article key={step.label} className="lv2-stack-item" data-scene="view">
                  <span className="lv2-step-num">{String(i + 1).padStart(2, "0")}</span>
                  <h2 className="lv2-h2">{step.title}</h2>
                  <p className="lv2-lead">{step.body}</p>
                  <div className="lv2-sheet lv2-stack-sheet">
                    <section className="lv2-part">
                      <h3 className="lv2-part-title">{title}</h3>
                      <Body live />
                    </section>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* The weekly screen, as a short tour (pinned on desktop): each point lights up
            its part of the card. */}
        <section id="week" className="lv2-tour" data-scene="track" data-steps={WEEK_TOUR.length} aria-labelledby="lv2-week-title">
          <div className="lv2-tour-pin">
            <div className="lv2-wrap lv2-tour-grid">
              <div className="lv2-tour-text">
                <p className="lv2-eyebrow">השבוע שלכם</p>
                <h2 id="lv2-week-title" className="lv2-h2">
                  כל שבוע, צעד אחד ברור.
                </h2>
                <ol className="lv2-tour-points">
                  {WEEK_TOUR.map((point, i) => (
                    <li key={point.k} data-i={i}>
                      <span className="lv2-tour-bar" aria-hidden>
                        <i />
                      </span>
                      <strong>{point.k}</strong>
                      <span>{point.v}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="lv2-tour-stage">
                <HeroWeek tour className="lv2-tour-card" />
              </div>
            </div>
          </div>
        </section>

        {/* The monthly review, on the brand blue. */}
        <section className="lv2-month" aria-labelledby="lv2-month-title">
          <div className="lv2-wrap" data-scene="view">
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
          <div className="lv2-wrap" data-scene="view">
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
          <div className="lv2-wrap" data-scene="view">
            <p className="lv2-eyebrow">מחיר</p>
            <h2 id="lv2-price-title" className="lv2-price-num">
              <span>{PRICE_ILS}</span>
              <small>₪ לחודש</small>
            </h2>
            <p className="lv2-lead">{TRIAL_LABEL}. בלי כרטיס אשראי ובלי התחייבות.</p>
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
      <ScrollScenes />
    </div>
  );
}
