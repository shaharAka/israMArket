/**
 * The landing page's site preview, and the hand-off from it to signup and onboarding.
 *
 * The preview is anonymous (`POST /public/preview`, rate-limited on the API). What it
 * returned is kept in sessionStorage so signup and the first onboarding step can prefill
 * the business without asking again, and the site URL travels as `?site=` so the hand-off
 * still works when storage is unavailable. The API also caches the scan by URL, so the
 * onboarding scan right after signup reuses it instead of reading the site twice.
 */
import { api, type BrandLanguage, type BrandSwatch, type BusinessModel, type RoadmapPost } from "@/lib/api";

export type PresenceType = "brick_and_mortar" | "online_only" | "hybrid";

export type SamplePost = {
  format: "image";
  /** The one product or offer on the site the post is about. */
  product?: string;
  /** A clean photograph from the site for the card, when the brand reading found one. */
  photo_url?: string;
  title: string;
  hook: string;
  caption: string;
  cta: string;
  overlay_headline: string;
};

export type SitePreview = {
  url: string;
  business_name: string;
  business_type: string;
  business_model: BusinessModel;
  presence_type: PresenceType;
  offerings: string[];
  offerings_summary: string;
  location: string;
  palette: BrandSwatch[];
  voice: string;
  /** The business's logo as found on their site; "" when none was found. */
  logo_url?: string;
  brand_language: {
    business_name: string;
    palette: BrandSwatch[];
    voice: string;
    typography: { primary: string; mood: string };
    offers_seen: string[];
    logo_url?: string;
    logo_description?: string;
  };
  sample_post: SamplePost | null;
  cached: boolean;
};

const STORAGE_KEY = "isramarket_site_preview";

/**
 * `myshop.co.il` is what an owner types. The scanner needs a scheme, so we add it rather
 * than sending them back to type `https://` — a rule nobody outside the trade knows.
 */
export function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function looksLikeWebsite(value: string): boolean {
  return /^https?:\/\/[^\s./]+\.[^\s]+/i.test(normalizeWebsite(value));
}

/** Same identity the API caches by: host without `www.`, no trailing slash. */
function siteKey(url: string): string {
  try {
    const parsed = new URL(normalizeWebsite(url));
    return `${parsed.hostname.replace(/^www\./i, "").toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function fetchSitePreview(url: string) {
  // forceLive: a visitor who opened the demo earlier must still get a real preview.
  return api<SitePreview>("/public/preview", { method: "POST", body: JSON.stringify({ url }) }, true);
}

export function savePreview(preview: SitePreview, typedUrl: string) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ typedUrl, preview }));
  } catch {
    // Private mode or storage full: the `?site=` param still carries the URL.
  }
}

/** The stored preview, only when it belongs to `site` (or any, when `site` is empty). */
export function loadPreview(site?: string): SitePreview | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { typedUrl?: string; preview?: SitePreview };
    const preview = parsed.preview;
    if (!preview) return null;
    if (!site) return preview;
    const wanted = siteKey(site);
    return siteKey(preview.url || "") === wanted || siteKey(parsed.typedUrl || "") === wanted ? preview : null;
  } catch {
    return null;
  }
}

/** The site this visit is about: `?site=` (or the older `?website=`). */
export function siteFromLocation(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("site") || params.get("website") || "";
}

/** A BrandLanguage the card renderer accepts. It paints from the palette only. */
export function previewBrand(preview: SitePreview): BrandLanguage {
  return {
    business_name: preview.business_name,
    palette: preview.palette,
    typography: preview.brand_language?.typography ?? { primary: "", mood: "" },
    visual_style: "",
    photography: "",
    voice: preview.voice,
    voice_examples: [],
    do_say: [],
    dont_say: [],
    messaging: [],
    offers_seen: preview.offerings,
    audience: "",
    logo_description: preview.brand_language?.logo_description ?? "",
    logo_url: previewLogo(preview),
  };
}

/** The logo to draw, from either place the API puts it. */
export function previewLogo(preview: SitePreview): string {
  return preview.logo_url || preview.brand_language?.logo_url || "";
}

/**
 * The sample post in the shape CardStage draws. With a photo that is known to load it
 * is the split card (photo on top, headline on the brand colour); otherwise the
 * typographic card in the brand's colours — never a grey "image coming" placeholder.
 */
export function previewCardPost(sample: SamplePost, photoUrl = ""): RoadmapPost {
  return {
    week: 1,
    date_hint: "",
    format: "image",
    title: sample.title,
    angle: "",
    hook: sample.hook,
    caption: sample.caption,
    cta: sample.cta,
    calendar_tie: "",
    goal_fit: "",
    overlay_theme: photoUrl ? "split_panel" : "type_hero",
    image_url: photoUrl || undefined,
    has_overlay: true,
    overlay_headline: sample.overlay_headline || sample.title,
  };
}

/** Save competitor Instagram usernames. Raw input is fine: the API normalises `@Name`
 *  and pasted profile links, and answers 422 with a Hebrew reason for a bad one. */
export function saveInstagramHandles(handles: string[]) {
  return api<{ handles: string[]; max_handles: number }>("/instagram/handles", {
    method: "PUT",
    body: JSON.stringify({ handles }),
  });
}
