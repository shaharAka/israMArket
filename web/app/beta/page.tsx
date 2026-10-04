import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { BETA_FEEDBACK_MINUTES, INVITE_PARAM, START_PATH, betaStartHref, readInvite } from "@/lib/beta";
import { BrandMark, IconArrowLeft } from "@/lib/icons";
import styles from "./beta.module.css";

export const metadata: Metadata = {
  title: "בטא פרטית · ישראמארקט",
  description: "הזמנה לבטא של ישראמארקט: מה מקבלים בשבוע הראשון, מה מבקשים, ואיך מתחילים.",
};

/**
 * /beta: where an invitation lands (#100). Unlinked from the site and noindex (layout.tsx).
 *
 * In the landing's direction (blue and sun, depth instead of boxes) and within the word
 * budget (UI-RULES §7: under 180 words in <main>). One filled button, "להתחיל": with an
 * invite in the address it links straight to the start flow, otherwise it submits the code
 * the owner types. lib/beta.ts holds where it goes, so #103 can change it in one place.
 *
 * DRAFT for the owner's approval: every promise here (free for the whole beta, the weekly
 * feedback, the call, the data line) is listed in docs/beta/invitation.md to confirm.
 */

/** What the first week brings. Each line exists in the product today (see the comments). */
const FIRST_WEEK = [
  // /start → the saved plan on /strategy: the goal with numbers and the next step.
  { k: "תוכנית לעסק", v: "מטרה אחת עם מספרים, והצעד הראשון אליה." },
  // /posts: written for the plan, in the business's style; the owner approves and publishes.
  { k: "פוסטים ראשונים", v: "בסגנון שלכם, עם התמונות שתעלו. אתם מאשרים ומפרסמים." },
  // /integrations#whatsapp: the WhatsApp link counts clicks per post (services/whatsapp.py).
  { k: "מדידה", v: "קישור לוואטסאפ שסופר לחיצות מכל פוסט." },
];

const ASK = [
  { k: `בערך ${BETA_FEEDBACK_MINUTES} דקות בשבוע`, v: "לספר לנו בכנות מה היה ברור, מה תקע ומה מיותר." },
  { k: "שיחה קצרה", v: "אחרי השבוע הראשון, בטלפון, מתי שנוח לכם." },
];

export default async function BetaPage({ searchParams }: PageProps<"/beta">) {
  const invite = readInvite((await searchParams)[INVITE_PARAM]);

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={`${styles.wrap} ${styles.navRow}`}>
          <Link href="/" className={styles.brand} aria-label="ישראמארקט, לעמוד הבית">
            <BrandMark className="h-8 w-8 text-[var(--primary)]" />
            <span>ישראמארקט</span>
          </Link>
          <Link href="/login" className={styles.quietLink}>
            להיכנס
          </Link>
        </div>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="beta-title">
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <p className={styles.eyebrow}>בטא פרטית, בהזמנה</p>
              <h1 id="beta-title" className={styles.title}>
                תוכנית שיווק לעסק שלכם, בחינם בזמן הבטא.
              </h1>
              <p className={styles.lead}>
                לעסקים קטנים בלי איש שיווק. כל שבוע מקבלים את הצעד הבא ופוסטים מוכנים בסגנון שלכם. אחר כך בודקים מה הצליח
                ומעדכנים את התוכנית.
              </p>
            </div>
            <StartCard invite={invite} />
          </div>
        </section>

        <section className={styles.deal} aria-label="מה מקבלים ומה מבקשים">
          <div className={`${styles.wrap} ${styles.dealGrid}`}>
            <div>
              <h2 className={styles.h2}>בשבוע הראשון</h2>
              <ol className={styles.steps}>
                {FIRST_WEEK.map((row, i) => (
                  <li key={row.k}>
                    <span className={styles.num} aria-hidden>
                      {i + 1}
                    </span>
                    <div>
                      <h3>{row.k}</h3>
                      <p>{row.v}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h2 className={styles.h2}>מה נבקש מכם</h2>
              <dl className={styles.rows}>
                {ASK.map((row) => (
                  <div key={row.k}>
                    <dt>{row.k}</dt>
                    <dd>{row.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section className={styles.trust} aria-labelledby="beta-trust-title">
          <div className={styles.wrap}>
            <h2 id="beta-trust-title" className={styles.h2}>
              חינם, והמידע נשאר שלכם.
            </h2>
            <dl className={`${styles.rows} ${styles.trustRows}`}>
              <div>
                {/* Billing is a subscription the owner starts on /billing (lib/pricing.ts);
                    beta accounts run with billing off (#103). */}
                <dt>חינם לכל הבטא</dt>
                <dd>לא מבקשים כרטיס אשראי ולא מחייבים. לפני שהבטא נגמרת נודיע באימייל, ואתם מחליטים אם להמשיך.</dd>
              </div>
              <div>
                {/* /security: what is stored and why; /data-deletion: deleting everything. */}
                <dt>המידע שלכם</dt>
                <dd>
                  משמש רק כדי לעבוד בשבילכם ולראות איפה נתקעתם. אפשר למחוק הכול בכל רגע.{" "}
                  <Link href="/security" className={styles.link}>
                    מה בדיוק אנחנו שומרים
                  </Link>
                </dd>
              </div>
            </dl>
            <Link href="/beta/terms" className={styles.link}>
              תנאי הבטא
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.foot}>
        <div className={`${styles.wrap} ${styles.footRow}`}>
          <span>ישראמארקט</span>
          <Link href="/beta/terms">תנאי הבטא</Link>
          <Link href="/security">אבטחה ופרטיות</Link>
          <Link href="/terms">תנאי שימוש</Link>
        </div>
      </footer>
    </div>
  );
}

/**
 * How to start, with the page's one filled button. An invite in the link is carried to the
 * start flow as is; without one, the owner types the code and a plain GET form carries it
 * (it works before any script loads).
 */
function StartCard({ invite }: { invite: string | null }) {
  const button = (
    <>
      להתחיל
      <IconArrowLeft className="h-4 w-4" />
    </>
  );

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>איך מתחילים</h2>
      {invite ? (
        <>
          <p className={styles.cardText}>ההזמנה שלכם כבר בקישור. לוחצים, עונים על כמה שאלות על העסק ושומרים את החשבון.</p>
          <p className={styles.code}>
            <span>קוד ההזמנה</span>
            <bdi dir="ltr">{invite}</bdi>
          </p>
          <Link href={betaStartHref(invite)} className={styles.btn}>
            {button}
          </Link>
        </>
      ) : (
        <Form action={START_PATH} className={styles.form}>
          <p className={styles.cardText}>מקלידים את הקוד מההזמנה, עונים על כמה שאלות על העסק ושומרים את החשבון.</p>
          <label htmlFor="beta-invite" className={styles.label}>
            קוד ההזמנה
          </label>
          <input
            id="beta-invite"
            name={INVITE_PARAM}
            dir="ltr"
            maxLength={64}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className={styles.input}
          />
          <button type="submit" className={styles.btn}>
            {button}
          </button>
        </Form>
      )}
    </div>
  );
}
