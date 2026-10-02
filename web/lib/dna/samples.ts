/**
 * Hand-written Design DNAs (v2): the demo business's (with the alternatives "לנסות סגנון
 * אחר" cycles through in demo mode), and the fictional businesses on the visual QA page
 * (/dev/dna). Three of those are bakeries with the same photograph, on purpose: the proof
 * that same-field businesses come out looking like different designers made them.
 *
 * Each DNA is written the way the server writes one: a direction in words first, then the
 * keys derived from it. The photos' empty areas and subjects (`PHOTO_AREAS`) were measured by
 * eye from the images, standing in for the server's vision pass.
 */

import type { BrandDna, BrandDnaEdit, CompositionKey, Point01, PostPrice, Rect01, TextMode } from "./library";

/** A tiny self-contained logo, so the QA page exercises the logo path end to end. */
function svgLogo(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ------------------------------------------------------------------ */
/* Photos: where text may go, and the subject                          */
/* ------------------------------------------------------------------ */

export type PhotoArea = { safe_area: Rect01 | null; focal: Point01 };

/** The demo bakery's photos (`public/demo/post-*.webp`), measured by eye. */
export const DEMO_PHOTO_AREAS: Record<string, PhotoArea> = {
  // Challahs on the floured counter; the old wall above them is empty.
  "/demo/post-1.webp": { safe_area: { x: 0.24, y: 0.05, w: 0.72, h: 0.3 }, focal: { x: 0.45, y: 0.66 } },
  // The holiday box fills the frame: no room for words on it.
  "/demo/post-2.webp": { safe_area: null, focal: { x: 0.5, y: 0.52 } },
  // A blank card leans on the shelf beside the rolls: the words go on the card.
  "/demo/post-3.webp": { safe_area: { x: 0.1, y: 0.31, w: 0.34, h: 0.4 }, focal: { x: 0.77, y: 0.56 } },
  // Sliced sourdough and a sandwich; the dark wall above is empty.
  "/demo/post-4.webp": { safe_area: { x: 0.06, y: 0.05, w: 0.62, h: 0.27 }, focal: { x: 0.5, y: 0.6 } },
  // The bakery at night, the oven door; stone wall above the racks.
  "/demo/post-5.webp": { safe_area: { x: 0.08, y: 0.04, w: 0.56, h: 0.18 }, focal: { x: 0.55, y: 0.45 } },
  // Breads on the table in the sukkah; the plastered wall on the right is empty.
  "/demo/post-6.webp": { safe_area: { x: 0.49, y: 0.24, w: 0.46, h: 0.27 }, focal: { x: 0.6, y: 0.72 } },
  // Loaves into the wood oven; only the dark beam above.
  "/demo/post-7.webp": { safe_area: { x: 0.05, y: 0.02, w: 0.9, h: 0.15 }, focal: { x: 0.56, y: 0.48 } },
};

/** The QA page's photos (`public/examples/*.webp`), measured by eye. */
export const PHOTO_AREAS: Record<string, PhotoArea> = {
  ...DEMO_PHOTO_AREAS,
  // Doughnuts on a tray; the worn table in the front is empty.
  "/examples/bakery.webp": { safe_area: { x: 0.05, y: 0.66, w: 0.9, h: 0.3 }, focal: { x: 0.62, y: 0.44 } },
  // The bra on the bench; the carpet below is quiet.
  "/examples/lingerie.webp": { safe_area: { x: 0.06, y: 0.64, w: 0.88, h: 0.32 }, focal: { x: 0.55, y: 0.5 } },
  // Mats by the window; the wooden floor in front is empty.
  "/examples/yoga.webp": { safe_area: { x: 0.05, y: 0.68, w: 0.9, h: 0.28 }, focal: { x: 0.42, y: 0.46 } },
  // The ledger on the desk; the sunlit wall above it.
  "/examples/accountant.webp": { safe_area: { x: 0.3, y: 0.04, w: 0.64, h: 0.32 }, focal: { x: 0.5, y: 0.6 } },
  // Jars, cream and sage across the whole cloth: no room.
  "/examples/beauty.webp": { safe_area: null, focal: { x: 0.52, y: 0.55 } },
  // The bouquet on the table; the stone wall above.
  "/examples/flowers.webp": { safe_area: { x: 0.06, y: 0.04, w: 0.88, h: 0.3 }, focal: { x: 0.52, y: 0.56 } },
  // The dog on the grooming table; the floor below.
  "/examples/grooming.webp": { safe_area: { x: 0.05, y: 0.79, w: 0.9, h: 0.18 }, focal: { x: 0.62, y: 0.4 } },
};

/* ------------------------------------------------------------------ */
/* The demo business: לחם תום, a sourdough bakery in Jaffa             */
/* ------------------------------------------------------------------ */

export const DEMO_DNA: BrandDna = {
  version: 2,
  seed: 41827,
  created_at: "2026-10-02T08:00:00Z",
  field: "bakery",
  direction: {
    feel_he: "חם וכבד, כמו שלט צבוע ביד מעל דלת של מאפייה ביפו.",
    world_he: "שוק הפשפשים: אבן ישנה, קמח על השיש, תנור שעובד מהלילה.",
    photo_he: "אור בוקר מהחלון, קרוב ללחם ולידיים, רקע כהה וחם.",
    text_he: "רוב הפוסטים בלי טקסט. כשיש, משפט אחד קצר באותיות כבדות. המחיר רק כשהוא הסיפור.",
    never_he: ["מסגרות וקישוטים סביב התמונה", "מדבקות מבצע", "אור סטודיו מבריק", "טקסט שמסתיר את הלחם"],
  },
  type: { display: "suez-one", display_weight: 400, text: "assistant", text_weight: 500, headline_case: "sentence", scale: "large" },
  colors: { ink: "#1a1512", paper: "#f3e6d4", accent: "#c45c26", accent_2: "#3b2a22", on_photo: "#f6eadb", tint: "#ead3b8" },
  colors_source: { ink: "site", paper: "site", accent: "site", accent_2: "site", on_photo: "derived", tint: "derived" },
  compositions: ["full_bleed", "split", "type_led"],
  motif: { kind: "grain", from: "place", color: "ink", density: "low" },
  signature: { kind: "name_only", use_logo: false, logo_on: "light" },
  mix: { photo_only: 0.5, headline: 0.4, type_led: 0.1 },
  photo: {
    grade: "warm film, lifted blacks",
    light: "early morning side light through the shop window",
    angle: "close, three-quarter, at counter height",
    props: ["flour on marble", "kraft paper", "linen towel"],
    background: "the bakery counter, softly out of focus",
    never: ["glossy studio light", "people's faces", "fake text on packaging"],
  },
  copy: { headline_accent: false, price_style: "inline", cta_on_image: false },
  distance_checked_against: 7,
  source: "model",
};

/** What "לנסות סגנון אחר" offers in demo mode: the same signals and colours, read differently. */
export const DEMO_DNA_ALTERNATIVES: BrandDna[] = [
  {
    ...DEMO_DNA,
    seed: 52914,
    direction: {
      feel_he: "שקט ומסודר, כמו עמוד בעיתון שכונתי ישן.",
      world_he: "יפו של פעם: נייר מצהיב, אותיות סריף, מדף עץ עם לחמים בשורה.",
      photo_he: "הלחם לבד, הרבה אוויר סביבו, אור רך מהצד.",
      text_he: "כותרת אחת בסריף, ושם המאפייה בפס דק למטה.",
      never_he: ["אותיות עבות", "צבעים צועקים", "יותר משורה אחת על התמונה"],
    },
    type: { display: "frank-ruhl-libre", display_weight: 600, text: "assistant", text_weight: 400, headline_case: "sentence", scale: "editorial" },
    compositions: ["inset_frame", "full_bleed", "type_led"],
    motif: { kind: "rule", from: "place", color: "ink", density: "low" },
    signature: { kind: "footer_band", use_logo: false, logo_on: "light" },
    mix: { photo_only: 0.4, headline: 0.45, type_led: 0.15 },
  },
  {
    ...DEMO_DNA,
    seed: 61330,
    direction: {
      feel_he: "צפוף ושמח, כמו דוכן בשוק ביום שישי בבוקר.",
      world_he: "הרחוב של השוק: קולות, ארגזים, שלטים גבוהים וצרים.",
      photo_he: "הרבה לחם בפריים, קרוב מאוד, צבעים חמים.",
      text_he: "מילה או שתיים באותיות גבוהות, ומילה אחת בצבע של החלודה.",
      never_he: ["מסגרות", "פסים וקישוטים", "טקסט על הלחם עצמו"],
    },
    type: { display: "karantina", display_weight: 700, text: "heebo", text_weight: 400, headline_case: "sentence", scale: "large" },
    compositions: ["full_bleed", "split"],
    motif: { kind: "none" },
    signature: { kind: "name_only", use_logo: false, logo_on: "light" },
    mix: { photo_only: 0.6, headline: 0.35, type_led: 0.05 },
    copy: { headline_accent: true, price_style: "inline", cta_on_image: false },
  },
];

/**
 * `PUT /brand/dna {adjust}` the way the server reads it (demo mode): quieter/bolder moves the
 * type's scale and weight, more photo/more text moves the mix. Colours never move.
 */
export function adjustDna(dna: BrandDna, adjust: NonNullable<BrandDnaEdit["adjust"]>): BrandDna {
  const next: BrandDna = structuredClone(dna);
  const scales = ["editorial", "medium", "large"] as const;
  const at = Math.max(0, scales.indexOf((next.type.scale as (typeof scales)[number]) || "large"));
  if (adjust.tone === "quieter" || adjust.tone === "bolder") {
    const up = adjust.tone === "bolder";
    next.type = {
      ...next.type,
      scale: scales[Math.max(0, Math.min(2, at + (up ? 1 : -1)))],
      display_weight: Math.max(300, Math.min(800, (next.type.display_weight ?? 700) + (up ? 100 : -100))),
    };
    next.copy = { ...next.copy, headline_accent: up };
  }
  if (adjust.text === "more_photo" || adjust.text === "more_text") {
    const mix = { photo_only: 0.5, headline: 0.4, type_led: 0.1, ...next.mix };
    const d = adjust.text === "more_photo" ? 1 : -1;
    const photo = Math.max(0, Math.min(0.85, (mix.photo_only ?? 0) + 0.2 * d));
    const headline = Math.max(0.1, (mix.headline ?? 0) - 0.1 * d);
    const type = Math.max(0, (mix.type_led ?? 0) - 0.1 * d);
    const total = photo + headline + type;
    next.mix = { photo_only: +(photo / total).toFixed(2), headline: +(headline / total).toFixed(2), type_led: +(type / total).toFixed(2) };
    if (adjust.text === "more_text" && !next.compositions.includes("type_led")) next.compositions = [...next.compositions, "type_led"];
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* The QA businesses                                                   */
/* ------------------------------------------------------------------ */

export type SamplePost = {
  headline?: string;
  sub?: string;
  price?: PostPrice;
  mode: TextMode;
  composition?: CompositionKey;
  /** Another photo than the business's own (rare). */
  photo?: string;
};

export type SampleBusiness = {
  id: string;
  name: string;
  field_he: string;
  photo: string;
  logo?: string;
  dna: BrandDna;
  /** Three posts, as the business's feed would show them. */
  posts: SamplePost[];
  /** Real posts from a fixture (RoadmapPost-shaped), drawn as they are. */
  realPosts?: import("@/lib/api").RoadmapPost[];
  /** Where it came from: a hand-written sample, or a fixture file. */
  source?: string;
};

const BAKERY_PHOTO = "/examples/bakery.webp";

export const SAMPLE_BUSINESSES: SampleBusiness[] = [
  {
    id: "lechem-tom",
    name: "לחם תום",
    field_he: "מאפייה · יפו",
    photo: BAKERY_PHOTO,
    dna: DEMO_DNA,
    posts: [
      { mode: "headline", composition: "full_bleed", headline: "החלות נגמרות לפני הצהריים" },
      { mode: "photo_only", headline: "שישי." },
      { mode: "headline", composition: "split", headline: "סופגניות עם ריבה מהשוק", price: { amount: 12, currency: "ILS", note: "לסופגנייה" } },
    ],
  },
  {
    id: "bonbon",
    name: "בונבון",
    field_he: "קונדיטוריה · תל אביב",
    photo: BAKERY_PHOTO,
    logo: svgLogo(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 96'><circle cx='48' cy='48' r='40' fill='#e8577d'/><circle cx='48' cy='48' r='30' fill='none' stroke='#fff4ef' stroke-width='3' stroke-dasharray='4 5'/><text x='48' y='60' font-family='Georgia, serif' font-size='34' font-weight='700' fill='#fff4ef' text-anchor='middle'>bb</text><text x='100' y='62' font-family='Georgia, serif' font-size='40' font-style='italic' fill='#3a2342'>bonbon</text></svg>`,
    ),
    dna: {
      version: 2,
      seed: 18842,
      field: "bakery",
      direction: {
        feel_he: "מתוק ושמח, כמו קופסה ורודה שפותחים בבית.",
        world_he: "ויטרינה קטנה בתל אביב: חמאה, ורוד, קרטון עם סרט.",
        photo_he: "קרוב לקרם ולאבקת הסוכר, אור רך, הרבה רקע בהיר.",
        text_he: "כותרת קצרה ועגולה, ומילה אחת בוורוד. בלי מבצעים צועקים.",
        never_he: ["שוליים מסולסלים וקונפטי", "מדבקות מחיר", "יותר משורה אחת של פרטים", "עוגות מצילומי סטוק"],
      },
      type: { display: "playpen-sans-hebrew", display_weight: 600, text: "rubik", text_weight: 400, headline_case: "sentence", scale: "medium" },
      colors: { ink: "#3a2342", paper: "#fff4ef", accent: "#e8577d", accent_2: "#f6c453", on_photo: "#ffffff", tint: "#fde0e5" },
      colors_source: { ink: "logo", paper: "site", accent: "logo", accent_2: "site", on_photo: "derived", tint: "derived" },
      compositions: ["inset_frame", "split", "full_bleed"],
      motif: { kind: "none" },
      signature: { kind: "corner_mark", use_logo: true, logo_on: "light" },
      mix: { photo_only: 0.3, headline: 0.6, type_led: 0.1 },
      copy: { headline_accent: true, price_style: "inline", cta_on_image: false },
    },
    posts: [
      { mode: "headline", composition: "inset_frame", headline: "סופגניות ורודות לשישי" },
      { mode: "headline", composition: "split", headline: "קופסת יום הולדת ל-12", sub: "בהזמנה יומיים מראש" },
      { mode: "headline", composition: "full_bleed", headline: "מתוק קטן לאמצע השבוע" },
    ],
  },
  {
    id: "kemach-melach",
    name: "קמח ומלח",
    field_he: "מאפייה · חיפה",
    photo: BAKERY_PHOTO,
    dna: {
      version: 2,
      seed: 30117,
      field: "bakery",
      direction: {
        feel_he: "שקט ומדויק, כמו מאפייה קטנה שפותחת בשבע ולא ממהרת.",
        world_he: "רחוב צדדי בהדר: שיש אפור, נייר אפייה, מדפי עץ בהירים.",
        photo_he: "הרבה אוויר, אור צפוני רך, הלחם לבד על המשטח.",
        text_he: "כותרת דקה ושקטה, ושורה קטנה מעליה. בלי סימני קריאה.",
        never_he: ["צבעים חזקים", "מסגרות", "אותיות עבות", "יותר מכותרת אחת"],
      },
      type: { display: "noto-serif-hebrew", display_weight: 300, text: "ibm-plex-sans-hebrew", text_weight: 400, headline_case: "sentence", scale: "editorial" },
      colors: { ink: "#22201c", paper: "#f2eee6", accent: "#7c5a3c", accent_2: "#c9bfad", on_photo: "#f2eee6", tint: "#e6e0d4" },
      colors_source: { ink: "site", paper: "site", accent: "site", accent_2: "derived", on_photo: "derived", tint: "derived" },
      compositions: ["inset_frame", "type_led", "full_bleed"],
      motif: { kind: "grain", from: "place", color: "ink", density: "low" },
      signature: { kind: "footer_band", use_logo: false, logo_on: "light" },
      mix: { photo_only: 0.5, headline: 0.3, type_led: 0.2 },
      copy: { headline_accent: false, price_style: "inline", cta_on_image: false, sub_above: true },
    },
    posts: [
      { mode: "headline", composition: "inset_frame", headline: "מחמצת שיפון, 36 שעות", sub: "הלחם של השבוע", price: { amount: 24, currency: "ILS" } },
      { mode: "type_led", headline: "פתוחים מ-07:00. התנור כבר חם.", sub: "שעות חדשות" },
      { mode: "photo_only" },
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
      version: 2,
      seed: 77310,
      field: "lingerie",
      direction: {
        feel_he: "עדין ובטוח, כמו מדידה שקטה בחדר עם וילון.",
        world_he: "חנות קטנה ברמת השרון: קטיפה בבורדו, סרט מדידה, אור יום.",
        photo_he: "הבגד על בד או על ספסל, אור חלון רך, בלי צילומי גוף מקרוב.",
        text_he: "שורה אחת באותיות דקות, או בלי טקסט בכלל.",
        never_he: ["צילומי גוף חושפניים", "מבצעים באדום", "תחרה מצוירת כקישוט", "יותר מחמש מילים על התמונה"],
      },
      type: { display: "bellefair", display_weight: 400, text: "assistant", text_weight: 300, headline_case: "sentence", scale: "editorial" },
      colors: { ink: "#2b1a21", paper: "#f5eae6", accent: "#7d2e46", accent_2: "#c9a27e", on_photo: "#f7ede9", tint: "#ebd8d2" },
      colors_source: { ink: "logo", paper: "site", accent: "logo", accent_2: "site", on_photo: "derived", tint: "derived" },
      compositions: ["full_bleed", "inset_frame", "split"],
      motif: { kind: "rule", from: "logo", color: "accent", density: "low" },
      signature: { kind: "corner_mark", use_logo: true, logo_on: "light" },
      mix: { photo_only: 0.6, headline: 0.35, type_led: 0.05 },
      copy: { headline_accent: false, price_style: "inline", cta_on_image: false },
    },
    posts: [
      { mode: "headline", composition: "full_bleed", headline: "המידה שלכן, בלי לנחש" },
      { mode: "photo_only" },
      { mode: "headline", composition: "inset_frame", headline: "קולקציית סתיו בצבע אבקה" },
    ],
  },
  {
    id: "beit-neshima",
    name: "בית נשימה",
    field_he: "סטודיו ליוגה · קריית טבעון",
    photo: "/examples/yoga.webp",
    dna: {
      version: 2,
      seed: 52003,
      field: "yoga",
      direction: {
        feel_he: "רגוע ופתוח, כמו נשימה ארוכה בבוקר.",
        world_he: "הסטודיו בקריית טבעון: חלון מקושת, רצפת עץ, עציצים על אדן החלון.",
        photo_he: "החדר באור בוקר, מזרנים וצמחים. אנשים רק מרחוק.",
        text_he: "משפט קצר אחד, והרבה מקום ריק סביבו.",
        never_he: ["תנוחות מאתגרות בתמונה", "צבעי ניאון", "מילים כמו 'אנרגיה' ו'שחרור'", "קישוטים"],
      },
      type: { display: "david-libre", display_weight: 500, text: "rubik", text_weight: 300, headline_case: "sentence", scale: "medium" },
      colors: { ink: "#2f3a2c", paper: "#efebe0", accent: "#a8643c", accent_2: "#7c8c6a", on_photo: "#fbf8f0", tint: "#dde2d2" },
      colors_source: { ink: "site", paper: "site", accent: "site", accent_2: "site", on_photo: "derived", tint: "derived" },
      compositions: ["arch_window", "full_bleed", "type_led"],
      motif: { kind: "none" },
      signature: { kind: "name_only", use_logo: false, logo_on: "light" },
      mix: { photo_only: 0.4, headline: 0.4, type_led: 0.2 },
      copy: { headline_accent: false, price_style: "inline", cta_on_image: false },
    },
    posts: [
      { mode: "headline", composition: "arch_window", headline: "שיעור בוקר לפני העבודה", sub: "ב׳ ו-ה׳, 07:00" },
      { mode: "headline", composition: "full_bleed", headline: "לנשום לאט" },
      { mode: "type_led", headline: "השיעור הראשון עלינו", sub: "למתחילים" },
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
      version: 2,
      seed: 10442,
      field: "accounting",
      direction: {
        feel_he: "ברור וענייני, כמו רואה חשבון שמסביר בלי ז׳רגון.",
        world_he: "משרד קטן בפתח תקווה: כחול עמוק, מרקר צהוב, תיקים מסודרים.",
        photo_he: "שולחן עבודה מסודר באור יום, בלי אנשים בחליפות.",
        text_he: "משפט אחד שאפשר לפעול לפיו. התאריך או המספר בצהוב.",
        never_he: ["לחיצות ידיים מצילומי סטוק", "גרפים מומצאים", "אותיות קטנות עם תנאים", "אימוג׳ים"],
      },
      type: { display: "secular-one", display_weight: 400, text: "assistant", text_weight: 400, headline_case: "sentence", scale: "large" },
      colors: { ink: "#102a43", paper: "#f7f7f2", accent: "#e8b931", accent_2: "#2c5282", on_photo: "#102a43", tint: "#fff3c4" },
      colors_source: { ink: "logo", paper: "site", accent: "logo", accent_2: "site", on_photo: "derived", tint: "derived" },
      compositions: ["type_led", "split", "full_bleed"],
      motif: { kind: "none" },
      signature: { kind: "corner_mark", use_logo: true, logo_on: "light" },
      mix: { photo_only: 0.2, headline: 0.4, type_led: 0.4 },
      copy: { headline_accent: true, price_style: "inline", cta_on_image: false },
    },
    posts: [
      { mode: "type_led", headline: "הדוח השנתי נסגר ב-31.5", sub: "תזכורת לעצמאים" },
      { mode: "headline", composition: "full_bleed", headline: "3 הוצאות שמותר לכם לקזז" },
      { mode: "headline", composition: "split", headline: "פגישת היכרות, בלי עלות" },
    ],
  },
  {
    id: "shaked",
    name: "סטודיו שקד",
    field_he: "טיפוח וקוסמטיקה · חיפה",
    photo: "/examples/beauty.webp",
    dna: {
      version: 2,
      seed: 66019,
      field: "beauty",
      direction: {
        feel_he: "טבעי ושקט, כמו שעה של טיפול בלי טלפון.",
        world_he: "סטודיו קטן בכרמל: מרווה, שעווה, פשתן וקערות קרמיקה.",
        photo_he: "מלמעלה על השולחן, חומרים טבעיים, אור חלון אפור ורך.",
        text_he: "מילים ספורות באותיות גבוהות וצרות, על פס בצבע מרווה. המחיר כשיש טיפול חדש.",
        never_he: ["תמונות לפני ואחרי", "ורוד מבריק", "הבטחות רפואיות", "טקסט על המוצרים"],
      },
      type: { display: "karantina", display_weight: 700, text: "heebo", text_weight: 300, headline_case: "sentence", scale: "large" },
      colors: { ink: "#1f1d1a", paper: "#ece7df", accent: "#4f5d42", accent_2: "#d8c3a5", on_photo: "#f3eee6", tint: "#dce0d2" },
      colors_source: { ink: "site", paper: "site", accent: "site", accent_2: "site", on_photo: "derived", tint: "derived" },
      compositions: ["split", "inset_frame", "full_bleed"],
      motif: { kind: "none" },
      signature: { kind: "none", use_logo: false, logo_on: "light" },
      mix: { photo_only: 0.5, headline: 0.4, type_led: 0.1 },
      copy: { headline_accent: false, price_style: "inline", cta_on_image: false },
    },
    posts: [
      { mode: "headline", composition: "split", headline: "טיפול פנים עם שמנים מהגליל", price: { amount: 320, currency: "ILS" } },
      { mode: "photo_only" },
      { mode: "headline", composition: "inset_frame", headline: "שעה של שקט באמצע השבוע" },
    ],
  },
  {
    id: "pirchei-habar",
    name: "פרחי הבר",
    field_he: "חנות פרחים · ירושלים",
    photo: "/examples/flowers.webp",
    dna: {
      version: 2,
      seed: 39251,
      field: "florist",
      direction: {
        feel_he: "יד ראשונה מהשוק, כמו זר שנעטף בנייר עיתון.",
        world_he: "חנות קטנה בירושלים: אבן, נייר קראפט, דליים של פרחים.",
        photo_he: "הזר על שולחן עץ ליד קיר אבן, עלי כותרת על השולחן, אור צד.",
        text_he: "כתב יד גדול, מילים ספורות. המחיר רק לזר של שישי.",
        never_he: ["פרחים מפלסטיק", "רקע לבן של קטלוג", "לבבות וקישוטים", "פילטרים כבדים"],
      },
      type: { display: "amatic-sc", display_weight: 700, text: "assistant", text_weight: 500, headline_case: "sentence", scale: "large" },
      colors: { ink: "#2e2a22", paper: "#faf5ec", accent: "#b83a52", accent_2: "#6d8a4e", on_photo: "#fffdf8", tint: "#efe2d2" },
      colors_source: { ink: "site", paper: "site", accent: "site", accent_2: "site", on_photo: "derived", tint: "derived" },
      compositions: ["full_bleed", "inset_frame", "split"],
      motif: { kind: "grain", from: "product", color: "ink", density: "low" },
      signature: { kind: "name_only", use_logo: false, logo_on: "light" },
      mix: { photo_only: 0.6, headline: 0.35, type_led: 0.05 },
      copy: { headline_accent: false, price_style: "inline", cta_on_image: false },
    },
    posts: [
      { mode: "headline", composition: "full_bleed", headline: "זר שישי, ישר מהשוק", price: { amount: 120, currency: "ILS" } },
      { mode: "photo_only", headline: "כלניות." },
      { mode: "headline", composition: "inset_frame", headline: "תגידו את זה עם פרחים" },
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
      version: 2,
      seed: 84420,
      field: "pet_grooming",
      direction: {
        feel_he: "שמח ונקי, כמו כלב שיוצא מהאמבטיה.",
        world_he: "מספרה בראשון לציון: אריחים, מגבות בטורקיז, צהוב של שמש.",
        photo_he: "הכלב בגובה העיניים על השולחן, אור יום.",
        text_he: "משפט קצר ושמח באותיות עגולות. המחיר רק לחבילה.",
        never_he: ["כלבים בתחפושות", "צבעי ניאון", "טקסט על הכלב", "אימוג׳ים של עצמות"],
      },
      type: { display: "rubik", display_weight: 800, text: "varela-round", text_weight: 400, headline_case: "sentence", scale: "large" },
      colors: { ink: "#12324a", paper: "#fff8e8", accent: "#f2b62c", accent_2: "#1e8c8c", on_photo: "#ffffff", tint: "#fdebc0" },
      colors_source: { ink: "site", paper: "site", accent: "logo", accent_2: "logo", on_photo: "derived", tint: "derived" },
      compositions: ["split", "full_bleed", "type_led"],
      motif: { kind: "none" },
      signature: { kind: "corner_mark", use_logo: true, logo_on: "any" },
      mix: { photo_only: 0.4, headline: 0.4, type_led: 0.2 },
      copy: { headline_accent: false, price_style: "inline", cta_on_image: false },
    },
    posts: [
      { mode: "headline", composition: "full_bleed", headline: "הכלב שלכם יחזור מבריק" },
      { mode: "headline", composition: "split", headline: "אמבטיה, פן וחיוך", price: { amount: 180, currency: "ILS" } },
      { mode: "type_led", headline: "התורים לאוגוסט נפתחו", sub: "לכלבים מתולתלים" },
    ],
  },
];
