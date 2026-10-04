type Promise = { title: string; line: string };

/**
 * "המידע של העסק שלכם": six plain promises, each one checked against the code.
 * /security shows them first ("בקצרה") and then the precise version. Do not add a promise without a
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
    line: "קוראים רק עמודים ציבוריים באתרים. נתונים מאינסטגרם ומפייסבוק מתקבלים רק אחרי שתחברו את החשבון.",
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
    line: "ניתוק של חיבור מוחק אצלנו את הגישה. אפשר למחוק את החשבון ואת כל המידע בכל רגע.",
  },
];
