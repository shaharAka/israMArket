import Link from "next/link";
import type { CSSProperties } from "react";
import { BrandMark, IconArrowLeft } from "@/lib/icons";
import { NO_CARD_AT_SIGNUP, NO_COMMITMENT_LABEL, PRICE_ILS, TRIAL_LABEL, VAT_NOTE, formatPrice } from "@/lib/pricing";
import { MONTH, PART_SUMMARY, STORY, TRUST } from "./content";
import { HeroWeek } from "./HeroWeek";
import { PARTS, SheetHeader } from "./PlanSheet";
import { ScrollScenes } from "./ScrollScenes";
import "./lv2.css";

/**
 * Landing draft: one idea per screen, large type, white space, and one pinned story in
 * which the example plan fills in as you scroll. Motion follows the scroll position
 * (ScrollScenes). One dark button on the page, in the hero; every later ask is quiet.
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

export function LandingDraft() {
  return (
    <div className="lv2">
      <header className="lv2-nav">
        <div className="lv2-wrap lv2-nav-row">
          <Link href="/" className="lv2-brand" aria-label="ישראמארקט">
            <BrandMark className="h-7 w-7 text-[var(--lv2-ink)]" />
            <span>ישראמארקט</span>
          </Link>
          <nav aria-label="בעמוד הזה" className="lv2-nav-links">
            <a href="#story">איך זה עובד</a>
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
        {/* Hero: one sentence, one ask, and the weekly home straightening as you scroll. */}
        <section className="lv2-hero" data-scene="hero" aria-labelledby="lv2-title">
          <div className="lv2-wrap lv2-hero-text">
            <p className="lv2-eyebrow lv2-in" style={{ "--d": 0 } as CSSProperties}>
              שיווק לעסקים קטנים
            </p>
            <h1 id="lv2-title" className="lv2-display lv2-in" style={{ "--d": 1 } as CSSProperties}>
              תוכנית שיווק אמיתית
              <br />
              לעסק שלכם.
            </h1>
            <p className="lv2-lead lv2-in" style={{ "--d": 2 } as CSSProperties}>
              מטרה עם מספרים, מסלול לשלושה חודשים, ובכל שבוע יודעים מה הצעד הבא ולמה.
            </p>
            <div className="lv2-hero-cta lv2-in" style={{ "--d": 3 } as CSSProperties}>
              <Link href="/start" className="lv2-btn">
                להתחיל בחינם
                <IconArrowLeft className="h-4 w-4" />
              </Link>
              <a href="#story" className="lv2-link">
                איך זה עובד
              </a>
            </div>
            <p className="lv2-fine lv2-in" style={{ "--d": 4 } as CSSProperties}>
              {TRIAL_LABEL} · בלי כרטיס אשראי
            </p>
          </div>
          <div className="lv2-hero-stage" aria-hidden>
            <HeroWeek className="lv2-hero-sheet" />
          </div>
        </section>

        {/* The story, pinned (desktop): the text changes, the plan fills in. */}
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

        {/* The same story, stacked (phones). */}
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

        {/* The monthly review, on dark: what worked, what didn't, what changes. */}
        <section className="lv2-week" aria-labelledby="lv2-month-title">
          <div className="lv2-wrap" data-scene="view">
            <p className="lv2-eyebrow lv2-eyebrow--dark">בסוף כל חודש</p>
            <h2 id="lv2-month-title" className="lv2-h2 lv2-week-title">
              מה שלמדנו משנה את החודש הבא.
            </h2>
            <dl className="lv2-week-rows">
              {MONTH.map((row, j) => (
                <div key={row.k} style={{ "--j": j } as CSSProperties}>
                  <dt>{row.k}</dt>
                  <dd>{row.v}</dd>
                </div>
              ))}
            </dl>
            <p className="lv2-fine lv2-fine--dark">דוגמה מסיכום החודש באפליקציה. אתם מחליטים מה משנים.</p>
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
            <p className="lv2-lead">
              {TRIAL_LABEL}. בלי כרטיס אשראי ובלי התחייבות.
            </p>
            <p className="lv2-fine">{VAT_NOTE}</p>
            <Link href="/start" className="lv2-btn-quiet lv2-btn-quiet--lg">
              להתחיל עם העסק שלכם
            </Link>
          </div>
        </section>

        <section id="faq" className="lv2-faq" aria-labelledby="lv2-faq-title">
          <div className="lv2-wrap lv2-faq-grid">
            <h2 id="lv2-faq-title" className="lv2-h2">
              שאלות.
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

      <ScrollScenes />
    </div>
  );
}
