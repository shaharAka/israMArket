import Link from "next/link";
type Promise = { title: string; line: string };

/**
 * "המידע של העסק שלכם": six plain promises, each one checked against the code.
 * /security has the precise version. Do not add a promise without a
 * line of code (or a written commitment) behind it.
 */
export const TRUST_PROMISES: Promise[] = [
  {
    // api/app/services/meta.py META_SCOPES: no instagram_content_publish / pages_manage_posts
    // (listed separately in services/publish.py PUBLISH_SCOPES and never requested).
    // api/app/services/ga4.py GA4_SCOPES: analytics.readonly + webmasters.readonly.
    title: "לא מפרסמים בשמכם",
    line: "לא ביקשנו הרשאה לפרסם, לערוך או למחוק באינסטגרם, בפייסבוק או בגוגל. אתם מפרסמים.",
  },
  {
    // Connecting goes through facebook.com / accounts.google.com (meta.authorization_url,
    // ga4.authorization_url); we receive a token, never the password.
    title: "לא רואים את הסיסמה לאינסטגרם",
    line: "את אינסטגרם, פייסבוק וגוגל מחברים במסך שלהם. הסיסמה לא עוברת דרכנו.",
  },
  {
    // api/app/security.py: hash_password (bcrypt), encrypt_secret (Fernet), used for every
    // stored Google/Meta token (routers/integrations.py callbacks, encrypt_page_tokens).
    title: "סיסמאות וחיבורים מוגנים",
    line: "הסיסמה שלכם נשמרת בצורה שאי אפשר לשחזר. החיבורים לגוגל ולפייסבוק נשמרים מוצפנים.",
  },
  {
    // services/research.py + services/scraper.py: public pages through netguard, no
    // cookies or logins; Instagram only via Meta's API on the owner's own connection.
    title: "קוראים רק מה שפתוח לכולם",
    line: "אתרים קוראים רק בעמודים ציבוריים. אינסטגרם ופייסבוק רק דרך החיבור שלכם.",
  },
  {
    // A commitment. Nothing in the app collects advertising data or sends data to ad networks.
    title: "המידע לא למכירה",
    line: "לא מוכרים ולא משתפים מידע עם מפרסמים.",
  },
  {
    // DELETE /integrations/{provider} deletes the row with its tokens;
    // DELETE /auth/account (services/account_deletion.py, tests/test_account_deletion.py).
    title: "מוחקים מתי שרוצים",
    line: "ניתוק של חיבור מוחק אצלנו את הגישה. אפשר למחוק את החשבון וכל המידע בכל רגע.",
  },
];

export function Security() {
  return (
    <section id="security" aria-labelledby="security-title" className="lp-security border-t border-[var(--rule)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <header data-rv className="max-w-2xl">
            <p className="text-sm font-bold text-[var(--primary)]">אבטחה ופרטיות</p>
            <h2 id="security-title" className="mt-2 text-[1.9rem] font-black leading-[1.15] tracking-tight [text-wrap:balance] sm:text-[2.6rem]">
              המידע של העסק שלכם
            </h2>
            <p className="mt-2 text-base leading-7 text-[var(--ink-soft)]">מה אנחנו רואים, מה לא, ואיך מוחקים.</p>
          </header>
          <Link
            href="/security"
            className="inline-flex min-h-11 items-center self-start font-bold text-[var(--ink)] underline decoration-[var(--rule-dark)] underline-offset-4 hover:decoration-[var(--ink)] sm:self-auto"
          >
            כל הפרטים
          </Link>
        </div>

        <div className="lp-privacy-access mt-8 sm:mt-10">
          <section className="lp-privacy-reading" aria-labelledby="privacy-access-title">
            <h3 id="privacy-access-title" className="lp-privacy-label">הגישה למידע</h3>
            <Promises items={[TRUST_PROMISES[3], TRUST_PROMISES[1]]} />
          </section>
          <section className="lp-privacy-control" aria-labelledby="privacy-control-title">
            <h3 id="privacy-control-title" className="lp-privacy-label">השליטה נשארת אצלכם</h3>
            <Promises items={[TRUST_PROMISES[0], TRUST_PROMISES[5]]} />
          </section>
        </div>
        <div className="lp-privacy-storage">
          <Promises items={[TRUST_PROMISES[2], TRUST_PROMISES[4]]} />
        </div>
      </div>
    </section>
  );
}

function Promises({ items }: { items: Promise[] }) {
  return <ul>{items.map(item => <li key={item.title}>
    <h4>{item.title}</h4><p>{item.line}</p>
  </li>)}</ul>;
}
