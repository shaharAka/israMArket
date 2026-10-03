/**
 * "How do I find this?" — the content of every help guide.
 *
 * The reader is a small-business owner, usually on the phone, who has never opened Google
 * Analytics and does not know what a "professional account" is. So every guide opens with
 * the answer in one sentence, says how long it takes, and only then gives steps.
 *
 * Accuracy rules (these are instructions for someone else's app, and a wrong menu name is
 * worse than no guide):
 * - Every step was checked against the platform's own help page. The sources and the date
 *   are in the comment above each guide. Re-check them when a platform redesigns.
 * - Menus that differ by device or version say so, instead of guessing one path.
 * - Menu names are given in Hebrew with the English label in parentheses where the app is
 *   often in English for Israeli users (`הגדרות (Settings)`), or in English alone where we
 *   could not confirm the Hebrew label. `**…**` marks what to look for on screen.
 * - Copy follows `web/HEBREW-COPY.md`: plural address, imperative for instructions.
 *
 * The "stuck?" messages carry no personal data and no phone number. Where the other side
 * needs the owner's Gmail, the message ends with a blank line for the owner to fill in.
 */

export type HelpTopic =
  | "google_analytics"
  | "instagram_business"
  | "facebook_data"
  | "tiktok_data"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "website"
  | "competitor_instagram"
  | "google_business_profile"
  | "whatsapp_business";

export type Device = "phone" | "computer";

export type GuideBlock = {
  title: string;
  /** Troubleshooting stays one tap away instead of competing with the main steps. */
  disclosure?: boolean;
  text?: string;
  /** Steps that are the same everywhere. */
  steps?: string[];
  /** Steps that differ by device. When a block has these, the sheet shows the toggle. */
  phone?: string[];
  computer?: string[];
  /** Per-platform notes (Wix / Shopify / WordPress, iPhone / Android). */
  cases?: { label: string; text: string }[];
  note?: string;
};

export type Guide = {
  topic: HelpTopic;
  /** The sheet title, and the row in /help. Phrased as the owner's question. */
  title: string;
  /** The answer in one sentence, shown first. */
  short: string;
  /** Honest estimate for someone doing it for the first time. */
  minutes: number;
  blocks: GuideBlock[];
  stuck: { title: string; message: string; copiedNote: string };
  /** One line: "למה אנחנו צריכים את זה". */
  why: string;
  /** The official page, for whoever wants the long version. */
  source: { label: string; url: string };
};

const TO_SITE_BUILDER = "תקועים? שלחו את זה למי שבנה לכם את האתר";
const TO_SOCIAL_MANAGER = "תקועים? שלחו את זה למי שמנהל לכם את הרשתות";
const COPIED = "ההודעה הועתקה. אפשר להדביק אותה בוואטסאפ";

/*
 * google_analytics — checked 2026-09 against:
 *   Find accounts/properties you can see (top-left picker): https://support.google.com/analytics/answer/10253796
 *   The tag's ID sits in the page's code (gtag('config', 'G-…')), so "View page source" + find
 *   "G-" shows it:                                           https://developers.google.com/analytics/devguides/collection/ga4/troubleshoot
 *                                                            https://support.google.com/analytics/answer/12270356
 *   (Confirmed on the owner's own Wix site, where Marketing Integrations puts the G- ID in the source.)
 *   Tag Assistant, is a Google tag on the site:              https://support.google.com/analytics/answer/15756111
 *                                                            https://support.google.com/tagassistant/answer/10039345
 *   Measurement ID starts with "G-":                         https://support.google.com/analytics/answer/9539598
 *   Add users (Admin › Property access management › + › Add users): https://support.google.com/analytics/answer/9305788
 *   Roles, Viewer "can see settings and data":               https://support.google.com/analytics/answer/9305587
 *   Create an account (Start measuring › property › Web stream): https://support.google.com/analytics/answer/9304153
 *   Wix, Marketing Integrations › Google Tag, Premium + domain: https://support.wix.com/en/article/tracking-events-on-your-wix-site-with-a-google-analytics-property
 *                                                            https://support.wix.com/en/article/google-analytics-faqs
 *   Shopify, Sales channels › Google & YouTube, "Disconnect" when connected:
 *                                                            https://help.shopify.com/en/manual/online-sales-channels/google/getting-setup/connect
 *   WordPress, Site Kit by Google:                           https://sitekit.withgoogle.com/documentation/supported-services/analytics/
 *   WordPress.com, Jetpack › Traffic, Premium plan and up:   https://wordpress.com/support/google-analytics/
 *   Switching Google accounts (profile picture, top corner): https://support.google.com/accounts/answer/1721977
 * Our side (api/app/services/ga4.py): Google sign-in asking for read-only Analytics access,
 * then `accountSummaries` lists every property that account can see; an empty list is
 * "לא מצאנו אתרים בגוגל אנליטיקס בחשבון שחיברתם". Viewer is the lowest role that can read
 * reports; Google's API docs imply it rather than state it.
 * Not verified: whether the Analytics phone app can manage users (we send people to the
 * website on a computer for that), and how Wix shows an already-connected tag.
 */
const googleAnalytics: Guide = {
  topic: "google_analytics",
  title: "איך מוצאים את נתוני האתר בגוגל",
  short:
    "לוחצים אצלנו ״לחבר את נתוני האתר״ ונכנסים עם חשבון הגוגל שיש לו גישה לגוגל אנליטיקס (Google Analytics) של האתר.",
  minutes: 3,
  blocks: [
    {
      title: "יש לכם גישה לגוגל אנליטיקס?",
      phone: [
        "פתחו בדפדפן את analytics.google.com, או את אפליקציית Google Analytics, והיכנסו עם הג׳ימייל שלכם.",
        "רואים את שם האתר? יש לחשבון הזה גישה, ואפשר לחבר.",
        "לא רואים אתר? לחשבון הזה אין גישה. ייתכן שהנתונים בחשבון גוגל אחר, או אצל מי שבנה את האתר.",
      ],
      computer: [
        "היכנסו ל-analytics.google.com עם הג׳ימייל שלכם.",
        "רואים את שם האתר בתפריט שבפינה העליונה? יש לחשבון הזה גישה, ואפשר לחבר.",
        "מופיע רק כפתור **Start measuring**? לחשבון הזה אין גישה. ייתכן שהנתונים בחשבון גוגל אחר, או אצל מי שבנה את האתר.",
      ],
    },
    {
      title: "לבדוק אם באתר שלכם כבר מותקן גוגל אנליטיקס",
      text: "את זה בודקים מהמחשב, באתר עצמו:",
      steps: [
        "פתחו את האתר שלכם בכרום.",
        "לחצו בעכבר ימני על מקום ריק בעמוד ובחרו את האפשרות להצגת קוד המקור (**View page source**). הכי פשוט: Ctrl+U, ובמק Cmd+Option+U.",
        "בעמוד שנפתח, חפשו את התווים G- (בעזרת Ctrl+F, ובמק Cmd+F).",
        "מצאתם מזהה כמו G-AB12CD34EF? יש לאתר גוגל אנליטיקס. נשאר רק למצוא איזה חשבון גוגל רואה אותו.",
      ],
      note: "דרך נוספת: הכניסו את כתובת האתר ב-tagassistant.google.com. מופיע תג שמתחיל ב-G-? יש לאתר גוגל אנליטיקס.",
    },
    {
      title: "איפה זה נמצא באתר שלכם",
      cases: [
        {
          label: "ויקס (Wix)",
          text: "בלוח הבקרה של האתר: **Marketing Integrations** › **Google Tag**. שם מחברים (**Connect** › **Add Google Tag ID**) ומדביקים את המזהה שמתחיל ב-G-. אם מישהו כבר חיבר, המזהה יופיע בקוד של האתר (ראו למעלה). בוויקס זה אפשרי רק באתר בתשלום (Premium) עם דומיין משלכם.",
        },
        {
          label: "שופיפיי (Shopify)",
          text: "בניהול החנות: **Sales channels** › **Google & YouTube**. מופיע **Disconnect** ליד שם הנכס? החנות כבר מחוברת.",
        },
        {
          label: "וורדפרס (WordPress)",
          text: "עם התוסף **Site Kit by Google**: **Site Kit** › **Settings**. באתר של WordPress.com: **Jetpack** › **Traffic** (רק בחבילת Premium ומעלה).",
        },
        {
          label: "מישהו בנה לכם את האתר",
          text: "הכי פשוט לשאול אותו. ההודעה המוכנה למטה מבקשת בדיוק את מה שצריך.",
        },
      ],
    },
    {
      title: "עם איזה חשבון גוגל להיכנס",
      text: "עם החשבון שרואה את האתר ב-analytics.google.com. לא בטוחים איזה?",
      phone: [
        "ב-analytics.google.com או באפליקציה, לחצו על התמונה או האות בפינה העליונה. שם רואים באיזה חשבון אתם.",
        "יש לכם כמה חשבונות גוגל? עברו ביניהם באותו מקום, עד שתראו את שם האתר.",
      ],
      computer: [
        "ב-analytics.google.com לחצו על התמונה או האות בפינה העליונה. שם רואים באיזה חשבון אתם.",
        "יש לכם כמה חשבונות גוגל? עברו ביניהם באותו מקום, עד שתראו את שם האתר.",
      ],
      note: "את החשבון הזה בחרו בחלון של גוגל, אחרי שתלחצו אצלנו ״לחבר את נתוני האתר״.",
    },
    {
      title: "מה קורה כשלוחצים אצלנו ״לחבר״",
      steps: [
        "בעמוד החיבורים לוחצים **לחבר את נתוני האתר**.",
        "נפתח חלון של גוגל. בוחרים את החשבון שרואה את האתר ומאשרים. אנחנו רק קוראים נתונים, ולא מקבלים סיסמה.",
        "חוזרים אלינו ובוחרים את האתר מהרשימה. בגוגל הוא נקרא ״נכס״ (Property).",
      ],
      note: "הופיע ״לא מצאנו אתרים בגוגל אנליטיקס בחשבון שחיברתם״? נכנסתם עם חשבון שאין לו גישה. נסו חשבון אחר, או בקשו גישה ממי שבנה את האתר.",
    },
    {
      title: "מישהו אחר בנה לכם את האתר?",
      text: "בקשו ממנו להוסיף את הג׳ימייל שלכם כמשתמש בגוגל אנליטיקס של האתר. מספיקה הרשאת צפייה (**Viewer**). אצלו זה במחשב: **Admin** › **Property access management** › **+** › **Add users**.",
    },
    {
      title: "אין לאתר גוגל אנליטיקס?",
      text: "אפשר לפתוח בחינם. עדיף מהמחשב:",
      steps: [
        "היכנסו ל-analytics.google.com ולחצו **Start measuring**.",
        "תנו שם לחשבון ולנכס (שם העסק מספיק), ובחרו ישראל ושקל.",
        "בחרו **Web**, הכניסו את כתובת האתר, ותקבלו מזהה שמתחיל ב-G-.",
        "הדביקו את המזהה בהגדרות האתר (בוויקס, בשופיפיי או בוורדפרס, כמו למעלה), או שלחו אותו למי שבנה את האתר.",
        "הנתונים מתחילים להגיע תוך חצי שעה בערך. אז חזרו לכאן וחברו.",
      ],
      note: "אין לעסק אתר? אפשר לדלג, ולחבר רק את אינסטגרם.",
    },
  ],
  stuck: {
    title: TO_SITE_BUILDER,
    message: [
      "היי, אנחנו מחברים את נתוני האתר לאפליקציית השיווק שלנו.",
      "אפשר בבקשה להוסיף את הג׳ימייל שלמטה כמשתמש בגוגל אנליטיקס של האתר (נכס GA4), עם הרשאת Viewer?",
      "זה ב-Google Analytics: Admin › Property access management › + › Add users.",
      "ואם עוד אין לאתר גוגל אנליטיקס, אפשר להתקין?",
      "הג׳ימייל: ",
      "תודה!",
    ].join("\n"),
    copiedNote: COPIED,
  },
  why: "כך נדע כמה אנשים הגיעו לאתר מכל פוסט ומה עשו שם, ונבנה את החודש הבא לפי מה שבאמת הביא לקוחות.",
  source: { label: "ההסבר של גוגל: הוספת משתמשים", url: "https://support.google.com/analytics/answer/9305788" },
};

/*
 * instagram_business — requirements rechecked 2026-10-04 in Meta's get-started and
 * Insights documentation, plus our current read-only integration. Menu-path references
 * below were checked 2026-09; labels may differ by app version.
 *   Switch to a professional account (app: Profile › More/☰ › Settings and activity › For
 *   professionals › Account type and tools › Switch to professional account; computer:
 *   More › Settings › same):                                  https://help.instagram.com/502981923235522
 *   Free:                                                     https://www.facebook.com/business/learn/lessons/setting-up-instagram-business-account
 *   Our API needs Business or Creator linked to a Page:       https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started
 *                                                             https://developers.facebook.com/documentation/instagram-platform/overview
 *   Link from Instagram (Edit profile › Page › Connect or create), full control needed:
 *                                                             https://www.facebook.com/business/help/898752960195806
 *   Link from the Page (Settings & privacy › Settings › Linked accounts › Instagram ›
 *   Connect account):                                         https://www.facebook.com/help/1148909221857370
 *   Page access types (Facebook access, full control):        https://www.facebook.com/help/289207354498410
 *   Re-grant: Settings › Business Integrations › View and Edit / Remove:
 *                                                             https://www.facebook.com/help/405094243235242
 *   /me/accounts lists Pages the person can perform tasks on: https://developers.facebook.com/docs/graph-api/reference/user/accounts/
 *   Only assets picked in the login dialog are shared:        https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business
 * Our side (api/app/services/meta.py): Facebook sign-in, then `/me/accounts` with each Page's
 * `instagram_business_account`; an empty list is "לא מצאנו דפי פייסבוק בחשבון שחיברתם".
 * Not verified: the exact wording of Facebook's page picker inside the sign-in window, and
 * the Hebrew labels in the apps (the guide gives the English label next to a Hebrew gloss).
 */
const instagramBusiness: Guide = {
  topic: "instagram_business",
  title: "איך מחברים את נתוני האינסטגרם",
  short: "במסלול שלנו מתחברים דרך פייסבוק. צריך אינסטגרם מקצועי שמקושר לדף של העסק.",
  minutes: 5,
  blocks: [
    {
      title: "כשהחשבונות כבר מוכנים",
      steps: [
        "בחיבורים, לחצו **לחבר את פייסבוק ואינסטגרם**. היכנסו עם חשבון הפייסבוק האישי שמנהל את דף העסק.",
        "בחלון של פייסבוק, בחרו את הדף ואת האינסטגרם של העסק ואשרו את הגישה.",
        "חזרו אלינו ובחרו את הדף. נבדוק אם הגיעו נתונים, ומשם נציע מה לשפר בתוכנית ובפוסטים.",
      ],
      note: "אישור הגישה לא מפרסם פוסטים. קישור לפרופיל לבדו לא נותן גישה לנתונים.",
    },
    {
      title: "האינסטגרם אישי או פרטי?",
      disclosure: true,
      text: "צריך חשבון מקצועי: עסק (Business) או יוצר תוכן (Creator). שניהם מתאימים.",
      steps: [
        "באינסטגרם, פתחו את הפרופיל ואת התפריט. חפשו **סוג חשבון וכלים** (Account type and tools), ואז **מעבר לחשבון מקצועי** (Switch to professional account).",
        "בחרו עסק או יוצר תוכן. אם מוצע לחבר דף פייסבוק, בחרו את הדף של העסק.",
      ],
      note: "המעבר בחינם, אבל החשבון יהפוך לציבורי. השמות בתפריט משתנים בין גרסאות. רוצים לשמור עליו פרטי? אפשר להמשיך בתוכנית בלי החיבור.",
    },
    {
      title: "הדף מופיע בלי אינסטגרם?",
      disclosure: true,
      steps: [
        "בפייסבוק עברו לפרופיל של הדף. בהגדרות, פתחו **חשבונות מקושרים** (Linked accounts) › **Instagram** וחברו את חשבון העסק.",
        "חזרו לחיבורים ופתחו **ניהול החיבור** כדי לטעון שוב את הדפים. אם עדיין לא חיברתם, התחילו בחיבור רגיל.",
      ],
      note: "מי שמנהל את הדף יכול לעזור בקישור החשבונות. אין לכם דף? אפשר ליצור דף עסקי בפייסבוק ולחבר אותו, או להמשיך בתוכנית בינתיים.",
    },
    {
      title: "לא מצאתם את הדף או שאין נתונים?",
      disclosure: true,
      cases: [
        { label: "הדף חסר", text: "נסו את חשבון הפייסבוק שמנהל אותו. ודאו שבחרתם את הדף בחלון האישור. אם הוא עדיין חסר, בקשו ממנהל הדף לבדוק את הגישה שלכם." },
        { label: "הדף נמצא, אבל נתוני האינסטגרם חסרים", text: "בדקו שהאינסטגרם מקצועי ומקושר לדף הנכון. ודאו שאישרתם גם את הגישה לאינסטגרם בחלון החיבור." },
        { label: "הכול מחובר, אבל מספרים מסוימים חסרים", text: "פייסבוק לא מחזירה כל נתון לכל חשבון או פוסט. נסמן מה לא נמדד. נתון חסר אינו אפס." },
        { label: "החיבור עדיין לא זמין", text: "אם אנחנו מציגים שהחיבור עדיין לא זמין, אין צורך לשנות חשבון או הרשאות. אפשר להמשיך בתוכנית ולחבר כשיהיה זמין." },
      ],
    },
  ],
  stuck: {
    title: TO_SOCIAL_MANAGER,
    message: [
      "היי, אנחנו רוצים לחבר את נתוני האינסטגרם של העסק לישראמארקט.",
      "אפשר לבדוק שהחשבון מקצועי (Business או Creator), מקושר לדף הפייסבוק הנכון, ושיש לחשבון הפייסבוק שלי גישה לקריאת נתוני הדף והאינסטגרם?",
      "אין צורך לשלוח סיסמה. תודה!",
    ].join("\n"),
    copiedNote: COPIED,
  },
  why: "נקרא את הנתונים הזמינים על הפוסטים, למשל אנשים שראו, שמירות ותגובות. הם יעזרו לדייק את התוכנית; הם לא מוכיחים כמה לקוחות קנו.",
  source: { label: "ההסבר של אינסטגרם: חשבון מקצועי", url: "https://help.instagram.com/502981923235522" },
};

/*
 * facebook_data — checked 2026-10-04 against Meta's official Facebook Login get-started
 * guide and Insights guide, and api/app/services/meta.py. Our current ingestion reads
 * linked Instagram media/account metrics plus Page name/fan_count; it does not ingest
 * Facebook post insights. Do not promise those reports or require full-control access
 * merely to read data. Additional Page/account access can be needed to link accounts.
 * https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/get-started
 * https://developers.facebook.com/documentation/instagram-platform/insights
 */
const facebookData: Guide = {
  topic: "facebook_data",
  title: "איך מחברים את דף הפייסבוק",
  short: "מתחברים עם החשבון שמנהל את דף העסק. כרגע הניתוח אצלנו מתמקד באינסטגרם המקושר; עדיין אין דוח על פוסטים בפייסבוק.",
  minutes: 3,
  blocks: [
    {
      title: "לחבר את הדף הנכון",
      steps: [
        "בחיבורים, לחצו **לחבר את פייסבוק ואינסטגרם** והיכנסו לפייסבוק עם החשבון שמנהל את הדף.",
        "בחלון האישור, בחרו את דף העסק. אם מקושר אליו אינסטגרם, בחרו גם אותו.",
        "חזרו אלינו ובחרו את הדף מהרשימה. נציג בנפרד אם הגיעו נתונים שאפשר להשתמש בהם.",
      ],
      note: "קישור לדף לבדו לא נותן גישה לנתונים. החיבור לא מוסר לנו את הסיסמה שלכם ולא מפרסם פוסט.",
    },
    {
      title: "מה אפשר למדוד כרגע?",
      disclosure: true,
      text: "החיבור מציג פרטים בסיסיים על דף הפייסבוק ואת נתוני האינסטגרם המקצועי שמקושר אליו. עדיין אין אצלנו דוח על ביצועי הפוסטים בפייסבוק. בלי אינסטגרם מקושר, החיבור לבדו לא מספיק לניתוח הפוסטים.",
      note: "פוסטים בפרופיל פייסבוק אישי ופעילות בקבוצות אינם חלק מהחיבור הזה.",
    },
    {
      title: "הדף לא מופיע?",
      disclosure: true,
      cases: [
        { label: "נכנסתם עם חשבון אחר", text: "חברו שוב עם החשבון שמנהל את דף העסק." },
        { label: "לא בחרתם את הדף בחלון האישור", text: "פתחו את הגדרות פייסבוק › **Business integrations**, מצאו את ישראמארקט ובדקו שהדף כלול בגישה שאישרתם. אחר כך חברו שוב אצלנו." },
        { label: "מישהו אחר מנהל את הדף", text: "בקשו ממנו לבדוק שיש לחשבון שלכם גישה לקריאת נתוני הדף והאינסטגרם המקושר. לא צריך לשלוח לנו סיסמה." },
        { label: "יש לכם רק פרופיל אישי או קבוצה", text: "צריך דף עסקי בפייסבוק. אפשר ליצור דף, או להמשיך בתוכנית בלי החיבור הזה." },
      ],
    },
  ],
  stuck: {
    title: TO_SOCIAL_MANAGER,
    message: "היי, אנחנו מחברים את דף העסק לישראמארקט. אפשר לבדוק שלחשבון הפייסבוק שלי יש גישה לקריאת נתוני הדף והאינסטגרם המקושר, ולוודא מה הדף הנכון? אין צורך לשלוח סיסמה. תודה!",
    copiedNote: COPIED,
  },
  why: "בחירת הדף מאפשרת לקרוא נתונים מהאינסטגרם המקושר. נשתמש רק במה שהחיבור מחזיר בפועל.",
  source: { label: "ההסבר של פייסבוק: סוגי גישה לדף", url: "https://www.facebook.com/help/289207354498410" },
};

/*
 * instagram — checked 2026-09 against:
 *   Profile address is instagram.com/[username]: https://help.instagram.com/513918941996087
 *   Share profile › Copy link ("isn't available to everyone"): https://help.instagram.com/550964264146477
 *                                                              https://help.instagram.com/925529167647849
 * Not verified: an official line that the username sits at the top of the profile.
 */
const instagram: Guide = {
  topic: "instagram",
  title: "איך מוצאים את הקישור לאינסטגרם",
  short: "הקישור הוא instagram.com/ ואחריו שם המשתמש שלכם, שמופיע בראש הפרופיל.",
  minutes: 1,
  blocks: [
    {
      title: "למצוא ולהעתיק",
      phone: [
        "פתחו את אינסטגרם ולחצו על תמונת הפרופיל בתחתית המסך.",
        "שם המשתמש מופיע בראש הפרופיל.",
        "כדי להעתיק קישור: לחצו **שיתוף פרופיל** (Share profile) מתחת לתיאור, ואז **העתקת קישור** (Copy link).",
      ],
      computer: [
        "היכנסו ל-instagram.com ולחצו **פרופיל** (Profile) בתפריט.",
        "העתיקו את הכתובת משורת הכתובת. היא נראית כך: instagram.com/name.",
      ],
      note: "״שיתוף פרופיל״ לא מופיע אצל כולם. אם אין, מספיק שם המשתמש.",
    },
  ],
  stuck: {
    title: TO_SOCIAL_MANAGER,
    message: "היי, אפשר לשלוח לי את הקישור לאינסטגרם של העסק? צריך אותו לאפליקציית השיווק. תודה!",
    copiedNote: COPIED,
  },
  why: "כך נדע איפה אתם כבר נמצאים, ונתכנן פוסטים לשם.",
  source: { label: "ההסבר של אינסטגרם: שיתוף פרופיל", url: "https://help.instagram.com/550964264146477" },
};

/*
 * facebook — checked 2026-09 against:
 *   Find a Page's address (computer: address bar; phone: m.facebook.com in the browser,
 *   long-press the address bar › Copy): https://www.facebook.com/help/2053403608222571
 * Not verified: an in-app "..." › "Copy link" path on the Page, so it is mentioned only as
 * something that may exist.
 */
const facebook: Guide = {
  topic: "facebook",
  title: "איך מוצאים את הקישור לדף בפייסבוק",
  short: "פותחים את הדף של העסק בפייסבוק ומעתיקים את הכתובת שלו, שנראית כמו facebook.com/name.",
  minutes: 1,
  blocks: [
    {
      title: "למצוא ולהעתיק",
      phone: [
        "בדפדפן של הטלפון, היכנסו ל-m.facebook.com וחפשו את שם הדף.",
        "פתחו את הדף, לחצו לחיצה ארוכה על שורת הכתובת ובחרו **העתקה** (Copy).",
      ],
      computer: ["בפייסבוק, חפשו את שם הדף ולחצו עליו.", "העתיקו את הכתובת משורת הכתובת למעלה."],
      note: "באפליקציית פייסבוק יש לפעמים ⋯ › **Copy link** בדף עצמו, אבל זה משתנה בין גרסאות.",
    },
  ],
  stuck: {
    title: TO_SOCIAL_MANAGER,
    message: "היי, אפשר לשלוח לי את הקישור לדף הפייסבוק של העסק? צריך אותו לאפליקציית השיווק. תודה!",
    copiedNote: COPIED,
  },
  why: "כך נדע איפה אתם כבר נמצאים, ונתכנן פוסטים לשם.",
  source: { label: "ההסבר של פייסבוק: הכתובת של דף", url: "https://www.facebook.com/help/2053403608222571" },
};

/*
 * competitor_instagram — checked 2026-09 against:
 *   Search › Accounts:                           https://help.instagram.com/1482378711987121
 *   A profile's share icon › Copy link:          https://help.instagram.com/550964264146477
 *   Profile address is instagram.com/[username]: https://help.instagram.com/513918941996087
 * Our side: HandlesEditor accepts "@name" and a pasted profile link; Business Discovery
 * reads only public Business/Creator accounts (api/app/services/instagram_signal.py).
 */
const competitorInstagram: Guide = {
  topic: "competitor_instagram",
  title: "איך מוצאים שם משתמש של עסק אחר",
  short: "מחפשים את העסק באינסטגרם, פותחים את הפרופיל שלו ומעתיקים את שם המשתמש שבראש הפרופיל, או את הקישור.",
  minutes: 1,
  blocks: [
    {
      title: "למצוא ולהעתיק",
      phone: [
        "באינסטגרם, לחצו **חיפוש** (Search) בתחתית המסך וכתבו את שם העסק.",
        "בחרו **חשבונות** (Accounts) כדי לראות רק פרופילים, ופתחו את הנכון.",
        "שם המשתמש מופיע בראש הפרופיל. לקישור: סמל השיתוף למעלה › **העתקת קישור** (Copy link).",
      ],
      computer: [
        "ב-instagram.com לחצו **חיפוש** (Search) וכתבו את שם העסק.",
        "פתחו את הפרופיל והעתיקו את הכתובת משורת הכתובת: instagram.com/name.",
      ],
      note: "אצלנו אפשר להדביק את השם עם @, או את הקישור כולו.",
    },
    {
      title: "מאילו חשבונות כדאי ללמוד",
      text: "עסקים בתחום שלכם או באזור שלכם, שהפוסטים שלהם אהובים. אפשר ללמוד רק מחשבונות מקצועיים (עסק או יוצר תוכן) שפתוחים לכולם. חשבון פרטי או אישי יסומן אצלנו ״לא מצאנו״.",
    },
  ],
  stuck: {
    title: TO_SOCIAL_MANAGER,
    message: "היי, אפשר לשלוח לי קישורים לאינסטגרם של 3 עד 5 עסקים בתחום שלנו שכדאי ללמוד מהם? תודה!",
    copiedNote: COPIED,
  },
  why: "מהפוסטים שהצליחו להם נלמד מה מצליח בתחום שלכם, ונכתוב לכם פוסטים טובים יותר.",
  source: { label: "ההסבר של אינסטגרם: חיפוש", url: "https://help.instagram.com/1482378711987121" },
};

/*
 * website — checked 2026-09 against:
 *   Wix site address, Website Settings › "Wix site address (URL)": https://support.wix.com/en/article/managing-your-website-settings
 *   Wix free address format (name.wixsite.com/site):          https://support.wix.com/en/article/about-domains
 *   Shopify, Settings › Domains, "*.myshopify.com":            https://help.shopify.com/en/manual/domains
 *   WordPress.com, Domains, "Primary site address":            https://wordpress.com/support/domains/set-a-primary-address/
 * Our side: the scanner adds https:// itself (api/app/services/scraper.py `_normalize_url`).
 * Not verified: the exact Wix menu path to Website Settings, which moves between dashboard
 * versions, so the guide names the page rather than the path.
 */
const website: Guide = {
  topic: "website",
  title: "איפה רואים את כתובת האתר",
  short: "הכתובת היא מה שכתוב בשורת הכתובת של הדפדפן כשהאתר פתוח, למשל myshop.co.il.",
  minutes: 1,
  blocks: [
    {
      title: "הדרך הכי פשוטה",
      phone: [
        "חפשו בגוגל את שם העסק ופתחו את האתר.",
        "לחצו על שורת הכתובת. באייפון היא לפעמים בתחתית המסך.",
        "העתיקו את הכתובת והדביקו אותה אצלנו. לא צריך להוסיף https.",
      ],
      computer: [
        "חפשו בגוגל את שם העסק ופתחו את האתר.",
        "לחצו פעם אחת על שורת הכתובת למעלה, והעתיקו (Ctrl+C, או Cmd+C במק).",
        "הדביקו את הכתובת אצלנו. לא צריך להוסיף https.",
      ],
    },
    {
      title: "האתר בנוי בוויקס, בשופיפיי או בוורדפרס?",
      cases: [
        {
          label: "ויקס (Wix)",
          text: "בלוח הבקרה, בעמוד **Website Settings**, בשדה **Wix site address (URL)**. בלי דומיין משלכם הכתובת נראית כמו name.wixsite.com/site.",
        },
        {
          label: "שופיפיי (Shopify)",
          text: "בניהול החנות: **Settings** › **Domains**. כל חנות מתחילה בכתובת name.myshopify.com, והדומיין הראשי מופיע שם.",
        },
        {
          label: "וורדפרס (WordPress.com)",
          text: "בלוח הבקרה, תחת **Domains**. הכתובת הראשית מסומנת **Primary site address**.",
        },
      ],
      note: "אין לעסק אתר? זה בסדר. השאירו את השדה ריק, ונעבוד מהאינסטגרם ומהפייסבוק.",
    },
  ],
  stuck: {
    title: TO_SITE_BUILDER,
    message: "היי, מה הכתובת המדויקת של האתר שלנו? צריך אותה לאפליקציית השיווק. תודה!",
    copiedNote: COPIED,
  },
  why: "מהאתר אנחנו לומדים את הצבעים, הלוגו והסגנון, כדי שהפוסטים ייראו כמו העסק שלכם.",
  source: { label: "ההסבר של שופיפיי: הדומיין של החנות", url: "https://help.shopify.com/en/manual/domains" },
};

/*
 * tiktok — checked 2026-09 against:
 *   Share profile / My QR code:          https://support.tiktok.com/en/using-tiktok/exploring-videos/sharing
 *   Username "makes up your profile link": https://support.tiktok.com/en/getting-started/setting-up-your-profile/changing-your-username
 * Not verified: the exact "Copy link" label inside the share sheet, and a TikTok help page
 * for the computer steps (the tiktok.com/@name format follows from the username article).
 */
const tiktok: Guide = {
  topic: "tiktok",
  title: "איך מוצאים את הקישור לטיקטוק",
  short: "הקישור הוא tiktok.com/@ ואחריו שם המשתמש שלכם, ושם המשתמש מופיע בפרופיל.",
  minutes: 1,
  blocks: [
    {
      title: "למצוא ולהעתיק",
      phone: [
        "פתחו את טיקטוק ולחצו **פרופיל** (Profile) בתחתית המסך.",
        "שם המשתמש מופיע מתחת לתמונה, עם @ בהתחלה.",
        "כדי לשלוח קישור: לחצו **שיתוף הפרופיל** (Share profile) ובחרו להעתיק את הקישור. השם המדויק של הכפתור משתנה בין גרסאות.",
      ],
      computer: [
        "היכנסו ל-tiktok.com ולחצו **פרופיל** (Profile) בתפריט.",
        "העתיקו את הכתובת משורת הכתובת. היא נראית כך: tiktok.com/@name.",
      ],
    },
  ],
  stuck: {
    title: TO_SOCIAL_MANAGER,
    message: "היי, אפשר לשלוח לי את הקישור לטיקטוק של העסק? צריך אותו לאפליקציית השיווק. תודה!",
    copiedNote: COPIED,
  },
  why: "כך נדע איפה אתם כבר נמצאים, ונתכנן פוסטים גם לשם.",
  source: { label: "ההסבר של טיקטוק: שיתוף פרופיל", url: "https://support.tiktok.com/en/using-tiktok/exploring-videos/sharing" },
};

/*
 * tiktok_data — checked 2026-10-04 against TikTok's official tools/account-type pages.
 * Studio is available to Personal and Business accounts; analytics need a public post,
 * and individual tools vary by region. IsraMarket has no TikTok analytics ingestion or
 * automatic publishing route. Do not imply that a stored link grants either capability.
 * https://support.tiktok.com/en/using-tiktok/creating-videos/creator-tools-on-tiktok
 * https://support.tiktok.com/en/using-tiktok/growing-your-audience/switching-to-a-creator-or-business-account
 */
const tiktokData: Guide = {
  topic: "tiktok_data",
  title: "איך בודקים תוצאות בטיקטוק",
  short: "נתוני טיקטוק עדיין לא נקראים אצלנו אוטומטית. בינתיים אפשר לבדוק את הסרטונים ב-TikTok Studio.",
  minutes: 2,
  blocks: [
    {
      title: "לראות את התוצאות שלכם",
      phone: [
        "בטיקטוק, פתחו **פרופיל** (Profile) › התפריט › **TikTok Studio**.",
        "פתחו **Analytics** (נתונים). בחרו סרטון ובדקו צפיות ותגובות. השוו סרטונים מאותה תקופה.",
      ],
      computer: [
        "פתחו בדפדפן את tiktok.com/tiktokstudio והיכנסו לחשבון של העסק.",
        "פתחו **Analytics** (נתונים). בחרו סרטון ובדקו צפיות ותגובות. השוו סרטונים מאותה תקופה.",
      ],
      note: "שמירת קישור לפרופיל אצלנו אינה חיבור לנתונים. גם הפרסום בטיקטוק נעשה ידנית כרגע.",
    },
    {
      title: "לא רואים נתונים?",
      disclosure: true,
      cases: [
        { label: "לא מופיעים הסרטונים שלכם", text: "ודאו שנכנסתם לחשבון הנכון. מי שמנהל את הטיקטוק של העסק יכול לבדוק בו את התוצאות." },
        { label: "זה חשבון אישי", text: "אפשר להשתמש בכלי היוצרים גם בחשבון אישי וגם בחשבון עסקי. אין צורך להחליף סוג חשבון רק כדי לראות נתונים." },
        { label: "החשבון חדש או פרטי", text: "טיקטוק דורשת לפחות פוסט ציבורי אחד כדי להציג נתונים. אל תשנו פרטיות בלי להחליט שזה מתאים לעסק." },
        { label: "TikTok Studio או נתון מסוים חסר", text: "הכלים משתנים לפי אזור, חשבון וגרסת האפליקציה. נסו גם דרך הדפדפן או דרך הנתונים של הסרטון עצמו." },
      ],
    },
  ],
  stuck: {
    title: TO_SOCIAL_MANAGER,
    message: "היי, אפשר לבדוק ב-TikTok Studio אילו סרטונים של העסק קיבלו הכי הרבה צפיות ותגובות בתקופה האחרונה? נתוני טיקטוק עדיין לא מתחברים אצלנו אוטומטית. אין צורך לשלוח סיסמה. תודה!",
    copiedNote: COPIED,
  },
  why: "אפשר לבדוק אילו סרטונים משכו תשומת לב. צפיות לבדן לא מוכיחות פניות או מכירות, והמספרים האלה עדיין לא נכנסים אוטומטית לניתוח אצלנו.",
  source: { label: "ההסבר של טיקטוק: נתונים וכלי יוצרים", url: "https://support.tiktok.com/en/using-tiktok/creating-videos/creator-tools-on-tiktok" },
};

/*
 * google_business_profile — checked 2026-09 against:
 *   Find your profile (search "my business", Maps app › Business): https://support.google.com/business/answer/145585
 *   Claim this business › Manage now; business.google.com/add:     https://support.google.com/business/answer/2911778
 *   Someone else manages it › Request Access, 3 days:              https://support.google.com/business/answer/4566671
 *   Verification methods, chosen by Google:                        https://support.google.com/business/answer/7107242
 * Not verified: a current "share profile" button (g.page short names are frozen:
 * https://support.google.com/business/answer/9273900), so the guide does not promise one.
 */
const googleBusinessProfile: Guide = {
  topic: "google_business_profile",
  title: "איך מוצאים את העסק בגוגל",
  short:
    "מחפשים בגוגל מפות את שם העסק והעיר: אם הכרטיס שלו מופיע ואף אחד לא מנהל אותו, לוחצים **Claim this business**, וזה בחינם.",
  minutes: 5,
  blocks: [
    {
      title: "יש לכם כבר כרטיס בגוגל?",
      text: "היכנסו עם הג׳ימייל של העסק. אם אתם כבר מנהלים כרטיס, תראו אותו כך:",
      phone: [
        "באפליקציית Google Maps, לחצו **Business** (עסק) בתחתית המסך.",
        "יש לכם כמה עסקים? בחרו את הנכון מהחץ שלמעלה.",
      ],
      computer: ["חפשו בגוגל **my business**, או את שם העסק והעיר. הכרטיס שלכם יופיע עם כלי עריכה."],
    },
    {
      title: "העסק מופיע, אבל לא אצלכם",
      phone: [
        "באפליקציית Google Maps, חפשו את שם העסק והעיר ופתחו אותו.",
        "לחצו **About** (מידע), ואז **Claim this business** › **Manage now**.",
        "בחרו איך לאמת שהעסק שלכם.",
      ],
      computer: [
        "ב-Google Maps, חפשו את שם העסק והעיר ובחרו אותו.",
        "לחצו **Claim this business** › **Manage now**.",
        "בחרו איך לאמת שהעסק שלכם.",
      ],
      note: "כתוב ״Someone else may manage this Business Profile״? מישהו אחר כבר מנהל אותו. בחרו **Request Access** ומלאו את הטופס. יש לו 3 ימים לענות.",
    },
    {
      title: "העסק לא מופיע בכלל",
      steps: [
        "היכנסו ל-business.google.com/add ובחרו **Add your business to Google**.",
        "מלאו את פרטי העסק.",
        "גוגל יבקש לאמת: בטלפון, בהודעה, במייל, בשיחת וידאו או בסרטון. גוגל בוחר את האפשרויות, ואי אפשר לשנות אותן.",
      ],
    },
  ],
  stuck: {
    title: "תקועים? שלחו את זה למי שמנהל לכם את השיווק",
    message: [
      "היי, יש לעסק שלנו כרטיס בגוגל (Google Business Profile)?",
      "אם כן, אפשר בבקשה להוסיף את הג׳ימייל שלמטה כמנהל (Manager)?",
      "הג׳ימייל: ",
      "תודה!",
    ].join("\n"),
    copiedNote: COPIED,
  },
  why: "זה הדבר הראשון שאנשים רואים כשהם מחפשים אתכם בגוגל ובמפות, ולכן כדאי שהוא יהיה שלכם ומעודכן.",
  source: { label: "ההסבר של גוגל: לנהל את הכרטיס של העסק", url: "https://support.google.com/business/answer/2911778" },
};

/*
 * whatsapp_business — checked 2026-09 against:
 *   Click to chat, wa.me/<number>, "Omit any zeroes, brackets, or dashes", wa.me/?text=:
 *     https://faq.whatsapp.com/5913398998672934
 *   WhatsApp Business short link and QR code (iPhone: Tools › Short Link; Android: Tools ›
 *   ⋮ › Short link, or Settings › QR code icon): https://faq.whatsapp.com/888878128766436
 * Not verified: the exact Android menu icon between "Tools" and "Short link", and the
 * Hebrew labels in the app, so the guide gives the English ones.
 * Israeli numbers: 972 + the number without its leading 0 is our reading of the
 * "international format" rule; the FAQ has no Israeli example.
 */
const whatsappBusiness: Guide = {
  topic: "whatsapp_business",
  title: "איך מוצאים את הקישור לוואטסאפ",
  short: "הקישור הוא wa.me/ ואחריו המספר שלכם עם 972 ובלי ה-0 שבהתחלה, למשל wa.me/9725XXXXXXXX.",
  minutes: 1,
  blocks: [
    {
      title: "לכתוב את הקישור לבד",
      steps: [
        "קחו את מספר הוואטסאפ של העסק, למשל 050-XXXXXXX.",
        "מחקו את ה-0 שבהתחלה ואת המקפים, והוסיפו 972 בהתחלה: 9725XXXXXXXX.",
        "הקישור הוא https://wa.me/ ואחריו המספר: https://wa.me/9725XXXXXXXX.",
      ],
      note: "בלי +, בלי רווחים ובלי מקפים. כך וואטסאפ מבקשים לכתוב את המספר.",
    },
    {
      title: "יש לכם וואטסאפ ביזנס? יש שם קישור מוכן",
      cases: [
        { label: "אייפון", text: "**Tools** (כלים) › **Short Link** (קישור קצר)." },
        {
          label: "אנדרואיד",
          text: "**Tools** (כלים), ואז בתפריט **Short link** (קישור קצר). אפשר גם **Settings** (הגדרות) › סמל קוד ה-QR.",
        },
      ],
      note: "השמות בתפריט משתנים מעט בין גרסאות.",
    },
  ],
  stuck: {
    title: "תקועים? שלחו את זה למי שמנהל לכם את הוואטסאפ של העסק",
    message: "היי, מה הקישור לוואטסאפ של העסק (wa.me)? צריך אותו לאפליקציית השיווק. תודה!",
    copiedNote: COPIED,
  },
  // In the app the owner types only the number (050-1234567 is fine); we build the
  // wa.me links ourselves, one per place, and count the taps (web/lib/whatsapp.ts).
  why: "בחיבורים מספיק לכתוב את המספר, למשל 050-1234567. מזה נכין קישור לכל פוסט ולביו, ונספור כמה לחצו על כל אחד.",
  source: { label: "ההסבר של וואטסאפ: קישור לשיחה", url: "https://faq.whatsapp.com/5913398998672934" },
};

export const GUIDES: Record<HelpTopic, Guide> = {
  google_analytics: googleAnalytics,
  instagram_business: instagramBusiness,
  facebook_data: facebookData,
  tiktok_data: tiktokData,
  instagram,
  facebook,
  tiktok,
  website,
  competitor_instagram: competitorInstagram,
  google_business_profile: googleBusinessProfile,
  whatsapp_business: whatsappBusiness,
};

/** The order `/help` lists them in: connecting first, then your own links, then others. */
export const HELP_GROUPS: { title: string; topics: HelpTopic[] }[] = [
  { title: "נתונים וחיבורים", topics: ["google_analytics", "instagram_business", "facebook_data", "tiktok_data"] },
  { title: "הקישורים שלכם", topics: ["website", "instagram", "facebook", "tiktok", "whatsapp_business"] },
  { title: "גוגל ועסקים אחרים", topics: ["google_business_profile", "competitor_instagram"] },
];
