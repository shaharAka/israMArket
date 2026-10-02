/**
 * The Design DNA library — every key the renderer knows how to draw.
 *
 * This is the renderer's half of the `brand_dna` contract (docs/design-dna.md, "Contract"
 * and "Revision 1 … Contract additions (v2)"). The server picks keys from this library only
 * and serves the same list at `GET /brand/dna/library`; `DNA_LIBRARY` below is what that
 * endpoint mirrors. A key the renderer does not know is never drawn: `resolveDna` maps it to
 * a known one (v1 keys included, see `LEGACY_COMPOSITIONS` and `LEGACY_MOTIFS`).
 *
 * Revision 1 made a style an art direction, not a list of parameters. The keys below are
 * still the renderer's vocabulary, but none of them is ever shown to the owner: the owner
 * sees `direction` (in words) and the posts.
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

/**
 * v2 compositions. Each keeps the product whole: text goes in the photo's empty area or on
 * its own band, never on a box over the subject.
 *
 *   full_bleed   the photo is the post; one line in its empty area
 *   inset_frame  the photo with paper margins, the words on the paper
 *   split        the photo and a band of paper above or below it
 *   type_led     type on the brand's ground, no photo
 *   arch_window  the photo in an arched window (only for a brand whose place has one)
 */
export const COMPOSITION_KEYS = ["full_bleed", "inset_frame", "split", "type_led", "arch_window"] as const;
export type CompositionKey = (typeof COMPOSITION_KEYS)[number];

/**
 * v1 compositions that covered the subject by construction (a ticket or a note over the
 * photo, a collage's text tile, a strip crop), mapped to the v2 composition that keeps the
 * nearest intent. Stored posts and v1 DNAs still resolve.
 */
export const LEGACY_COMPOSITIONS: Record<string, CompositionKey> = {
  ticket: "full_bleed",
  handwritten_note: "full_bleed",
  corner_tab: "full_bleed",
  stacked_bands: "split",
  collage_grid: "inset_frame",
  circle_crop: "inset_frame",
  editorial_column: "inset_frame",
};

/** How much text a post carries on its image (`design.text_mode`). */
export const TEXT_MODES = ["photo_only", "headline", "type_led"] as const;
export type TextMode = (typeof TEXT_MODES)[number];

/**
 * v2 motifs: none, or one quiet element that comes from the brand itself.
 *
 *   none       the default; the post is finished by its margins, type and colour
 *   grain      the texture of the real place (paper, flour, film) on paper grounds
 *   rule       a single fine rule, from the lines of the logo or the place
 *   logo_mark  the logo itself, small, as the post's closing detail
 */
export const MOTIF_KEYS = ["none", "grain", "rule", "logo_mark"] as const;
export type MotifKey = (typeof MOTIF_KEYS)[number];

/** v1 motifs. The generic list ornaments are retired to `none`; two keep a quiet form. */
export const LEGACY_MOTIFS: Record<string, MotifKey> = {
  scalloped_edge: "none",
  stripes: "none",
  arches: "none",
  dots: "none",
  stamp: "none",
  tape: "none",
  thread: "rule",
  underline: "none",
};

export const MOTIF_SOURCES = ["logo", "place", "product"] as const;
export type MotifSource = (typeof MOTIF_SOURCES)[number];

/**
 * v2 signatures. `name_only` sets the business's name in its display face; nothing ever
 * invents a monogram or a badge. v1's `stamp` and `tab` resolve to a corner mark (or the
 * name, when there is no logo).
 */
export const SIGNATURE_KEYS = ["corner_mark", "footer_band", "name_only", "none"] as const;
export type SignatureKey = (typeof SIGNATURE_KEYS)[number];

/** Which ground the logo itself is drawn for. */
export const LOGO_GROUNDS = ["light", "dark", "any"] as const;
export type LogoGround = (typeof LOGO_GROUNDS)[number];

/**
 * How a price is set when it is the message. Both are type, never a sticker:
 *   inline    the amount on its own line under the headline, in the display face
 *   headline  the amount is the headline; the words become the line above it
 * v1's `tag` and `circle` (stickers) read as `inline`.
 */
export const PRICE_STYLES = ["inline", "headline"] as const;
export type PriceStyle = (typeof PRICE_STYLES)[number];

export const TYPE_SCALES = ["large", "medium", "editorial"] as const;
export type TypeScale = (typeof TYPE_SCALES)[number];

/** Hebrew has no letter case: `upper` applies to Latin letters only (a brand name, "SALE"). */
export const HEADLINE_CASES = ["sentence", "upper"] as const;
export type HeadlineCase = (typeof HEADLINE_CASES)[number];

export const COLOR_ROLES = ["ink", "paper", "accent", "accent_2", "on_photo", "tint"] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

export const COLOR_SOURCES = ["logo", "site", "derived"] as const;
export type ColorSource = (typeof COLOR_SOURCES)[number];

export const MOTIF_DENSITIES = ["low", "mid"] as const;
export type MotifDensity = (typeof MOTIF_DENSITIES)[number];

/** Logical positions: `start` is the reading start, the right edge in Hebrew. */
export const TEXT_POSITIONS = ["top", "center", "bottom", "start", "end"] as const;
export type TextPosition = (typeof TEXT_POSITIONS)[number];

/* ------------------------------------------------------------------ */
/* The contract types                                                  */
/* ------------------------------------------------------------------ */

/** A rectangle in 0–1 of the photo (x, y from its top-left corner). */
export type Rect01 = { x: number; y: number; w: number; h: number };
export type Point01 = { x: number; y: number };

/** The owner-facing art direction, in Hebrew (v2). */
export type DnaDirection = {
  /** One sentence for the feeling. The lead on the brand page. */
  feel_he?: string;
  /** The real world it comes from: the place, the materials, the street. */
  world_he?: string;
  /** How its photos look. */
  photo_he?: string;
  /** How text behaves on its posts. */
  text_he?: string;
  /** 3–5 things this brand would never do. */
  never_he?: string[];
};

/** `brand_dna`, stored on the business (docs/design-dna.md, "Contract"). Versioned. */
export type BrandDna = {
  version: number;
  seed?: number;
  created_at?: string;
  field?: string;
  /** v2: the style in words. Replaces `rationale_he` as the main description. */
  direction?: DnaDirection;
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
  /** v2: where each colour was read from. */
  colors_source?: Partial<Record<ColorRole, ColorSource | string>>;
  /** The business's compositions, rotated across its posts (v1 keys still resolve). */
  compositions: (CompositionKey | string)[];
  motif: {
    kind: MotifKey | string;
    /** v2: what the one quiet element comes from. */
    from?: MotifSource | string;
    color?: ColorRole | string;
    density?: MotifDensity | string;
  };
  signature: {
    kind: SignatureKey | string;
    use_logo?: boolean;
    /** A same-origin copy of the logo, so the PNG export can inline it. */
    logo_url?: string;
    /** v2: the ground the logo is drawn for. */
    logo_on?: LogoGround | string;
  };
  /** v2: the share of posts per text mode (fractions, about 1 in total). */
  mix?: { photo_only?: number; headline?: number; type_led?: number };
  photo?: {
    grade?: string;
    light?: string;
    angle?: string;
    props?: string[];
    background?: string;
    never?: string[];
  };
  copy?: {
    /** v2: the headline's key phrase in the accent colour. */
    headline_accent?: boolean;
    price_style?: PriceStyle | string;
    /** v2: always false — the call to action lives in the caption. */
    cta_on_image?: boolean;
    /**
     * Renderer extension (a contract proposal, not sent by the server yet): the short line
     * set above the headline as a small label, instead of under it. Off for most brands.
     */
    sub_above?: boolean;
    /** v1, ignored by the v2 renderer (no call to action on the image). */
    cta_style?: string;
  };
  /** v1's one line for the owner. Shown only when there is no `direction`. */
  rationale_he?: string;
  distance_checked_against?: number;
  /** `model` or `local` (built without the model). */
  source?: string;
  /** Genes the owner set (`type`, `colors`, …), plus `all` once they kept the style. */
  locked?: string[];
};

/** `PUT /brand/dna`: choices in words first, then the owner's own fonts or colours, or `keep`. */
export type BrandDnaEdit = {
  /** v2: "יותר שקט / יותר נועז", "יותר תמונה / יותר טקסט". */
  adjust?: { tone?: "quieter" | "bolder"; text?: "more_photo" | "more_text" };
  type?: { display?: string; text?: string; display_weight?: number; text_weight?: number };
  /** v1 only; the owner no longer picks ornaments. */
  motif?: { kind?: string; color?: string; density?: string };
  colors?: Partial<Record<ColorRole, string>>;
  keep?: boolean;
};

/**
 * The server sends the photo's frame (`4:5` for the feed, `9:16` for reels and stories).
 * The renderer also takes a focal point (`x`/`y` 0–1, `zoom` ≥ 1) or a keyword — kept from
 * v1. v2's `design.focal` is the focal point and wins over this.
 */
export type PhotoCrop = { x?: number; y?: number; zoom?: number } | string;

/** `design` on a post: how it uses the business's DNA. */
export type PostDesign = {
  composition?: CompositionKey | string;
  crop?: PhotoCrop;
  text_position?: TextPosition | string;
  /** v2: photo only, a headline, or type on its own. */
  text_mode?: TextMode | string;
  /** v2: where text may go, 0–1 of the photo (from a vision pass on the chosen photo). */
  safe_area?: Rect01 | null;
  /** v2: the subject's centre, 0–1 of the photo. Crops keep it in frame. */
  focal?: Point01 | null;
};

/** v2: a price on the post, when the plan's offer has one. */
export type PostPrice = { amount: number | string; currency?: string; note?: string };

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
   * Hebrew sentence, normalised to a regular weight; the fit adds width for heavy cuts).
   * The layout uses it to size and break text before the browser lays it out, so the
   * preview, the thumbnails and the export all agree without a measuring pass.
   */
  widthEm: number;
  /** Comfortable line height for a multi-line display setting. */
  leading: number;
};

export const FONT_LIBRARY: Record<FontKey, FontMeta> = {
  "frank-ruhl-libre": { key: "frank-ruhl-libre", family: "Frank Ruhl Libre", label_he: "פרנק רוהל", category: "serif", weights: [300, 400, 500, 600, 700, 800, 900], variable: true, roles: ["display", "text"], widthEm: 0.45, leading: 1.08 },
  "noto-serif-hebrew": { key: "noto-serif-hebrew", family: "Noto Serif Hebrew", label_he: "נוטו סריף", category: "serif", weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], variable: true, roles: ["display", "text"], widthEm: 0.49, leading: 1.12 },
  "david-libre": { key: "david-libre", family: "David Libre", label_he: "דוד", category: "serif", weights: [400, 500, 700], variable: false, roles: ["display", "text"], widthEm: 0.49, leading: 1.1 },
  bellefair: { key: "bellefair", family: "Bellefair", label_he: "בלפייר", category: "serif", weights: [400], variable: false, roles: ["display"], widthEm: 0.38, leading: 1.08 },
  "suez-one": { key: "suez-one", family: "Suez One", label_he: "סואץ", category: "slab", weights: [400], variable: false, roles: ["display"], widthEm: 0.5, leading: 1.06 },
  "secular-one": { key: "secular-one", family: "Secular One", label_he: "סקולר", category: "sans", weights: [400], variable: false, roles: ["display"], widthEm: 0.51, leading: 1.04 },
  rubik: { key: "rubik", family: "Rubik", label_he: "רוביק", category: "rounded", weights: [300, 400, 500, 600, 700, 800, 900], variable: true, roles: ["display", "text"], widthEm: 0.51, leading: 1.06 },
  assistant: { key: "assistant", family: "Assistant", label_he: "אסיסטנט", category: "sans", weights: [200, 300, 400, 500, 600, 700, 800], variable: true, roles: ["display", "text"], widthEm: 0.47, leading: 1.06 },
  "ibm-plex-sans-hebrew": { key: "ibm-plex-sans-hebrew", family: "IBM Plex Sans Hebrew", label_he: "פלקס", category: "sans", weights: [100, 200, 300, 400, 500, 600, 700], variable: false, roles: ["display", "text"], widthEm: 0.51, leading: 1.1 },
  heebo: { key: "heebo", family: "Heebo", label_he: "חיבו", category: "sans", weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], variable: true, roles: ["display", "text"], widthEm: 0.51, leading: 1.04 },
  "varela-round": { key: "varela-round", family: "Varela Round", label_he: "ורלה עגול", category: "rounded", weights: [400], variable: false, roles: ["display", "text"], widthEm: 0.54, leading: 1.1 },
  karantina: { key: "karantina", family: "Karantina", label_he: "קרנטינה", category: "display", weights: [300, 400, 700], variable: false, roles: ["display"], widthEm: 0.32, leading: 0.92 },
  "amatic-sc": { key: "amatic-sc", family: "Amatic SC", label_he: "אמטיק", category: "hand", weights: [400, 700], variable: false, roles: ["display"], widthEm: 0.3, leading: 1.0 },
  "playpen-sans-hebrew": { key: "playpen-sans-hebrew", family: "Playpen Sans Hebrew", label_he: "פלייפן", category: "hand", weights: [100, 200, 300, 400, 500, 600, 700, 800], variable: true, roles: ["display", "text"], widthEm: 0.51, leading: 1.12 },
};

export type CompositionMeta = {
  key: CompositionKey;
  /** Whether the composition draws the post's photograph. */
  photo: "required" | "none";
  /** Where its text may sit (the first is the default). */
  text_positions: TextPosition[];
  /** The photo frames it is drawn for. */
  crops: ("4:5" | "9:16")[];
};

const BOTH: ("4:5" | "9:16")[] = ["4:5", "9:16"];

export const COMPOSITION_LIBRARY: Record<CompositionKey, CompositionMeta> = {
  full_bleed: { key: "full_bleed", photo: "required", text_positions: ["bottom", "top", "center"], crops: BOTH },
  inset_frame: { key: "inset_frame", photo: "required", text_positions: ["bottom", "top"], crops: BOTH },
  split: { key: "split", photo: "required", text_positions: ["bottom", "top"], crops: BOTH },
  type_led: { key: "type_led", photo: "none", text_positions: ["center", "top", "bottom"], crops: BOTH },
  arch_window: { key: "arch_window", photo: "required", text_positions: ["bottom", "top"], crops: BOTH },
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
  compositions: { key: CompositionKey; photo: boolean; text_positions: TextPosition[]; crops: string[] }[];
  motifs: MotifKey[];
  signatures: SignatureKey[];
  enums: {
    type_scale: TypeScale[];
    headline_case: string[];
    price_style: PriceStyle[];
    text_mode: TextMode[];
    motif_from: MotifSource[];
    motif_color: string[];
    motif_density: MotifDensity[];
    logo_on: LogoGround[];
    color_roles: ColorRole[];
    color_source: ColorSource[];
    text_position: TextPosition[];
    crop: string[];
  };
  /** v1 keys and the v2 key each one is drawn as. */
  legacy: { compositions: Record<string, CompositionKey>; motifs: Record<string, MotifKey>; signatures: Record<string, SignatureKey> };
  legacy_overlay_theme: Record<string, { composition: CompositionKey; text_position: TextPosition }>;
  /** What the renderer enforces, so the server can check copy before it reaches a post. */
  rules: { min_text_ratio: number; min_headline_ratio: number; headline_max_words: number };
};

export const DNA_LIBRARY_VERSION = 2;

/** The motif colours a DNA may name (a role, never a hex). */
export const MOTIF_COLORS = ["accent", "accent_2", "ink", "tint"] as const;

/** Smallest text on the image, as a share of the card's width (≈35px at 1080). */
export const MIN_TEXT_RATIO = 0.032;
/** Smallest headline, as a share of the card's width (≈76px at 1080). */
export const MIN_HEADLINE_RATIO = 0.07;
export const HEADLINE_MAX_WORDS = 6;

export const DNA_LIBRARY: DnaLibrary = {
  version: DNA_LIBRARY_VERSION,
  fonts: FONT_KEYS.map((key) => {
    const f = FONT_LIBRARY[key];
    return { key, family: f.family, category: f.category, weights: f.weights, roles: f.roles, google_fonts: `${f.family.replace(/ /g, "+")}:wght@${f.weights.join(";")}` };
  }),
  compositions: COMPOSITION_KEYS.map((key) => {
    const c = COMPOSITION_LIBRARY[key];
    return { key, photo: c.photo === "required", text_positions: c.text_positions, crops: c.crops };
  }),
  motifs: [...MOTIF_KEYS],
  signatures: [...SIGNATURE_KEYS],
  enums: {
    type_scale: [...TYPE_SCALES],
    headline_case: [...HEADLINE_CASES],
    price_style: [...PRICE_STYLES],
    text_mode: [...TEXT_MODES],
    motif_from: [...MOTIF_SOURCES],
    motif_color: [...MOTIF_COLORS],
    motif_density: [...MOTIF_DENSITIES],
    logo_on: [...LOGO_GROUNDS],
    color_roles: [...COLOR_ROLES],
    color_source: [...COLOR_SOURCES],
    text_position: [...TEXT_POSITIONS],
    crop: ["4:5", "9:16"],
  },
  legacy: { compositions: LEGACY_COMPOSITIONS, motifs: LEGACY_MOTIFS, signatures: { stamp: "corner_mark", tab: "corner_mark" } },
  legacy_overlay_theme: {
    lower_editorial: { composition: "full_bleed", text_position: "bottom" },
    split_panel: { composition: "split", text_position: "bottom" },
    framed_inset: { composition: "inset_frame", text_position: "bottom" },
    cover_type: { composition: "full_bleed", text_position: "top" },
    promo_ribbon: { composition: "split", text_position: "top" },
    type_hero: { composition: "type_led", text_position: "center" },
    ink_pill: { composition: "full_bleed", text_position: "bottom" },
    minimal_text: { composition: "full_bleed", text_position: "top" },
    paper_badge: { composition: "inset_frame", text_position: "bottom" },
    frosted_glass: { composition: "split", text_position: "bottom" },
    accent_banner: { composition: "split", text_position: "top" },
  },
  rules: { min_text_ratio: MIN_TEXT_RATIO, min_headline_ratio: MIN_HEADLINE_RATIO, headline_max_words: HEADLINE_MAX_WORDS },
};

function member<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

export const isFontKey = (v: unknown): v is FontKey => member(FONT_KEYS, v);
export const isCompositionKey = (v: unknown): v is CompositionKey => member(COMPOSITION_KEYS, v);
export const isMotifKey = (v: unknown): v is MotifKey => member(MOTIF_KEYS, v);
export const isSignatureKey = (v: unknown): v is SignatureKey => member(SIGNATURE_KEYS, v);
export const isPriceStyle = (v: unknown): v is PriceStyle => member(PRICE_STYLES, v);
export const isTypeScale = (v: unknown): v is TypeScale => member(TYPE_SCALES, v);
export const isHeadlineCase = (v: unknown): v is HeadlineCase => member(HEADLINE_CASES, v);
export const isColorRole = (v: unknown): v is ColorRole => member(COLOR_ROLES, v);
export const isTextPosition = (v: unknown): v is TextPosition => member(TEXT_POSITIONS, v);
export const isTextMode = (v: unknown): v is TextMode => member(TEXT_MODES, v);
export const isLogoGround = (v: unknown): v is LogoGround => member(LOGO_GROUNDS, v);
export const isMotifSource = (v: unknown): v is MotifSource => member(MOTIF_SOURCES, v);

/** A stored composition key (v2, or v1 mapped to v2), or null. */
export function compositionKeyOf(key: unknown): CompositionKey | null {
  if (isCompositionKey(key)) return key;
  if (typeof key === "string" && key in LEGACY_COMPOSITIONS) return LEGACY_COMPOSITIONS[key];
  return null;
}

/** Whether a composition draws the post's photograph. */
export function compositionDrawsPhoto(key: string | null | undefined): boolean {
  const k = compositionKeyOf(key);
  return !(k && COMPOSITION_LIBRARY[k].photo === "none");
}
