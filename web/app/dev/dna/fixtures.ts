/**
 * Real businesses for the QA page: `app/dev/dna/fixtures/*.json`, written by the server side
 * (e.g. the owner's own shop, tazizi.co.il) with the logo copied to `public/dev-dna/`.
 *
 * The reader is forgiving about the file's shape, so a fixture straight from the API works:
 *   { brand_dna | dna | business.brand_dna,
 *     posts | roadmap.posts | strategy.roadmap.posts,
 *     name | business_name | business.name | brand_language.business_name,
 *     field_he?, logo_url?, brand_language?,
 *     photos?: (string | { url, safe_area?, focal? })[] }
 * Posts are drawn as they are (their own `design`, words and photo). A fixture without posts
 * but with photos gets three posts in the DNA's mix, photo-led, with no words of our own.
 */

import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import type { BrandDna, Point01, Rect01 } from "@/lib/dna/library";
import type { SampleBusiness } from "@/lib/dna/samples";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const pick = (...vals: unknown[]): unknown => vals.find((v) => v !== undefined && v !== null && v !== "");

function postOf(raw: Obj, i: number, id: string): RoadmapPost | null {
  const headline = str(raw.overlay_headline) || str(raw.overlay_text);
  const image = str(raw.image_url);
  if (!headline && !image) return null;
  return {
    week: typeof raw.week === "number" ? raw.week : 1,
    date_hint: str(raw.date_hint),
    format: raw.format === "reel" || raw.format === "story" || raw.format === "carousel" ? raw.format : "image",
    title: str(raw.title) || headline,
    angle: str(raw.angle),
    hook: str(raw.hook),
    caption: str(raw.caption),
    cta: str(raw.cta),
    calendar_tie: "",
    goal_fit: "",
    ...(raw as Partial<RoadmapPost>),
    uid: str(raw.uid) || `${id}-${i}`,
  } as RoadmapPost;
}

export function normalizeFixture(file: string, raw: unknown): SampleBusiness {
  const top = obj(raw);
  if (!top) throw new Error("the file is not a JSON object");
  const business = obj(top.business);
  const brand = (obj(top.brand_language) ?? obj(business?.brand_language)) as BrandLanguage | null;
  const dna = (obj(top.brand_dna) ?? obj(top.dna) ?? obj(business?.brand_dna)) as BrandDna | null;
  if (!dna) throw new Error("no brand_dna in the file");
  const id = file.replace(/\.json$/i, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const name = str(pick(top.name, top.business_name, business?.name, brand?.business_name)) || id;
  const roadmap = obj(top.roadmap) ?? obj(obj(top.strategy)?.roadmap);
  const rawPosts = Array.isArray(top.posts) ? top.posts : Array.isArray(roadmap?.posts) ? (roadmap?.posts as unknown[]) : [];
  const posts = rawPosts.map((p, i) => (obj(p) ? postOf(obj(p) as Obj, i, id) : null)).filter(Boolean) as RoadmapPost[];
  const signature = obj(dna.signature);
  const logo = str(pick(signature?.logo_url, top.logo_url, brand?.logo_url)) || undefined;

  // No posts: its photos alone (we write no words for a real business).
  const photos = Array.isArray(top.photos) ? top.photos : [];
  if (!posts.length && photos.length) {
    photos.slice(0, 3).forEach((p, i) => {
      const o = obj(p);
      const url = typeof p === "string" ? p : str(o?.url);
      if (!url) return;
      posts.push({
        week: 1,
        date_hint: "",
        format: "image",
        title: "",
        angle: "",
        hook: "",
        caption: "",
        cta: "",
        calendar_tie: "",
        goal_fit: "",
        uid: `${id}-photo-${i}`,
        image_url: url,
        has_overlay: false,
        design: { text_mode: "photo_only", safe_area: (o?.safe_area as Rect01) ?? null, focal: (o?.focal as Point01) ?? null },
      });
    });
  }
  return {
    id,
    name,
    field_he: str(pick(top.field_he, business?.business_type, dna.field)) || "",
    photo: posts.find((p) => p.image_url)?.image_url || "",
    logo,
    dna,
    posts: [],
    realPosts: posts,
    source: file,
  };
}
