/**
 * Hand-written Design DNAs: the demo business's (with the alternatives "לנסות סגנון אחר"
 * cycles through in demo mode), and the fictional businesses on the visual QA page
 * (/dev/dna). Three of those are bakeries with the same photograph, on purpose: the proof
 * that same-field businesses come out looking like different designers made them.
 */

import type { BrandDna } from "./library";

/** A tiny self-contained logo, so the QA page exercises the logo path end to end. */
function svgLogo(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ------------------------------------------------------------------ */
/* The demo business: לחם תום, a sourdough bakery in Jaffa             */
/* ------------------------------------------------------------------ */

export const DEMO_DNA: BrandDna = {
  version: 1,
  seed: 41827,
  created_at: "2026-10-01T08:00:00Z",
  field: "bakery",
  type: { display: "suez-one", display_weight: 400, text: "assistant", text_weight: 500, headline_case: "sentence", scale: "large" },
  colors: { ink: "#1a1512", paper: "#f3e6d4", accent: "#b8501f", accent_2: "#6f7f4f", on_photo: "#f6eadb", tint: "#ead3b8" },
  compositions: ["arch_window", "ticket", "full_bleed", "handwritten_note"],
  motif: { kind: "stamp", color: "accent", density: "mid" },
  signature: { kind: "stamp", use_logo: true },
  photo: {
    grade: "warm film, lifted blacks",
    light: "early morning side light through the shop window",
    angle: "close, three-quarter, at counter height",
    props: ["flour on marble", "kraft paper", "linen towel"],
    background: "the bakery counter, softly out of focus",
    never: ["glossy studio light", "people's faces", "fake text on packaging"],
  },
  copy: { price_style: "tag", cta_style: "underline" },
  rationale_he: "קמח, חלודה ותנור: אותיות כבדות כמו שלט ישן ביפו, וחותמת כמו על שקית הלחם.",
  distance_checked_against: 7,
};

/** What "לנסות סגנון אחר" offers in demo mode: the same signals, read differently. */
export const DEMO_DNA_ALTERNATIVES: BrandDna[] = [
  {
    ...DEMO_DNA,
    seed: 52914,
    type: { display: "frank-ruhl-libre", display_weight: 700, text: "assistant", text_weight: 400, headline_case: "sentence", scale: "editorial" },
    colors: { ink: "#1a1512", paper: "#f6eee2", accent: "#a94b1f", accent_2: "#3b2a22", on_photo: "#f6eee2", tint: "#ecdcc6" },
    compositions: ["editorial_column", "split", "inset_frame"],
    motif: { kind: "grain", color: "ink", density: "mid" },
    signature: { kind: "footer_band", use_logo: true },
    copy: { price_style: "inline", cta_style: "arrow" },
    rationale_he: "כמו עמוד מעיתון שכונתי ישן: סריף קלאסי, נייר מחוספס ופס עם השם בתחתית.",
  },
  {
    ...DEMO_DNA,
    seed: 61330,
    type: { display: "amatic-sc", display_weight: 700, text: "rubik", text_weight: 400, headline_case: "sentence", scale: "large" },
    colors: { ink: "#2a1d16", paper: "#f3e6d4", accent: "#c45c26", accent_2: "#7a8b5a", on_photo: "#fffaf2", tint: "#efdcc4" },
    compositions: ["handwritten_note", "collage_grid", "circle_crop"],
    motif: { kind: "tape", color: "accent", density: "low" },
    signature: { kind: "tab", use_logo: true },
    copy: { price_style: "circle", cta_style: "pill" },
    rationale_he: "פתק בכתב יד על הדלפק, מודבק בסלוטייפ: כמו שאתם כותבים ללקוחות קבועים.",
  },
  {
    ...DEMO_DNA,
    seed: 70461,
    type: { display: "karantina", display_weight: 700, text: "heebo", text_weight: 400, headline_case: "sentence", scale: "large" },
    colors: { ink: "#1a1512", paper: "#f3e6d4", accent: "#c45c26", accent_2: "#3b2a22", on_photo: "#fff4e6", tint: "#e9cfb0" },
    compositions: ["stacked_bands", "corner_tab", "type_led"],
    motif: { kind: "stripes", color: "accent", density: "mid" },
    signature: { kind: "corner_mark", use_logo: true },
    copy: { price_style: "circle", cta_style: "pill" },
    rationale_he: "פסים כמו סוכך מעל הדלת ואותיות גבוהות וצרות: מאפייה של שוק, רועשת ושמחה.",
  },
];

/* ------------------------------------------------------------------ */
/* The QA businesses                                                   */
/* ------------------------------------------------------------------ */

export type SampleWords = { headline: string; kicker?: string; stat?: string; cta?: string };

export type SampleBusiness = {
  id: string;
  name: string;
  field_he: string;
  photo: string;
  logo?: string;
  dna: BrandDna;
  /** One post per composition shown, in the DNA's composition order. */
  posts: SampleWords[];
  crop?: { x: number; y: number; zoom?: number };
};

const BAKERY_PHOTO = "/examples/bakery.webp";

export const SAMPLE_BUSINESSES: SampleBusiness[] = [
  {
    id: "lechem-tom",
    name: "לחם תום",
    field_he: "מאפייה · יפו",
    photo: BAKERY_PHOTO,
    dna: DEMO_DNA,
    crop: { x: 0.62, y: 0.42 },
    posts: [
      { headline: "החלות נגמרות לפני הצהריים", kicker: "שישי ביפו", stat: "100 חלות כל שישי", cta: "להזמנה בוואטסאפ" },
      { headline: "סופגניות עם ריבה של השוק", kicker: "חנוכה בתנור", stat: "12 ₪ לסופגנייה טרייה", cta: "לשריין מגש" },
      { headline: "אופים כל לילה, בלי מלאי מאתמול", kicker: "מהתנור ב-05:00", cta: "לבוא לדלפק" },
    ],
  },
  {
    id: "bonbon",
    name: "בונבון",
    field_he: "קונדיטוריה · תל אביב",
    photo: BAKERY_PHOTO,
    logo: svgLogo(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 96'><circle cx='48' cy='48' r='40' fill='#ef6f8e'/><circle cx='48' cy='48' r='30' fill='none' stroke='#fff4ef' stroke-width='3' stroke-dasharray='4 5'/><text x='48' y='60' font-family='Georgia, serif' font-size='34' font-weight='700' fill='#fff4ef' text-anchor='middle'>bb</text><text x='100' y='62' font-family='Georgia, serif' font-size='40' font-style='italic' fill='#3a2342'>bonbon</text></svg>`,
    ),
    dna: {
      version: 1,
      seed: 18842,
      field: "bakery",
      type: { display: "playpen-sans-hebrew", display_weight: 700, text: "rubik", text_weight: 400, headline_case: "sentence", scale: "medium" },
      colors: { ink: "#3a2342", paper: "#fff4ef", accent: "#e8577d", accent_2: "#f6c453", on_photo: "#ffffff", tint: "#fde0e5" },
      compositions: ["circle_crop", "stacked_bands", "collage_grid"],
      motif: { kind: "scalloped_edge", color: "accent", density: "mid" },
      signature: { kind: "tab", use_logo: true },
      copy: { price_style: "circle", cta_style: "pill" },
      rationale_he: "ורוד, חמאה ושוליים מסולסלים כמו קופסת עוגות. אותיות עגולות ושמחות.",
    },
    crop: { x: 0.62, y: 0.42 },
    posts: [
      { headline: "סופגניות ורודות לבוקר של שישי", kicker: "חדש בוויטרינה", stat: "8 ₪", cta: "להזמין קופסה" },
      { headline: "קופסת יום הולדת ל-12 אורחים", kicker: "בהזמנה מראש", stat: "48 שעות מראש", cta: "לבחור טעמים" },
      { headline: "מתוק קטן לאמצע השבוע", kicker: "רק ברביעי", cta: "לקפוץ אלינו" },
    ],
  },
  {
    id: "kemach-melach",
    name: "קמח ומלח",
    field_he: "מאפייה · חיפה",
    photo: BAKERY_PHOTO,
    dna: {
      version: 1,
      seed: 30117,
      field: "bakery",
      type: { display: "noto-serif-hebrew", display_weight: 300, text: "ibm-plex-sans-hebrew", text_weight: 400, headline_case: "sentence", scale: "editorial" },
      colors: { ink: "#22201c", paper: "#f2eee6", accent: "#7c5a3c", accent_2: "#c9bfad", on_photo: "#f2eee6", tint: "#e6e0d4" },
      compositions: ["editorial_column", "inset_frame", "type_led"],
      motif: { kind: "grain", color: "ink", density: "low" },
      signature: { kind: "footer_band", use_logo: true },
      copy: { price_style: "inline", cta_style: "arrow" },
      rationale_he: "שקט ומדויק: סריף דק, הרבה אוויר ונייר מחוספס, כמו מאפייה קטנה בצפון אירופה.",
    },
    crop: { x: 0.6, y: 0.45 },
    posts: [
      { headline: "מחמצת שיפון, 36 שעות", kicker: "הלחם של השבוע", stat: "24 ₪", cta: "לשריין כיכר" },
      { headline: "השולחן של שבת מתחיל כאן", kicker: "שישי, 07:00–14:00", cta: "לבוא ביום שישי" },
      { headline: "פתוחים מ-07:00. התנור כבר חם.", kicker: "שעות חדשות", cta: "לראות את השעות" },
    ],
  },
  {
    id: "tachra",
    name: "תחרה",
    field_he: "הלבשה תחתונה · רמת השרון",
    photo: "/examples/lingerie.webp",
    logo: svgLogo(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 260 96'><circle cx='46' cy='48' r='36' fill='none' stroke='#7d2e46' stroke-width='2'/><circle cx='46' cy='48' r='29' fill='none' stroke='#7d2e46' stroke-width='1' stroke-dasharray='2 4'/><text x='46' y='60' font-family='Didot, Georgia, serif' font-size='34' fill='#7d2e46' text-anchor='middle'>T</text><text x='96' y='60' font-family='Didot, Georgia, serif' font-size='30' letter-spacing='6' fill='#2b1a21'>TACHRA</text></svg>`,
    ),
    dna: {
      version: 1,
      seed: 77310,
      field: "lingerie",
      type: { display: "bellefair", display_weight: 400, text: "assistant", text_weight: 300, headline_case: "sentence", scale: "editorial" },
      colors: { ink: "#2b1a21", paper: "#f5eae6", accent: "#7d2e46", accent_2: "#c9a27e", on_photo: "#f7ede9", tint: "#ebd8d2" },
      compositions: ["full_bleed", "editorial_column", "inset_frame"],
      motif: { kind: "thread", color: "accent", density: "mid" },
      signature: { kind: "corner_mark", use_logo: true },
      copy: { price_style: "inline", cta_style: "arrow" },
      rationale_he: "בורדו ושמפניה, סריף עדין ותפר דק: כמו תווית תפורה בתוך הבגד.",
    },
    crop: { x: 0.55, y: 0.48 },
    posts: [
      { headline: "המידה שלכן, בלי לנחש", kicker: "מדידה אישית בחנות", cta: "לקבוע מדידה" },
      { headline: "קולקציית סתיו: תחרה בצבע אבקה", kicker: "חדש בחנות", stat: "289 ₪", cta: "לראות את הקולקציה" },
      { headline: "חזייה אחת ליום ולערב", kicker: "הכי נמכרת", cta: "לבוא למדוד" },
    ],
  },
  {
    id: "beit-neshima",
    name: "בית נשימה",
    field_he: "סטודיו ליוגה · קריית טבעון",
    photo: "/examples/yoga.webp",
    dna: {
      version: 1,
      seed: 52003,
      field: "yoga",
      type: { display: "david-libre", display_weight: 500, text: "rubik", text_weight: 300, headline_case: "sentence", scale: "medium" },
      colors: { ink: "#2f3a2c", paper: "#efebe0", accent: "#a8643c", accent_2: "#7c8c6a", on_photo: "#fbf8f0", tint: "#dde2d2" },
      compositions: ["arch_window", "circle_crop", "ticket"],
      motif: { kind: "arches", color: "accent_2", density: "mid" },
      signature: { kind: "stamp", use_logo: true },
      copy: { price_style: "inline", cta_style: "underline" },
      rationale_he: "חול, מרווה וטרקוטה. קשתות כמו החלון בסטודיו, ואות דוד רגועה.",
    },
    crop: { x: 0.45, y: 0.4 },
    posts: [
      { headline: "שיעור בוקר לפני העבודה", kicker: "ימים ב׳ ו-ה׳", stat: "07:00 על המזרן", cta: "להירשם לשיעור" },
      { headline: "השיעור הראשון עלינו", kicker: "למתחילים", cta: "לשריין מקום" },
      { headline: "לנשום לאט, גם בשבוע עמוס", kicker: "סדנת סוף שבוע", stat: "180 ₪", cta: "להירשם לסדנה" },
    ],
  },
  {
    id: "cohen",
    name: "כהן ושות׳",
    field_he: "רואי חשבון · פתח תקווה",
    photo: "/examples/accountant.webp",
    logo: svgLogo(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 272 96'><rect x='8' y='14' width='68' height='68' fill='#102a43'/><rect x='22' y='58' width='40' height='8' fill='#e8b931'/><text x='42' y='52' font-family='Arial, sans-serif' font-size='30' font-weight='700' fill='#ffffff' text-anchor='middle'>C&amp;C</text><text x='90' y='46' font-family='Arial, sans-serif' font-size='24' font-weight='700' fill='#102a43'>COHEN &amp; CO</text><text x='90' y='72' font-family='Arial, sans-serif' font-size='15' letter-spacing='2' fill='#486581'>CPA · TAX</text></svg>`,
    ),
    dna: {
      version: 1,
      seed: 10442,
      field: "accounting",
      type: { display: "secular-one", display_weight: 400, text: "assistant", text_weight: 400, headline_case: "sentence", scale: "large" },
      colors: { ink: "#102a43", paper: "#f7f7f2", accent: "#e8b931", accent_2: "#2c5282", on_photo: "#ffffff", tint: "#fff3c4" },
      compositions: ["type_led", "split", "corner_tab"],
      motif: { kind: "underline", color: "accent", density: "low" },
      signature: { kind: "tab", use_logo: true },
      copy: { price_style: "inline", cta_style: "pill" },
      rationale_he: "כחול עמוק ומרקר צהוב: כמו לסמן את התאריך החשוב בדוח. ברור, בלי קישוטים.",
    },
    crop: { x: 0.5, y: 0.6 },
    posts: [
      { headline: "הדוח השנתי נסגר ב-31.5", kicker: "תזכורת לעצמאים", cta: "לקבוע פגישה" },
      { headline: "3 הוצאות שמותר לכם לקזז", kicker: "טיפ לעצמאים", cta: "לקרוא בפוסט" },
      { headline: "פגישת היכרות ראשונה, בלי עלות", kicker: "לעסקים חדשים", cta: "לתאם שיחה" },
    ],
  },
  {
    id: "shaked",
    name: "סטודיו שקד",
    field_he: "טיפוח וקוסמטיקה · חיפה",
    photo: "/examples/beauty.webp",
    dna: {
      version: 1,
      seed: 66019,
      field: "beauty",
      type: { display: "karantina", display_weight: 700, text: "heebo", text_weight: 300, headline_case: "sentence", scale: "large" },
      colors: { ink: "#1f1d1a", paper: "#ece7df", accent: "#4f5d42", accent_2: "#d8c3a5", on_photo: "#f3eee6", tint: "#dce0d2" },
      compositions: ["corner_tab", "collage_grid", "full_bleed"],
      motif: { kind: "dots", color: "accent", density: "low" },
      signature: { kind: "corner_mark", use_logo: true },
      copy: { price_style: "circle", cta_style: "arrow" },
      rationale_he: "מרווה ושעווה, אותיות צרות וגבוהות כמו במגזין, ונקודות הדפס עדינות.",
    },
    crop: { x: 0.55, y: 0.55 },
    posts: [
      { headline: "טיפול פנים עם שמנים מהגליל", kicker: "חדש בסטודיו", stat: "320 ₪", cta: "לקבוע תור" },
      { headline: "העור אחרי הקיץ", kicker: "טיפול סתיו", cta: "לקבוע תור" },
      { headline: "שעה של שקט בתוך השבוע", kicker: "מבצע לחברות", cta: "לבחור שעה" },
    ],
  },
  {
    id: "pirchei-habar",
    name: "פרחי הבר",
    field_he: "חנות פרחים · ירושלים",
    photo: "/examples/flowers.webp",
    dna: {
      version: 1,
      seed: 39251,
      field: "florist",
      type: { display: "amatic-sc", display_weight: 700, text: "assistant", text_weight: 500, headline_case: "sentence", scale: "large" },
      colors: { ink: "#2e2a22", paper: "#faf5ec", accent: "#b83a52", accent_2: "#6d8a4e", on_photo: "#fffdf8", tint: "#efe2d2" },
      compositions: ["handwritten_note", "collage_grid", "circle_crop"],
      motif: { kind: "tape", color: "accent", density: "low" },
      signature: { kind: "footer_band", use_logo: true },
      copy: { price_style: "tag", cta_style: "underline" },
      rationale_he: "נייר קראפט, סלוטייפ וכתב יד: כמו פתק שמצמידים לזר.",
    },
    crop: { x: 0.45, y: 0.55 },
    posts: [
      { headline: "זר שישי, ישר מהשוק", kicker: "משלוח עד הבית", stat: "120 ₪", cta: "להזמין זר" },
      { headline: "הכלניות הראשונות של העונה", kicker: "השבוע בחנות", cta: "לבוא לבחור" },
      { headline: "תגידו את זה עם פרחים", kicker: "לכל אירוע", cta: "להזמין זר" },
    ],
  },
  {
    id: "parva",
    name: "פרווה ושות׳",
    field_he: "מספרה לכלבים · ראשון לציון",
    photo: "/examples/grooming.webp",
    logo: svgLogo(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><circle cx='48' cy='48' r='44' fill='#1e8c8c'/><ellipse cx='48' cy='58' rx='17' ry='14' fill='#fff8e8'/><circle cx='28' cy='38' r='7' fill='#fff8e8'/><circle cx='40' cy='28' r='7' fill='#fff8e8'/><circle cx='56' cy='28' r='7' fill='#fff8e8'/><circle cx='68' cy='38' r='7' fill='#fff8e8'/></svg>`,
    ),
    dna: {
      version: 1,
      seed: 84420,
      field: "pet_grooming",
      type: { display: "rubik", display_weight: 800, text: "varela-round", text_weight: 400, headline_case: "sentence", scale: "large" },
      colors: { ink: "#12324a", paper: "#fff8e8", accent: "#f2b62c", accent_2: "#1e8c8c", on_photo: "#ffffff", tint: "#fdebc0" },
      compositions: ["stacked_bands", "split", "type_led"],
      motif: { kind: "stripes", color: "accent_2", density: "mid" },
      signature: { kind: "corner_mark", use_logo: true },
      copy: { price_style: "circle", cta_style: "pill" },
      rationale_he: "צהוב, טורקיז ופסים כמו מגבת אמבטיה. עגול, שמח ונקי.",
    },
    crop: { x: 0.6, y: 0.4 },
    posts: [
      { headline: "תספורת קיץ לכלבים מתולתלים", kicker: "תורים לאוגוסט", cta: "לקבוע תור" },
      { headline: "אמבטיה, פן וחיוך", kicker: "חבילת פינוק", stat: "180 ₪", cta: "לקבוע תור" },
      { headline: "הכלב שלכם יחזור מבריק", kicker: "מספרה לכלבים", cta: "לקבוע תור" },
    ],
  },
];
