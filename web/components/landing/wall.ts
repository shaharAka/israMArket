/**
 * The moving wall of posts under the showcase ("עוד דוגמאות").
 *
 * Every business here is FICTIONAL, like the showcase ones: invented names and facts, no
 * real brand, logo or person. The photos were generated with the app's own image service
 * by `api/scripts/generate_landing_examples.py --photos` (the `WALL` list there holds the
 * scenes; keep slug, palette and template in sync with it). The Hebrew is hand-written
 * against web/HEBREW-COPY.md: one headline and one short "why" per card, no numbers.
 */

import type { BrandSwatch } from "@/lib/api";
import type { CardTemplate } from "@/components/CardCanvas";
import { LANDING_EXAMPLES } from "./examples";
import type { LandingCard } from "./cards";

export type WallCard = LandingCard & {
  slug: string;
  typeLabel: string;
  /** One short line: why this post, now. */
  why: string;
};

type Extra = {
  slug: string;
  businessName: string;
  typeLabel: string;
  palette: BrandSwatch[];
  template: CardTemplate;
  headline: string;
  badge: string;
  cta: string;
  why: string;
};

const EXTRAS: Extra[] = [
  {
    slug: "bikes",
    businessName: "שרשרת",
    typeLabel: "תיקון אופניים · תל אביב",
    palette: [
      { hex: "#1d4e89", role: "primary", name: "כחול מוסך" },
      { hex: "#f28c28", role: "accent", name: "כתום" },
      { hex: "#eef2f7", role: "background", name: "אפור בהיר" },
      { hex: "#0f1f33", role: "ink", name: "שמן" },
    ],
    template: "lower_editorial",
    headline: "בלמים, לפני הגשם הראשון",
    badge: "חורף",
    cta: "קובעים תור",
    why: "רוכבים נזכרים בבלמים רק כשהם חורקים בגשם.",
  },
  {
    slug: "flowers",
    businessName: "כלנית",
    typeLabel: "חנות פרחים · ירושלים",
    palette: [
      { hex: "#8c1c2b", role: "primary", name: "כלנית" },
      { hex: "#f3c5c5", role: "accent", name: "ורוד עדין" },
      { hex: "#f8efe9", role: "background", name: "אבן" },
      { hex: "#3a0d14", role: "ink", name: "בורדו" },
    ],
    template: "framed_inset",
    headline: "הכלניות חזרו לשבת",
    badge: "עונת הכלניות",
    cta: "מזמינים לשבת",
    why: "העונה קצרה, ומי שרואה כלניות רוצה אותן השבוע.",
  },
  {
    slug: "grooming",
    businessName: "פרווה ומברשת",
    typeLabel: "טיפוח כלבים · רחובות",
    palette: [
      { hex: "#2f6f73", role: "primary", name: "טורקיז" },
      { hex: "#f2b134", role: "accent", name: "חמנייה" },
      { hex: "#eef5f4", role: "background", name: "מים" },
      { hex: "#143033", role: "ink", name: "ים עמוק" },
    ],
    template: "split_panel",
    headline: "נקי, רך ומוכן לחגים",
    badge: "חנוכה",
    cta: "קובעים תור",
    why: "לפני החגים התורים נגמרים, והפוסט מזכיר לקבוע מוקדם.",
  },
  {
    slug: "breakfast",
    businessName: "מחבת",
    typeLabel: "ארוחות בוקר · באר שבע",
    palette: [
      { hex: "#b33a1f", role: "primary", name: "עגבנייה" },
      { hex: "#f0c05a", role: "accent", name: "חלמון" },
      { hex: "#faf0e6", role: "background", name: "פיתה" },
      { hex: "#3b140a", role: "ink", name: "פלפל שחור" },
    ],
    template: "lower_editorial",
    headline: "שקשוקה של שישי, עד הצהריים",
    badge: "שישי",
    cta: "שומרים שולחן",
    why: "עולה ביום חמישי בערב, כשמתכננים את שישי בבוקר.",
  },
  {
    slug: "nursery",
    businessName: "שתיל",
    typeLabel: "משתלה שכונתית · רעננה",
    palette: [
      { hex: "#3d6b35", role: "primary", name: "עלה" },
      { hex: "#d9c27a", role: "accent", name: "קש" },
      { hex: "#f1f4ea", role: "background", name: "ניצן" },
      { hex: "#1a2e16", role: "ink", name: "אדמה" },
    ],
    template: "cover_type",
    headline: "תבלינים לאדן החלון",
    badge: "חורף",
    cta: "באים לבחור",
    why: "בחורף שותלים בבית, והפוסט עונה על ״מה גדל בצל״.",
  },
  {
    slug: "carpentry",
    businessName: "נסורת",
    typeLabel: "נגרות בהזמנה · יקנעם",
    palette: [
      { hex: "#5b4632", role: "primary", name: "אגוז" },
      { hex: "#d98c4a", role: "accent", name: "אלון" },
      { hex: "#f5efe7", role: "background", name: "נסורת" },
      { hex: "#241a11", role: "ink", name: "פחם" },
    ],
    template: "framed_inset",
    headline: "שולחן אחד, בדיוק במידה שלכם",
    badge: "",
    cta: "שולחים מידות",
    why: "למי שלא מוצא שולחן לסלון קטן באף חנות.",
  },
  {
    slug: "soups",
    businessName: "סיר על האש",
    typeLabel: "מרקים במשלוח · חולון",
    palette: [
      { hex: "#7a3b1d", role: "primary", name: "קינמון" },
      { hex: "#e8b04a", role: "accent", name: "כורכום" },
      { hex: "#fbf1e4", role: "background", name: "עדשים" },
      { hex: "#2e150a", role: "ink", name: "קלוי" },
    ],
    template: "promo_ribbon",
    headline: "המרק של השבוע כבר על האש",
    badge: "חדש השבוע",
    cta: "מזמינים לערב",
    why: "בערבים הקרים מזמינים חם, והתפריט מתחלף כל שבוע.",
  },
  {
    slug: "winery",
    businessName: "גפן בהר",
    typeLabel: "יקב בוטיק · הרי יהודה",
    palette: [
      { hex: "#5a1e2c", role: "primary", name: "יין" },
      { hex: "#c9a15a", role: "accent", name: "חבית" },
      { hex: "#f6eee8", role: "background", name: "פקק" },
      { hex: "#240b12", role: "ink", name: "מרתף" },
    ],
    template: "cover_type",
    headline: "טעימות בסוף השבוע, בין החביות",
    badge: "סופ״ש",
    cta: "שומרים מקום",
    why: "זוגות מתכננים סופ״ש קרוב, והפוסט מראה איפה יושבים.",
  },
];

/** A shorter "why" for the showcase businesses than the showcase itself carries. */
const SHOWCASE_WHY: Record<string, string> = {
  bakery: "שבועיים לפני חנוכה, כשמזמינים לגן.",
  lingerie: "לפני בלאק פריידי, מזמינים למדוד קודם.",
  beauty: "עם החימום הראשון העור מתייבש.",
  accountant: "בדצמבר כל עצמאי חדש שואל מה עוד מוכר.",
  yoga: "בינואר מתחילים שגרה חדשה.",
  ceramics: "ימים לפני ההשקה, ידיים על האובניים.",
  interior: "אחרי החגים כולם הרגישו כמה הסלון צפוף.",
  cabins: "זוגות מזמינים סופ״ש של חורף מראש.",
};

const extraCards: WallCard[] = EXTRAS.map((extra) => ({
  ...extra,
  image: `/examples/${extra.slug}.webp`,
}));

const showcaseCards: WallCard[] = LANDING_EXAMPLES.map((example) => ({
  slug: example.slug,
  businessName: example.businessName,
  typeLabel: `${example.pill} · ${example.city}`,
  palette: example.palette,
  template: example.template,
  image: example.image,
  headline: example.post.overlayHeadline,
  badge: example.post.overlayBadge,
  cta: example.post.cta,
  audience: example.why.audience,
  why: SHOWCASE_WHY[example.slug] ?? example.why.timing,
}));

/** Alternate new businesses with showcase ones, so neither row repeats a neighbour. */
function interleave(a: WallCard[], b: WallCard[]): WallCard[] {
  return a.flatMap((card, index) => (b[index] ? [card, b[index]] : [card]));
}

const all = interleave(extraCards, showcaseCards);

/** Pairs alternate between the rows, so each row mixes new and showcase businesses. */
export const WALL_ROWS: [WallCard[], WallCard[]] = [
  all.filter((_, index) => Math.floor(index / 2) % 2 === 0),
  all.filter((_, index) => Math.floor(index / 2) % 2 === 1),
];
