import Link from "next/link";
import type { ComponentType, CSSProperties } from "react";
import { IconEyeOff, IconGlobe, IconLock, IconNoSale, IconShield, IconTrash } from "@/lib/icons";

type Tile = { icon: ComponentType<{ className?: string }>; title: string; line: string };

/**
 * "המידע של העסק שלכם": six plain promises, each one checked against the code. Every tile
 * names what backs it; /security has the precise version. Do not add a tile without a
 * line of code (or a written commitment) behind it.
 */
export const TRUST_TILES: Tile[] = [
  {
    // api/app/services/meta.py META_SCOPES: no instagram_content_publish / pages_manage_posts
    // (listed separately in services/publish.py PUBLISH_SCOPES and never requested).
    // api/app/services/ga4.py GA4_SCOPES: analytics.readonly + webmasters.readonly.
    icon: IconShield,
    title: "לא מפרסמים בשמכם",
    line: "לא ביקשנו הרשאה לפרסם, לערוך או למחוק באינסטגרם, בפייסבוק או בגוגל. אתם מפרסמים.",
  },
  {
    // Connecting goes through facebook.com / accounts.google.com (meta.authorization_url,
    // ga4.authorization_url); we receive a token, never the password.
    icon: IconEyeOff,
    title: "לא רואים את הסיסמה לאינסטגרם",
    line: "את אינסטגרם, פייסבוק וגוגל מחברים במסך שלהם. הסיסמה לא עוברת דרכנו.",
  },
  {
    // api/app/security.py: hash_password (bcrypt), encrypt_secret (Fernet), used for every
    // stored Google/Meta token (routers/integrations.py callbacks, encrypt_page_tokens).
    icon: IconLock,
    title: "סיסמאות וחיבורים מוגנים",
    line: "הסיסמה שלכם נשמרת בצורה שאי אפשר לשחזר. החיבורים לגוגל ולפייסבוק נשמרים מוצפנים.",
  },
  {
    // services/research.py + services/scraper.py: public pages through netguard, no
    // cookies or logins; Instagram only via Meta's API on the owner's own connection.
    icon: IconGlobe,
    title: "קוראים רק מה שפתוח לכולם",
    line: "אתרים קוראים רק בעמודים ציבוריים. אינסטגרם ופייסבוק רק דרך החיבור שלכם.",
  },
  {
    // A commitment. Nothing in the app collects advertising data or sends data to ad networks.
    icon: IconNoSale,
    title: "המידע לא למכירה",
    line: "לא מוכרים ולא משתפים מידע עם מפרסמים.",
  },
  {
    // DELETE /integrations/{provider} deletes the row with its tokens;
    // DELETE /auth/account (services/account_deletion.py, tests/test_account_deletion.py).
    icon: IconTrash,
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

        <ul className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:mt-10 lg:grid-cols-3">
          {TRUST_TILES.map(({ icon: Icon, title, line }, index) => (
            <li
              key={title}
              data-rv
              style={{ "--rv-i": index % 3 } as CSSProperties}
              className="lp-lift flex gap-4 rounded-lg border border-[var(--rule)] bg-[var(--paper)] p-4 sm:p-6"
            >
              <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
                <Icon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-black leading-6 text-[var(--ink)] sm:text-lg">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)] sm:text-[15px]">{line}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
