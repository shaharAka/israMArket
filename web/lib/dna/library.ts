/**
 * The Design DNA library — every key the renderer knows how to draw.
 *
 * This is the renderer's half of the `brand_dna` contract (docs/design-dna.md). The server
 * generates a DNA per business by picking keys from this library only, and serves the same
 * list at `GET /brand/dna/library`; `DNA_LIBRARY` below is what that endpoint mirrors. A key
 * the renderer does not know is never drawn: `resolveDna` falls back to a known one.
 *
 * Fonts are a fixed set of Google Fonts (OFL) with Hebrew. `lib/dna/fonts.ts` declares each
 * one with next/font (`preload: false`), so a page only downloads the families its posts
 * actually use — normally the business's two.
 */

export const FONT_KEYS = [
  "frank-ruhl-libre",
  "noto-serif-hebrew",
  "david-libre",
  "bellefair",
  "suez-one",
  "secular-one",
  "rubik",
  "assistant",
  "ibm-plex-sans-hebrew",
  "heebo",
  "varela-round",
  "karantina",
  "amatic-sc",
  "playpen-sans-hebrew",
] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export const COMPOSITION_KEYS = [
  "full_bleed",
  "inset_frame",
  "split",
  "type_led",
  "stacked_bands",
  "corner_tab",
  "arch_window",
  "circle_crop",
  "ticket",
  "collage_grid",
  "handwritten_note",
  "editorial_column",
] as const;
export type CompositionKey = (typeof COMPOSITION_KEYS)[number];

export const MOTIF_KEYS = [
  "scalloped_edge",
  "stripes",
  "arches",
  "dots",
  "grain",
  "stamp",
  "underline",
  "tape",
  "thread",
] as const;
export type MotifKey = (typeof MOTIF_KEYS)[number];

export const SIGNATURE_KEYS = ["corner_mark", "footer_band", "stamp", "tab"] as const;
export type SignatureKey = (typeof SIGNATURE_KEYS)[number];

export const PRICE_STYLES = ["tag", "inline", "circle"] as const;
export type PriceStyle = (typeof PRICE_STYLES)[number];

export const CTA_STYLES = ["underline", "pill", "arrow"] as const;
export type CtaStyle = (typeof CTA_STYLES)[number];

export const TYPE_SCALES = ["large", "medium", "editorial"] as const;
export type TypeScale = (typeof TYPE_SCALES)[number];

/**
 * Hebrew has no letter case: `sentence` and `upper` apply to Latin letters only (a brand
 * name, "SALE"). `accent` is a renderer extension the server does not send yet (a contract
 * proposal): the headline's key phrase in the accent colour.
 */
export const HEADLINE_CASES = ["sentence", "upper", "accent"] as const;
export type HeadlineCase = (typeof HEADLINE_CASES)[number];

export const COLOR_ROLES = ["ink", "paper", "accent", "accent_2", "on_photo", "tint"] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

export const MOTIF_DENSITIES = ["low", "mid"] as const;
export type MotifDensity = (typeof MOTIF_DENSITIES)[number];

/** Logical positions: `start` is the reading start, the right edge in Hebrew. */
export const TEXT_POSITIONS = ["top", "center", "bottom", "start", "end"] as const;
export type TextPosition = (typeof TEXT_POSITIONS)[number];

/* ------------------------------------------------------------------ */
/* The contract types                                                  */
/* ------------------------------------------------------------------ */

/** `brand_dna`, stored on the business (docs/design-dna.md, "Contract"). Versioned. */
export type BrandDna = {
  version: number;
  seed?: number;
  created_at?: string;
  field?: string;
  type: {
    display: FontKey | string;
    display_weight?: number;
    text: FontKey | string;
    text_weight?: number;
    headline_case?: HeadlineCase | string;
    scale?: TypeScale | string;
  };
  colors: {
    ink: string;
    paper: string;
    accent: string;
    accent_2?: string;
    on_photo?: string;
    tint?: string;
  };
  /** The business's composition set (3–4), rotated across its posts. */
  compositions: (CompositionKey | string)[];
  motif: { kind: MotifKey | string; color?: ColorRole | string; density?: MotifDensity | string };
  signature: {
    kind: SignatureKey | string;
    use_logo?: boolean;
    /**
     * Renderer extension (contract question): a same-origin copy of the logo, so the PNG
     * export can inline it. Falls back to `brand_language.logo_url`.
     */
    logo_url?: string;
  };
  photo?: {
    grade?: string;
    light?: string;
    angle?: string;
    props?: string[];
    background?: string;
    never?: string[];
  };
  copy?: { price_style?: PriceStyle | string; cta_style?: CtaStyle | string };
  rationale_he?: string;
  distance_checked_against?: number;
  /** `model` or `local` (built without the model). */
  source?: string;
  /** Genes the owner set (`type`, `motif`, `colors`), plus `all` once they kept the style. */
  locked?: string[];
};

/** `PUT /brand/dna`: the genes the owner changes, or `keep` ("לשמור"). */
export type BrandDnaEdit = {
  type?: { display?: string; text?: string; display_weight?: number; text_weight?: number };
  motif?: { kind?: string; color?: string; density?: string };
  colors?: Partial<Record<ColorRole, string>>;
  keep?: boolean;
};

/**
 * The server sends the photo's frame (`4:5` for the feed, `9:16` for reels and stories).
 * The renderer also takes a focal point (`x`/`y` 0–1, `zoom` ≥ 1) or a keyword (`top`,
 * `bottom`, `start`, `end`, `close`) — an extension, for a crop the owner adjusts later.
 */
export type PhotoCrop = { x?: number; y?: number; zoom?: number } | string;

/** `design` on a post: which of the DNA's compositions it uses, and how. */
export type PostDesign = {
  composition?: CompositionKey | string;
  crop?: PhotoCrop;
  text_position?: TextPosition | string;
};

/* ------------------------------------------------------------------ */
/* Library metadata                                                    */
/* ------------------------------------------------------------------ */

export type FontCategory = "serif" | "slab" | "sans" | "rounded" | "display" | "hand";

export type FontMeta = {
  key: FontKey;
  family: string;
  label_he: string;
  category: FontCategory;
  /** Static weights available; a variable font lists the range it covers. */
  weights: number[];
  variable: boolean;
  /** Which role the font may play. Every font can be a display face; few read as body. */
  roles: ("display" | "text")[];
  /**
   * Average advance of a Hebrew letter, in em, measured in Chrome (canvas measureText over a
   * Hebrew sentence, normalised to a regular weight; `fitHeadline` adds width for heavy cuts).
   * The headline fit uses it to pick a size before the browser lays the text out, so the
   * preview, the thumbnails and the export all agree without a measuring pass.
   */
  widthEm: number;
  /** Comfortable line height for a multi-line display setting. */
  leading: number;
};

export const FONT_LIBRARY: Record<FontKey, FontMeta> = {
  "frank-ruhl-libre": {
    key: "frank-ruhl-libre",
    family: "Frank Ruhl Libre",
    label_he: "פרנק רוהל",
    category: "serif",
    weights: [300, 400, 500, 600, 700, 800, 900],
    variable: true,
    roles: ["display", "text"],
    widthEm: 0.45,
    leading: 1.08,
  },
  "noto-serif-hebrew": {
    key: "noto-serif-hebrew",
    family: "Noto Serif Hebrew",
    label_he: "נוטו סריף",
    category: "serif",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    variable: true,
    roles: ["display", "text"],
    widthEm: 0.49,
    leading: 1.12,
  },
  "david-libre": {
    key: "david-libre",
    family: "David Libre",
    label_he: "דוד",
    category: "serif",
    weights: [400, 500, 700],
    variable: false,
    roles: ["display", "text"],
    widthEm: 0.49,
    leading: 1.1,
  },
  bellefair: {
    key: "bellefair",
    family: "Bellefair",
    label_he: "בלפייר",
    category: "serif",
    weights: [400],
    variable: false,
    roles: ["display"],
    widthEm: 0.38,
    leading: 1.08,
  },
  "suez-one": {
    key: "suez-one",
    family: "Suez One",
    label_he: "סואץ",
    category: "slab",
    weights: [400],
    variable: false,
    roles: ["display"],
    widthEm: 0.5,
    leading: 1.06,
  },
  "secular-one": {
    key: "secular-one",
    family: "Secular One",
    label_he: "סקולר",
    category: "sans",
    weights: [400],
    variable: false,
    roles: ["display"],
    widthEm: 0.51,
    leading: 1.04,
  },
  rubik: {
    key: "rubik",
    family: "Rubik",
    label_he: "רוביק",
    category: "rounded",
    weights: [300, 400, 500, 600, 700, 800, 900],
    variable: true,
    roles: ["display", "text"],
    widthEm: 0.51,
    leading: 1.06,
  },
  assistant: {
    key: "assistant",
    family: "Assistant",
    label_he: "אסיסטנט",
    category: "sans",
    weights: [200, 300, 400, 500, 600, 700, 800],
    variable: true,
    roles: ["display", "text"],
    widthEm: 0.47,
    leading: 1.06,
  },
  "ibm-plex-sans-hebrew": {
    key: "ibm-plex-sans-hebrew",
    family: "IBM Plex Sans Hebrew",
    label_he: "פלקס",
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700],
    variable: false,
    roles: ["display", "text"],
    widthEm: 0.51,
    leading: 1.1,
  },
  heebo: {
    key: "heebo",
    family: "Heebo",
    label_he: "חיבו",
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    variable: true,
    roles: ["display", "text"],
    widthEm: 0.51,
    leading: 1.04,
  },
  "varela-round": {
    key: "varela-round",
    family: "Varela Round",
    label_he: "ורלה עגול",
    category: "rounded",
    weights: [400],
    variable: false,
    roles: ["display", "text"],
    widthEm: 0.54,
    leading: 1.1,
  },
  karantina: {
    key: "karantina",
    family: "Karantina",
    label_he: "קרנטינה",
    category: "display",
    weights: [300, 400, 700],
    variable: false,
    roles: ["display"],
    widthEm: 0.32,
    leading: 0.92,
  },
  "amatic-sc": {
    key: "amatic-sc",
    family: "Amatic SC",
    label_he: "אמטיק",
    category: "hand",
    weights: [400, 700],
    variable: false,
    roles: ["display"],
    widthEm: 0.3,
    leading: 1.0,
  },
  "playpen-sans-hebrew": {
    key: "playpen-sans-hebrew",
    family: "Playpen Sans Hebrew",
    label_he: "פלייפן",
    category: "hand",
    weights: [100, 200, 300, 400, 500, 600, 700, 800],
    variable: true,
    roles: ["display", "text"],
    widthEm: 0.51,
    leading: 1.12,
  },
};

export type CompositionMeta = {
  key: CompositionKey;
  label_he: string;
  desc_he: string;
  /** `none`: the composition draws no photograph at all (a typographic post). */
  photo: "required" | "none";
  /** Where its text may sit (the server's list; the first is the default). */
  text_positions: TextPosition[];
  /** The photo frames it is drawn for. `editorial_column` is feed-only. */
  crops: ("4:5" | "9:16")[];
};

const BOTH: ("4:5" | "9:16")[] = ["4:5", "9:16"];

export const COMPOSITION_LIBRARY: Record<CompositionKey, CompositionMeta> = {
  full_bleed: { key: "full_bleed", label_he: "תמונה מלאה", desc_he: "התמונה על כל הפוסט, הכותרת עליה", photo: "required", text_positions: ["bottom", "top"], crops: BOTH },
  inset_frame: { key: "inset_frame", label_he: "תמונה במסגרת", desc_he: "התמונה ממוסגרת על צבע העסק", photo: "required", text_positions: ["bottom", "top"], crops: BOTH },
  split: { key: "split", label_he: "חצי־חצי", desc_he: "תמונה וטקסט, כל אחד בחלק משלו", photo: "required", text_positions: ["bottom", "top"], crops: BOTH },
  type_led: { key: "type_led", label_he: "טקסט בלבד", desc_he: "בלי תמונה: הכותרת היא העיצוב", photo: "none", text_positions: ["center", "top"], crops: BOTH },
  stacked_bands: { key: "stacked_bands", label_he: "פסים", desc_he: "פס צבע, התמונה, ופס עם הכותרת", photo: "required", text_positions: ["top", "bottom"], crops: BOTH },
  corner_tab: { key: "corner_tab", label_he: "לשונית בפינה", desc_he: "התמונה מלאה, והכותרת על משטח בפינה", photo: "required", text_positions: ["bottom", "top"], crops: BOTH },
  arch_window: { key: "arch_window", label_he: "קשת", desc_he: "התמונה בחלון מקושת", photo: "required", text_positions: ["bottom", "top"], crops: BOTH },
  circle_crop: { key: "circle_crop", label_he: "עיגול", desc_he: "התמונה בעיגול גדול", photo: "required", text_positions: ["bottom", "top"], crops: BOTH },
  ticket: { key: "ticket", label_he: "כרטיס", desc_he: "כמו כרטיס או שובר, עם ספח", photo: "required", text_positions: ["bottom"], crops: BOTH },
  collage_grid: { key: "collage_grid", label_he: "קולאז׳", desc_he: "כמה חיתוכים של התמונה ומשבצת טקסט", photo: "required", text_positions: ["center", "bottom"], crops: BOTH },
  handwritten_note: { key: "handwritten_note", label_he: "פתק", desc_he: "פתק מודבק על התמונה", photo: "required", text_positions: ["bottom", "start"], crops: BOTH },
  editorial_column: { key: "editorial_column", label_he: "עמוד מגזין", desc_he: "טור טקסט ליד התמונה, כמו במגזין", photo: "required", text_positions: ["start", "end"], crops: ["4:5"] },
};

export const MOTIF_LIBRARY: Record<MotifKey, { key: MotifKey; label_he: string }> = {
  scalloped_edge: { key: "scalloped_edge", label_he: "שוליים מסולסלים" },
  stripes: { key: "stripes", label_he: "פסים" },
  arches: { key: "arches", label_he: "קשתות" },
  dots: { key: "dots", label_he: "נקודות" },
  grain: { key: "grain", label_he: "גרעיניות" },
  stamp: { key: "stamp", label_he: "חותמת" },
  underline: { key: "underline", label_he: "קו מתחת" },
  tape: { key: "tape", label_he: "סלוטייפ" },
  thread: { key: "thread", label_he: "תפר" },
};

export const SIGNATURE_LIBRARY: Record<SignatureKey, { key: SignatureKey; label_he: string }> = {
  corner_mark: { key: "corner_mark", label_he: "סימן בפינה" },
  footer_band: { key: "footer_band", label_he: "פס תחתון" },
  stamp: { key: "stamp", label_he: "חותמת" },
  tab: { key: "tab", label_he: "לשונית" },
};

export const COLOR_ROLE_LABEL: Record<ColorRole, string> = {
  ink: "טקסט",
  paper: "רקע",
  accent: "הדגשה",
  accent_2: "הדגשה שנייה",
  on_photo: "טקסט על תמונה",
  tint: "גוון רך",
};

/**
 * `GET /brand/dna/library` — what the server may pick from (api/app/services/dna_library.py,
 * `library_payload`). The demo answers with `DNA_LIBRARY`, built from the tables above.
 */
export type DnaLibrary = {
  version: number;
  fonts: { key: FontKey; family: string; category: FontCategory; weights: number[]; roles: ("display" | "text")[]; google_fonts: string }[];
  compositions: { key: CompositionKey; photo: boolean; text_positions: TextPosition[]; crops: string[]; label_he: string }[];
  motifs: { key: MotifKey; label_he: string }[];
  signatures: { key: SignatureKey; label_he: string }[];
  enums: {
    type_scale: TypeScale[];
    headline_case: string[];
    price_style: PriceStyle[];
    cta_style: CtaStyle[];
    motif_color: string[];
    motif_density: MotifDensity[];
    color_roles: ColorRole[];
    text_position: TextPosition[];
    crop: string[];
  };
  legacy_overlay_theme: Record<string, { composition: CompositionKey; text_position: TextPosition }>;
};

export const DNA_LIBRARY_VERSION = 1;

/** The motif colours a DNA may name (a role, never a hex). */
export const MOTIF_COLORS = ["accent", "accent_2", "ink", "tint"] as const;

export const DNA_LIBRARY: DnaLibrary = {
  version: DNA_LIBRARY_VERSION,
  fonts: FONT_KEYS.map((key) => {
    const f = FONT_LIBRARY[key];
    return {
      key,
      family: f.family,
      category: f.category,
      weights: f.weights,
      roles: f.roles,
      google_fonts: `${f.family.replace(/ /g, "+")}:wght@${f.weights.join(";")}`,
    };
  }),
  compositions: COMPOSITION_KEYS.map((key) => {
    const c = COMPOSITION_LIBRARY[key];
    return { key, photo: c.photo === "required", text_positions: c.text_positions, crops: c.crops, label_he: c.label_he };
  }),
  motifs: MOTIF_KEYS.map((key) => ({ key, label_he: MOTIF_LIBRARY[key].label_he })),
  signatures: SIGNATURE_KEYS.map((key) => ({ key, label_he: SIGNATURE_LIBRARY[key].label_he })),
  enums: {
    type_scale: [...TYPE_SCALES],
    headline_case: ["sentence", "upper"],
    price_style: [...PRICE_STYLES],
    cta_style: [...CTA_STYLES],
    motif_color: [...MOTIF_COLORS],
    motif_density: [...MOTIF_DENSITIES],
    color_roles: [...COLOR_ROLES],
    text_position: [...TEXT_POSITIONS],
    crop: ["4:5", "9:16"],
  },
  legacy_overlay_theme: {
    lower_editorial: { composition: "full_bleed", text_position: "bottom" },
    split_panel: { composition: "split", text_position: "bottom" },
    framed_inset: { composition: "inset_frame", text_position: "bottom" },
    cover_type: { composition: "full_bleed", text_position: "top" },
    promo_ribbon: { composition: "stacked_bands", text_position: "top" },
    type_hero: { composition: "type_led", text_position: "center" },
    ink_pill: { composition: "full_bleed", text_position: "bottom" },
    minimal_text: { composition: "full_bleed", text_position: "top" },
    paper_badge: { composition: "inset_frame", text_position: "bottom" },
    frosted_glass: { composition: "split", text_position: "bottom" },
    accent_banner: { composition: "stacked_bands", text_position: "top" },
  },
};

function member<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

export const isFontKey = (v: unknown): v is FontKey => member(FONT_KEYS, v);
export const isCompositionKey = (v: unknown): v is CompositionKey => member(COMPOSITION_KEYS, v);
export const isMotifKey = (v: unknown): v is MotifKey => member(MOTIF_KEYS, v);
export const isSignatureKey = (v: unknown): v is SignatureKey => member(SIGNATURE_KEYS, v);
export const isPriceStyle = (v: unknown): v is PriceStyle => member(PRICE_STYLES, v);
export const isCtaStyle = (v: unknown): v is CtaStyle => member(CTA_STYLES, v);
export const isTypeScale = (v: unknown): v is TypeScale => member(TYPE_SCALES, v);
export const isHeadlineCase = (v: unknown): v is HeadlineCase => member(HEADLINE_CASES, v);
export const isColorRole = (v: unknown): v is ColorRole => member(COLOR_ROLES, v);
export const isTextPosition = (v: unknown): v is TextPosition => member(TEXT_POSITIONS, v);

/** Whether a composition draws the post's photograph. */
export function compositionDrawsPhoto(key: string | null | undefined): boolean {
  return !(isCompositionKey(key) && COMPOSITION_LIBRARY[key].photo === "none");
}
