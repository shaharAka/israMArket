import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BACKUP_NOTE, CONTACT_EMAIL, GEMINI_PAID_TIER, HOSTING_NOTE } from "@/lib/company";
import { BrandMark } from "@/lib/icons";
import { TRUST_TILES } from "@/components/landing/Security";
import "@/components/landing/landing.css";

export const metadata: Metadata = {
  title: "אבטחה ופרטיות · ישראמארקט",
  description: "מה ישראמארקט שומרת, למה, מי עוד מעבד את המידע, ואיך מוחקים הכול.",
};

/**
 * The precise version of the landing page's security tiles.
 *
 * Rule for this page: state only what the code does, name where it does it (in the
 * comments), and leave out anything not yet decided (hosting location, backup retention)
 * or not verifiable from the code (which Gemini tier the key is on — see lib/company.ts).
 * No compliance or certification claims: we describe what we do, nothing more.
 */

const LINK = "font-bold text-[var(--ink)] underline decoration-[var(--rule-dark)] underline-offset-4 hover:decoration-[var(--ink)]";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-[var(--rule)] py-8 sm:py-10">
      <h2 id={id} className="text-xl font-black tracking-tight text-[var(--ink)] sm:text-2xl">
        {title}
      </h2>
      <div className="mt-4 text-[15px] leading-7 text-[var(--ink-soft)] sm:text-base sm:leading-8">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: { title: string; body: ReactNode; code?: string }[] }) {
  return (
    <ul className="divide-y divide-[var(--rule)] overflow-hidden rounded-lg border border-[var(--rule)] bg-white">
      {rows.map((row) => (
        <li key={row.title} className="px-4 py-3.5 sm:px-5">
          <p className="font-bold text-[var(--ink)]">{row.title}</p>
          <p className="mt-0.5 text-[var(--ink-soft)]">{row.body}</p>
          {row.code ? (
            <p dir="ltr" className="mt-1 text-right font-mono text-xs text-[var(--ink-muted)]">
              {row.code}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// api/app/models.py — every table, grouped the way an owner thinks about it.
const STORED = [
  {
    title: "החשבון",
    // models.User: email, full_name, password_hash, google_sub.
    body: "אימייל, שם, והסיסמה בצורה מקודדת שאי אפשר לשחזר ממנה את הסיסמה. אם נכנסתם עם גוגל: המזהה שגוגל נותנת לחשבון, בלי סיסמה. כדי שתוכלו להיכנס.",
  },
  {
    title: "העסק",
    body: "מה שסיפרתם לנו (שם, תחום, עיר, קישורים, מתחרים, תקציב) ומה שקראנו באתר שלכם: צבעים, לוגו, טקסטים ותמונות. כדי לכתוב בסגנון שלכם.",
  },
  {
    title: "העבודה",
    body: "התוכניות, הפוסטים, העיצובים, הקהלים והמחקר השבועי. זה מה שאתם רואים באפליקציה.",
  },
  {
    title: "התמונות שלכם",
    body: "תמונות וסרטונים שהעליתם או ייבאתם מהאתר. באפליקציה רק אתם יכולים לפתוח אותם.",
  },
  {
    title: "החיבורים",
    body: "אם חיברתם את גוגל או את פייסבוק ואינסטגרם: המפתחות שהם נתנו לנו, מוצפנים, והנתונים שקיבלנו דרכם (נתוני האתר, הפוסטים שלכם באינסטגרם והמספרים שלהם, והמספרים של החשבון באינסטגרם).",
  },
  {
    // models.py WhatsappLink / WhatsappClick, services/whatsapp.py.
    title: "קישור הוואטסאפ",
    body: "מספר הוואטסאפ של העסק, ההודעה שבחרתם, וכמה לחצו על כל קישור בכל יום. פירוט בהמשך.",
  },
];

// api/app/services/ga4.py GA4_SCOPES, services/google_login.py (sign-in: openid email profile)
const GOOGLE_SCOPES = [
  { title: "להיכנס עם גוגל", body: "השם, האימייל והמזהה של החשבון. רק אם בחרתם ״להמשיך עם Google״.", code: "openid, email, profile" },
  { title: "לראות את נתוני האתר (גוגל אנליטיקס)", body: "קריאה בלבד.", code: "analytics.readonly" },
  { title: "לראות באילו חיפושים בגוגל האתר מופיע", body: "קריאה בלבד.", code: "webmasters.readonly" },
  { title: "לדעת לאיזה חשבון גוגל התחברתם", body: "האימייל של החשבון, כדי להציג לכם מה מחובר.", code: "openid, email" },
];

// api/app/services/meta.py META_SCOPES
const META_SCOPES = [
  { title: "לראות את רשימת הדפים שלכם", body: "כדי שתבחרו איזה דף לחבר.", code: "pages_show_list" },
  { title: "לקרוא את הפוסטים והנתונים בדף הפייסבוק", body: "קריאה בלבד.", code: "pages_read_engagement, pages_read_user_content" },
  { title: "לראות את הפרופיל והפוסטים באינסטגרם העסקי", body: "קריאה בלבד.", code: "instagram_basic" },
  { title: "לקרוא את המספרים באינסטגרם", body: "כמה ראו, שמרו ושיתפו כל פוסט, והמספרים של החשבון כולו: עוקבים, כמה ראו ולחיצות בפרופיל. מטא קוראת להרשאה הזו ״ניהול״, אבל היא נותנת רק נתונים.", code: "instagram_manage_insights" },
  {
    title: "למצוא דפים שמנוהלים דרך חשבון עסקי במטא",
    body: "לפי מטא, ההרשאה הזו מאפשרת גם שינויים בחשבון העסקי. אנחנו לא עושים איתה שום שינוי, רק קוראים את רשימת הדפים.",
    code: "business_management",
  },
];

export default function SecurityPage() {
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
          <p className="text-sm font-bold text-[var(--primary)]">אבטחה ופרטיות</p>
          <h1 className="mt-2 text-[2rem] font-black leading-[1.15] tracking-tight [text-wrap:balance] sm:text-[2.6rem]">
            המידע של העסק שלכם
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--ink-soft)] sm:text-lg sm:leading-8">
            מה אנחנו שומרים, למה, מי עוד רואה את זה ואיך מוחקים הכול. כתבנו כאן רק מה שהמערכת עושה בפועל.
          </p>
        </div>

        <Section id="short" title="בקצרה">
          <ul className="grid gap-3 sm:grid-cols-2">
            {TRUST_TILES.map(({ icon: Icon, title, line }) => (
              <li key={title} className="flex gap-3 rounded-lg border border-[var(--rule)] bg-white p-4">
                <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-black leading-6">{title}</p>
                  <p className="mt-0.5 text-sm leading-6 text-[var(--ink-soft)]">{line}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="stored" title="מה אנחנו שומרים ולמה">
          <Rows rows={STORED} />
          <p className="mt-4 text-[var(--ink-soft)]">
            {/* web/lib/draft.ts: the /start draft lives in localStorage until signup. */}
            לפני ההרשמה, מה שאתם כותבים בשאלות הפתיחה נשמר רק בדפדפן שלכם.
            {" "}
            {/* No analytics, ad pixel or tracking script anywhere in web/. */}
            אין באתר שלנו כלי פרסום או מעקב, כמו פיקסל של פייסבוק. יש עוגייה אחת, שזוכרת שהתחברתם, לשבוע.
          </p>
        </Section>

        <Section id="access" title="מה ההרשאות שלנו בגוגל ובמטא">
          <p className="mb-4">
            {/* meta.authorization_url / ga4.authorization_url: facebook.com and accounts.google.com. */}
            מחברים במסך של גוגל או של פייסבוק עצמם. אנחנו לא רואים את הסיסמה שלכם שם, ומקבלים רק את ההרשאות שברשימה. החיבור לא חובה.
          </p>
          <p>
            {/* services/publish.py PUBLISH_SCOPES: instagram_content_publish, pages_manage_posts — never requested. */}
            <strong>מה לא ביקשנו:</strong> הרשאה לפרסם, לערוך או למחוק פוסטים. בלי ההרשאה הזו אין לנו דרך טכנית לפרסם בשמכם. את הפוסטים אתם מפרסמים בעצמכם.
          </p>
          <details className="lp-faq group mt-5">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-bold text-[var(--ink)] underline decoration-[var(--rule-dark)] underline-offset-4 [&::-webkit-details-marker]:hidden">
              כל ההרשאות, אחת אחת
            </summary>
            <h3 className="mb-2 mt-4 text-sm font-black text-[var(--ink-muted)]">גוגל</h3>
            <Rows rows={GOOGLE_SCOPES} />
            <h3 className="mb-2 mt-6 text-sm font-black text-[var(--ink-muted)]">פייסבוק ואינסטגרם</h3>
            <Rows rows={META_SCOPES} />
          </details>
        </Section>

        <Section id="reading" title="מה אנחנו קוראים ברשת">
          <p>
            {/* services/scraper.py + services/research.py: public fetch through services/netguard.py, no cookies or logins. */}
            את האתר שלכם ואת האתרים של המתחרים אנחנו קוראים רק בעמודים שפתוחים לכל אחד. לא נכנסים לשום מקום עם סיסמה.
            {" "}
            {/* research.py "competitors": Meta Business Discovery, public like/comment counts, on the owner's connection. */}
            אינסטגרם ופייסבוק אנחנו קוראים רק דרך החיבור שלכם. את החשבונות של מתחרים שציינתם אנחנו רואים דרכו רק כמו שכל אחד רואה אותם: פוסטים ציבוריים, לייקים ותגובות.
          </p>
        </Section>

        <Section id="whatsapp" title="מה קישור הוואטסאפ שומר">
          <p>
            {/* routers/whatsapp.py redirect + services/whatsapp.record_click: one daily counter row. */}
            כשלקוח לוחץ על קישור הוואטסאפ של העסק, הוא עובר דרכנו לוואטסאפ. על הלחיצה אנחנו שומרים רק את היום, את הקישור שעליו לחץ, ואת סוג המכשיר בערך: אייפון, אנדרואיד, מחשב, או הדפדפן שבתוך אינסטגרם או פייסבוק.
          </p>
          <p className="mt-3">
            {/* No IP column, no user-agent column: tests/test_whatsapp_link.py test_no_ip_or_user_agent_is_stored. */}
            <strong>מה לא נשמר:</strong> כתובת הרשת של המכשיר (IP), פרטי הדפדפן המלאים, ומי לחץ. את ההודעה עצמה אנחנו לא רואים, והיא עוברת ישר בוואטסאפ. תצוגות מקדימות של קישורים ורובוטים לא נספרים.
          </p>
        </Section>

        <Section id="processors" title="מי עוד מעבד את המידע">
          <Rows
            rows={[
              {
                // GEMINI_API_KEY: strategy, extraction and images (README, DEPLOY.md).
                title: "גוגל (Gemini)",
                body: GEMINI_PAID_TIER
                  ? "ה-AI שכותב את התוכניות, קורא את האתר ומעצב את התמונות. אנחנו משתמשים בשירות בתשלום, ולפי התנאים של גוגל לשירות הזה, גוגל לא משתמשת במה שנשלח אליה כדי לשפר את המוצרים שלה. היא שומרת אותו לזמן מוגבל, רק כדי לאתר שימוש לרעה."
                  : "ה-AI שכותב את התוכניות והפוסטים ומעצב את התמונות. נשלח אליו מידע על העסק שצריך לעבודה, לא סיסמאות ולא מפתחות חיבור.",
              },
              {
                // services/meta_model.py: off unless POST_MODEL=muse-spark; refuses any `-contributor`
                // model. https://dev.meta.ai/models/muse-spark/ — standard tier "Not used to improve
                // our products"; contributor tier "Used to improve our products".
                title: "מטא (Muse Spark)",
                body: "המודל שכותב את הפוסטים. אם הוא לא זמין, גוגל כותבת במקומו. אנחנו משתמשים רק בגרסה שלפי מטא לא משמשת לשיפור המוצרים שלה. המערכת שלנו מסרבת לעבוד עם הגרסה האחרת.",
              },
              {
                // routers/billing.py: the browser's PayPal buttons talk to PayPal directly; the API
                // stores the subscription id, its status and each payment's amount and date.
                title: "פייפאל",
                body: "התשלום על המנוי. את פרטי הכרטיס או חשבון הפייפאל מקלידים אצל פייפאל, והם לא מגיעים אלינו. אצלנו נשמרים רק מספר המנוי, המצב שלו, והסכום והתאריך של כל תשלום.",
              },
              {
                title: "גוגל, פייסבוק ואינסטגרם",
                body: "רק אם חיברתם אותם. מהם מגיעים הנתונים, והם רואים שהחיבור פעיל.",
              },
              {
                // services/keywords.py: Google autocomplete (hl=he, gl=il) for search phrases.
                title: "החיפוש של גוגל",
                body: "במחקר השבועי אנחנו בודקים מה אנשים מחפשים בגוגל, למשל ״מאפייה ביפו״. נשלחות רק מילות החיפוש.",
              },
              {
                // routers/integrations.py create_webhook: only URLs the owner added.
                title: "שירותים שאתם חיברתם",
                body: "אם הגדרתם העברה אוטומטית לשירות אחר, נשלח אליו רק מה שבחרתם.",
              },
            ]}
          />
          <p className="mt-4">לא מוכרים ולא משתפים מידע עם מפרסמים.</p>
        </Section>

        <Section id="retention" title="כמה זמן שומרים">
          <p>
            כל עוד החשבון קיים. כשמוחקים את החשבון, המידע נמחק מהמערכת מיד.
            {BACKUP_NOTE ? ` ${BACKUP_NOTE}` : null}
            {HOSTING_NOTE ? ` ${HOSTING_NOTE}` : null}
          </p>
        </Section>

        <Section id="delete" title="איך מוחקים">
          <Rows
            rows={[
              {
                // DELETE /integrations/{provider}: deletes the Integration row with its tokens.
                title: "לנתק חיבור",
                body: (
                  <>
                    בעמוד{" "}
                    <Link href="/integrations" className={LINK}>
                      החיבורים
                    </Link>
                    . הניתוק מוחק אצלנו את המפתחות. ההרשאה עדיין תופיע בהגדרות של גוגל או של פייסבוק, ואפשר להסיר אותה גם שם.
                  </>
                ),
              },
              {
                // DELETE /auth/account: services/account_deletion.py, tests/test_account_deletion.py.
                title: "למחוק את החשבון",
                body: (
                  <>
                    בעמוד{" "}
                    <Link href="/account" className={LINK}>
                      החשבון
                    </Link>
                    . נמחקים החשבון, העסק, התוכניות, הפוסטים, העיצובים, התמונות, החיבורים, קישורי הוואטסאפ, הנתונים והמחקר. אי אפשר לבטל את זה.
                  </>
                ),
              },
            ]}
          />
        </Section>

        <Section id="claims" title="מה אנחנו לא טוענים">
          <p>אין לנו כרגע הסמכה או תקן אבטחה חיצוני. לא כתבנו שאנחנו עומדים בחוק או בתקן מסוים, רק מה שאנחנו עושים.</p>
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
