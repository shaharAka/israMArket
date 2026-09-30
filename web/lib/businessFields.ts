/**
 * The business field ("התחום"): which industry the business is in.
 *
 * Industries only. Where the business sells (a shop, a site, both) is a different question,
 * answered by `links`, `grow_where`, `presence_type` and `business_model`. The old list
 * mixed the two ("חנות פיזית / קמעונאות", "חנות אונליין"), and a store is not a field.
 *
 * The list itself (keys, labels, chip labels, default model, preset, inference keywords,
 * old labels) is `businessFields.json`, a byte-for-byte copy of
 * `api/app/data/business_fields.json`; `api/tests/test_business_fields.py` fails if they
 * differ or if FIELD_KEYS below drifts. The draft and the API store the `key`; labels are
 * display text and can change without migrating anything.
 *
 * This file adds what only the browser needs per field: the example chips, audiences,
 * placeholder and the lines the /start conversation says back.
 */
import type { BusinessModel, SuggestedAudience } from "./api";
import data from "./businessFields.json";

export const FIELD_KEYS = [
  "food",
  "fashion",
  "jewelry",
  "beauty",
  "health",
  "fitness",
  "home",
  "real_estate",
  "professional",
  "education",
  "hospitality",
  "kids",
  "pets",
  "gifts",
  "other",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];
export type PresenceHint = "brick_and_mortar" | "online_only" | "hybrid";

export const OTHER_FIELD: FieldKey = "other";

type FieldCopy = {
  placeholder: string;
  /** Example chips at "מה מייחד אתכם". */
  differentiators: string[];
  audiences: SuggestedAudience[];
  /** A one-line observation about the field, shown as the plan's "category" insight. */
  industry: string;
  /** What a consultant says back after hearing what the business does. */
  heard: string;
  /** A nudge for the seasons question. An example, never a default. */
  seasons: string;
};

export type BusinessField = FieldCopy & {
  key: FieldKey;
  label: string;
  /** Short label for a chip on a phone. */
  chip: string;
  model: BusinessModel;
  preset: string;
  keywords: string[];
};

const COPY: Record<FieldKey, FieldCopy> = {
  food: {
    placeholder: "למשל: מחמצת, חלות לשישי ועוגות בהזמנה",
    differentiators: ["אופים כל בוקר", "מתכון משפחתי", "חומרי גלם מקומיים", "משלוח באותו יום"],
    audiences: [
      { name: "משפחות מהשכונה", description: "קונים לשישי ולחג, בדרך כלל באותה שעה.", why_he: "עסק אוכל שכונתי חי מלקוחות קבועים שגרים קרוב." },
      { name: "עובדים באזור", description: "עוצרים לקפה או לארוחה מהירה באמצע היום.", why_he: "הם עוברים ליד כל יום. צריך רק לתת להם סיבה להיכנס." },
      { name: "מזמינים לאירועים", description: "ימי הולדת, אירוח ומגשים לשבת.", why_he: "הזמנה אחת לאירוע שווה הרבה ביקורים רגילים." },
    ],
    industry: "בעסקי אוכל, תמונה קרובה של המוצר מושכת יותר מפוסט מבצע כללי.",
    heard: "באוכל, מה שנראה טוב בתמונה נמכר. נתחיל מהמוצר עצמו.",
    seasons: "למשל: החגים וחנוכה",
  },
  fashion: {
    placeholder: "למשל: הלבשה תחתונה בכל המידות, עם מדידה אישית",
    differentiators: ["מדידה וייעוץ אישי", "מידות שקשה למצוא", "מותגים שאין במקום אחר", "החלפה בלי בעיה"],
    audiences: [
      { name: "מחפשים גזרה שמתאימה", description: "נמאס להם לקנות משהו שלא יושב טוב.", why_he: "הם חוזרים למי שעזר להם למצוא את המידה." },
      { name: "קונים מתנה", description: "מחפשים משהו יפה למישהו אחר, ומהר.", why_he: "לפני חגים וימי הולדת הם מחפשים המלצה, לא מוצר מסוים." },
      { name: "לקוחות קבועים", description: "כבר קנו אצלכם ויחזרו כשתגיע קולקציה חדשה.", why_he: "הכי קל למכור למי שכבר מכיר אתכם." },
    ],
    industry: "באופנה, פוסט שמראה איך הבגד יושב על אדם אמיתי מביא יותר שאלות מתמונה על קולב.",
    heard: "באופנה אנשים קונים את איך שזה נראה עליהם. נראה את זה בפוסטים.",
    seasons: "למשל: לפני החגים ובלאק פריידי",
  },
  jewelry: {
    placeholder: "למשל: תכשיטי כסף בעבודת יד",
    differentiators: ["עבודת יד", "עיצוב שאין בחנויות", "חריטה אישית", "אריזת מתנה"],
    audiences: [
      { name: "מחפשי משהו מיוחד", description: "לא רוצים את מה שיש בכל קניון.", why_he: "עסק קטן מנצח כשיש לו סיפור וסגנון." },
      { name: "קונים מתנה", description: "רוצים מתנה שתשמח, ושתגיע בזמן.", why_he: "מועד המסירה הוא לרוב מה שסוגר את הקנייה." },
      { name: "מי שכבר קנו", description: "מכירים את האיכות ויחזרו לעוד פריט.", why_he: "קנייה שנייה עולה לכם הרבה פחות מלקוח חדש." },
    ],
    industry: "בתכשיטים, צילום קרוב על היד או על הצוואר מוכר יותר מתמונה של התכשיט לבד.",
    heard: "בתכשיטים הפרטים הקטנים מוכרים. נצלם אותם מקרוב.",
    seasons: "למשל: ט״ו באב ולפני החגים",
  },
  beauty: {
    placeholder: "למשל: טיפולי פנים, הסרת שיער ואיפור לאירועים",
    differentiators: ["טיפול אישי ושקט", "ניסיון של שנים", "חומרים טבעיים", "תורים גם בערב"],
    audiences: [
      { name: "לקוחות קבועים", description: "רוצים מקום אחד לסמוך עליו.", why_he: "טיפול קבוע הוא הבסיס של עסק יציב." },
      { name: "לפני אירוע", description: "כלות, מלוות ואורחות שצריכות תור בקרוב.", why_he: "הן מחפשות עכשיו, ובוחרות לפי תמונות של תוצאות." },
      { name: "מי שכבר היו אצלכם", description: "מכירים את היחס ויחזרו אם תזכירו.", why_he: "תזכורת בזמן הנכון מביאה אותם חזרה." },
    ],
    industry: "ביופי וטיפוח, תמונות לפני ואחרי מביאות פניות, רק עם הסכמה של הלקוחות.",
    heard: "בטיפוח אנשים רוצים לראות תוצאה ולהרגיש בטוחים.",
    seasons: "למשל: לפני החגים ולפני הקיץ",
  },
  health: {
    placeholder: "למשל: פיזיותרפיה לספורטאים וטיפול בכאבי גב",
    differentiators: ["זמן אמיתי לכל מטופל", "מומחיות בתחום אחד", "תור בלי לחכות שבועות", "ליווי גם בין הטיפולים"],
    audiences: [
      { name: "מי שכואב להם עכשיו", description: "מחפשים עזרה, ורוצים לדעת שהם בידיים טובות.", why_he: "הם בוחרים לפי הסבר ברור וזמינות, לא לפי מבצע." },
      { name: "מטופלים קבועים", description: "באים לטיפולים חוזרים ויכולים להמליץ.", why_he: "המלצה ממטופל היא הדרך הנפוצה להגיע למטפל חדש." },
      { name: "מי שדואגים לעצמם מראש", description: "רוצים למנוע בעיה לפני שהיא מתחילה.", why_he: "טיפ קצר ומועיל שומר אתכם בראש שלהם." },
    ],
    industry: "בבריאות, הסבר פשוט על בעיה נפוצה מביא יותר פניות מפוסט על המרפאה עצמה.",
    heard: "בבריאות אנשים צריכים לסמוך עליכם לפני שהם קובעים תור.",
    seasons: "למשל: אחרי החגים ולפני הקיץ",
  },
  fitness: {
    placeholder: "למשל: פילאטיס מכשירים ואימונים בקבוצות קטנות",
    differentiators: ["קבוצות קטנות", "מדריכים מוסמכים", "אווירה משפחתית", "שיעור ניסיון"],
    audiences: [
      { name: "מתחילים", description: "רוצים להתחיל לזוז, וקצת חוששים.", why_he: "הם צריכים לראות שזה מתאים גם להם." },
      { name: "הורים עסוקים", description: "מחפשים שעה קבועה לעצמם, קרוב לבית.", why_he: "זמן ומיקום מכריעים אצלם יותר מכל מבצע." },
      { name: "מתאמנים קבועים", description: "כבר מנויים ויכולים להביא חבר.", why_he: "חבר שמביא חבר היא הדרך הזולה להתמלא." },
    ],
    industry: "בספורט וכושר, סרטון קצר משיעור אמיתי עוזר למתחילים להרגיש שזה בשבילם.",
    heard: "באימון, הצעד הקשה הוא השיעור הראשון. נעזור להגיע אליו.",
    seasons: "למשל: אחרי החגים ולפני הקיץ",
  },
  home: {
    placeholder: "למשל: שיפוצי מטבחים ועיצוב פנים לדירות קטנות",
    differentiators: ["ליווי מההתחלה עד הסוף", "עמידה בזמנים", "עמידה בתקציב", "סגנון שמזהים"],
    audiences: [
      { name: "זוגות שעוברים דירה", description: "מתכננים שיפוץ ורוצים לראות מה אפשר.", why_he: "הם אוספים השראה חודשים לפני שהם פונים." },
      { name: "מי שמשפצים", description: "רוצים לשדרג בלי לגור באתר בנייה חודשים.", why_he: "הם בוחרים לפי עבודות קודמות, לא לפי הבטחות." },
      { name: "לקוחות מרוצים", description: "גרים בבית שעשיתם ומראים אותו לחברים.", why_he: "כל פרויקט גמור הוא סיפור לקוח מוכן." },
    ],
    industry: "בבית ובשיפוצים, תמונות לפני ואחרי ותיק עבודות מסודר הם מה שמביא פניות.",
    heard: "פה העבודות מדברות. התיק שלכם יהיה במרכז.",
    seasons: "למשל: אחרי החגים ולפני פסח",
  },
  real_estate: {
    placeholder: "למשל: תיווך דירות בחיפה והקריות",
    differentiators: ["מכירים כל רחוב באזור", "זמינים גם בערב", "עמלה ברורה מראש", "ליווי עד החתימה"],
    audiences: [
      { name: "מוכרי דירות", description: "רוצים למכור במחיר טוב ובלי כאב ראש.", why_he: "הם בוחרים מתווך לפי עסקאות קודמות באזור." },
      { name: "קונים דירה ראשונה", description: "מחפשים דירה ראשונה ומפחדים לטעות.", why_he: "הסבר פשוט על התהליך בונה אמון לפני הפגישה." },
      { name: "משקיעים", description: "מחפשים נכס שמשתלם לאורך זמן.", why_he: "הם רוצים עובדות על האזור, לא סיסמאות." },
    ],
    industry: "בנדל״ן, סרטון קצר מתוך הנכס והסבר על השכונה מביאים יותר פניות מתמונה ומחיר.",
    heard: "בנדל״ן אנשים בוחרים את מי שמכיר את האזור הכי טוב.",
    seasons: "למשל: אחרי החגים ולפני הקיץ",
  },
  professional: {
    placeholder: "למשל: הנהלת חשבונות לעצמאים ולעסקים קטנים",
    differentiators: ["זמינות מהירה", "מתמחים בתחום אחד", "מחיר קבוע ושקוף", "יחס אישי"],
    audiences: [
      { name: "עצמאים בתחילת הדרך", description: "פתחו עסק ומחפשים מישהו לסמוך עליו.", why_he: "הם מחפשים הסבר פשוט לפני שהם בוחרים איש מקצוע." },
      { name: "עסקים קטנים באזור", description: "רוצים מישהו קרוב וזמין.", why_he: "בשירות מקצועי, קרבה וזמינות הן סיבה לבחור." },
      { name: "לקוחות שממליצים", description: "לקוחות קיימים שמעבירים את השם הלאה.", why_he: "המלצה היא הדרך הנפוצה להגיע לנותני שירות." },
    ],
    industry: "בשירותים מקצועיים, אנשים פונים למי שכבר הסביר להם משהו בחינם.",
    heard: "בשירות, אנשים קונים אמון. נתחיל מהידע שלכם.",
    seasons: "למשל: אחרי החגים וסוף השנה",
  },
  education: {
    placeholder: "למשל: קורס צילום למתחילים, בזום ופרונטלי",
    differentiators: ["קבוצות קטנות", "ליווי גם אחרי הקורס", "מלמדים מניסיון", "אפשר גם אונליין"],
    audiences: [
      { name: "מתחילים סקרנים", description: "רוצים ללמוד משהו חדש ולא יודעים מאיפה להתחיל.", why_he: "הם צריכים טעימה קטנה לפני שהם נרשמים." },
      { name: "מחפשי מקצוע", description: "רוצים מקצוע חדש או קידום בעבודה.", why_he: "הם שואלים מה יוצא מזה בסוף. נראה להם." },
      { name: "בוגרים", description: "כבר למדו אצלכם ויכולים להמשיך או להמליץ.", why_he: "בוגר מרוצה הוא ההמלצה הכי משכנעת." },
    ],
    industry: "בחינוך ובסדנאות, טיפ קצר בחינם בפוסט מביא אנשים לשאול על הקורס המלא.",
    heard: "מי שלמד מכם משהו קטן יבוא ללמוד עוד.",
    seasons: "למשל: ספטמבר וסוף החופש",
  },
  hospitality: {
    placeholder: "למשל: צימר זוגי בגליל עם ג׳קוזי",
    differentiators: ["נוף שאין במקום אחר", "אירוח אישי", "ארוחת בוקר ביתית", "קרוב לאטרקציות"],
    audiences: [
      { name: "זוגות לסוף שבוע", description: "מחפשים חופשה קצרה ושקטה.", why_he: "הם מזמינים לפי תמונות ולפי מה שאורחים כתבו." },
      { name: "משפחות בחופשות", description: "צריכים מקום שנוח גם לילדים.", why_he: "בחופשות ובחגים הם מתכננים מראש." },
      { name: "אורחים חוזרים", description: "כבר היו אצלכם ויחזרו לעונה הבאה.", why_he: "תזכורת לפני העונה מביאה הזמנה ישירה, בלי אתר הזמנות." },
    ],
    industry: "באירוח ובאירועים, הזמנות לחגים ולעונה נסגרות שבועות מראש. מפרסמים מוקדם.",
    heard: "באירוח מוכרים חוויה, והתמונות הן חצי מהעבודה.",
    seasons: "למשל: הקיץ והחגים",
  },
  kids: {
    placeholder: "למשל: בגדי תינוקות מכותנה אורגנית ומתנות לידה",
    differentiators: ["בטוח לילדים", "חומרים טבעיים", "ייעוץ מהורים להורים", "אריזת מתנה"],
    audiences: [
      { name: "הורים טריים", description: "צריכים הרבה דברים, ורוצים לבחור נכון.", why_he: "הם סומכים על המלצה של הורים אחרים." },
      { name: "קונים מתנת לידה", description: "רוצים משהו שימושי ויפה.", why_he: "לפני ביקור אצל תינוק חדש מחפשים רעיון מוכן." },
      { name: "משפחות שחוזרות", description: "הילדים גדלים, וצריך את המידה או השלב הבא.", why_he: "מי שכבר קנה אצלכם יחזור כשהילד יגדל." },
    ],
    industry: "בעסקים לילדים, תמונה של ילד אמיתי עם המוצר, באישור ההורים, מושכת יותר מתמונת מוצר.",
    heard: "הורים קונים ממי שהם סומכים עליו. נראה להם למה לסמוך עליכם.",
    seasons: "למשל: ספטמבר והחגים",
  },
  pets: {
    placeholder: "למשל: מזון טבעי וציוד לכלבים, עם משלוח עד הבית",
    differentiators: ["מכירים כל כלב בשם", "מזון טבעי", "משלוח עד הבית", "ייעוץ מאנשים שמגדלים בעצמם"],
    audiences: [
      { name: "בעלי כלבים מהאזור", description: "מטיילים בשכונה כל יום, וקונים קרוב.", why_he: "קרבה ויחס אישי מנצחים את הרשתות הגדולות." },
      { name: "מאמצים חדשים", description: "אימצו גור ולא יודעים מה צריך.", why_he: "רשימה פשוטה של מה צריך בהתחלה מביאה אותם אליכם." },
      { name: "לקוחות קבועים", description: "קונים מזון כל חודש.", why_he: "תזכורת בזמן חוסכת להם ריצה ומחזירה אותם אליכם." },
    ],
    industry: "בעסקים לחיות מחמד, תמונות של החיות של הלקוחות, באישור, הן פוסט שאנשים אוהבים לשתף.",
    heard: "אנשים אוהבים את החיות שלהם. נראה אותן בפוסטים.",
    seasons: "למשל: החגים והקיץ",
  },
  gifts: {
    placeholder: "למשל: זרי פרחים ומארזי מתנה עם משלוח באותו יום",
    differentiators: ["משלוח באותו יום", "הרכבה אישית", "פרחים טריים כל בוקר", "ברכה בכתב יד"],
    audiences: [
      { name: "שולחים מתנה ברגע האחרון", description: "צריכים משהו יפה שיגיע היום.", why_he: "הם מחליטים מהר, לפי מה שנראה טוב ומגיע בזמן." },
      { name: "חברות שמפנקות עובדים", description: "מזמינים כמה מארזים לחג.", why_he: "הזמנה אחת של חברה שווה הרבה הזמנות רגילות." },
      { name: "לקוחות קבועים", description: "זוכרים אתכם מהפעם הקודמת.", why_he: "תזכורת לפני יום הולדת או חג מחזירה אותם." },
    ],
    industry: "במתנות ובפרחים, ההזמנות מתרכזות לפני חגים ותאריכים. מפרסמים שבוע לפני, לא ביום עצמו.",
    heard: "במתנות מוכרים את הרגע שפותחים. נראה אותו.",
    seasons: "למשל: ראש השנה, פסח וט״ו באב",
  },
  other: {
    placeholder: "במשפט אחד: מה אתם מוכרים או עושים",
    differentiators: ["יחס אישי", "ניסיון של שנים", "זמינות מהירה", "מחיר הוגן"],
    audiences: [
      { name: "לקוחות מהאזור", description: "גרים או עובדים קרוב אליכם.", why_he: "הכי קל להתחיל ממי שנמצא קרוב." },
      { name: "מחפשים בדיוק את זה", description: "צריכים את מה שאתם עושים ועוד לא מכירים אתכם.", why_he: "הם מחפשים עכשיו. צריך שימצאו אתכם." },
      { name: "לקוחות קיימים", description: "כבר מכירים אתכם ויכולים לחזור או להמליץ.", why_he: "הכי קל למכור למי שכבר מכיר אתכם." },
    ],
    industry: "לעסק קטן, פוסט קבוע פעם בשבוע עדיף על הרבה פוסטים ואז שקט.",
    heard: "נתחיל מהדבר שהכי קל להראות.",
    seasons: "למשל: החגים והקיץ",
  },
};

type RawField = { key: string; label: string; chip: string; model: string; preset: string; keywords: string[] };
type RawLegacy = { value: string; key?: string; among?: string[]; fallback?: string; presence_type?: string };

/** Lowercase, one kind of quote, one space. The API folds the same way (business_fields._fold). */
export function foldFieldText(text: string): string {
  return (text || "")
    .replace(/״/g, '"')
    .replace(/׳/g, "'")
    .replace(/''/g, '"')
    .replace(/`/g, "'")
    .replace(/’/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function isFieldKey(value: unknown): value is FieldKey {
  return typeof value === "string" && (FIELD_KEYS as readonly string[]).includes(value);
}

/** Every field, in display order: the shared list plus the browser's copy for it. */
export const BUSINESS_FIELDS: BusinessField[] = (data.fields as RawField[])
  .filter((raw) => isFieldKey(raw.key))
  .map((raw) => ({
    ...COPY[raw.key as FieldKey],
    key: raw.key as FieldKey,
    label: raw.label,
    chip: raw.chip,
    model: raw.model as BusinessModel,
    preset: raw.preset,
    keywords: raw.keywords.map(foldFieldText),
  }));

const BY_KEY = new Map(BUSINESS_FIELDS.map((field) => [field.key, field]));
const BY_TEXT = new Map<string, FieldKey>();
for (const field of BUSINESS_FIELDS) {
  for (const text of [field.key, field.label, field.chip]) {
    const folded = foldFieldText(text);
    if (!BY_TEXT.has(folded)) BY_TEXT.set(folded, field.key);
  }
}
const LEGACY = new Map((data.legacy as RawLegacy[]).map((item) => [foldFieldText(item.value), item]));

export function fieldFor(key: FieldKey): BusinessField {
  return BY_KEY.get(key) ?? BY_KEY.get(OTHER_FIELD)!;
}

/** The field whose keywords appear most often in `text` (ties: the earlier field), or null. */
export function inferField(text: string, among?: readonly string[]): FieldKey | null {
  const haystack = foldFieldText(text);
  if (!haystack) return null;
  let best: { hits: number; key: FieldKey } | null = null;
  for (const field of BUSINESS_FIELDS) {
    if (among && among.length && !among.includes(field.key)) continue;
    const hits = field.keywords.filter((word) => haystack.includes(word)).length;
    if (hits && (!best || hits > best.hits)) best = { hits, key: field.key };
  }
  return best?.key ?? null;
}

export type ResolvedField = { key: FieldKey; presence_type?: PresenceHint };

/**
 * A key, a label, a chip or an old stored label → the field; null for anything else.
 * The old channel labels ("חנות פיזית", "חנות אונליין") are read from the offerings,
 * and say where customers come as `presence_type`.
 */
export function resolveField(value: string | undefined | null, offerings = ""): ResolvedField | null {
  const text = foldFieldText(value ?? "");
  if (!text) return null;
  const direct = BY_TEXT.get(text);
  if (direct) return { key: direct };
  const item = LEGACY.get(text);
  if (!item) return null;
  const presence = item.presence_type as PresenceHint | undefined;
  const key = isFieldKey(item.key)
    ? item.key
    : (inferField(offerings, item.among) ?? (isFieldKey(item.fallback) ? item.fallback : OTHER_FIELD));
  return presence ? { key, presence_type: presence } : { key };
}

/** Any text → a field: free text is read with the offerings, "other" last. */
export function coerceField(value: string | undefined | null, offerings = ""): ResolvedField {
  return resolveField(value, offerings) ?? { key: inferField(`${value ?? ""} ${offerings}`) ?? OTHER_FIELD };
}

/** The Hebrew label for a stored value (a key, or an old label). */
export function fieldLabel(value: string | undefined | null): string {
  return value ? fieldFor(coerceField(value).key).label : "";
}
