import type { BrandLanguage, BrandSwatch, RoadmapPost } from "@/lib/api";
import type { CardTemplate } from "@/components/CardCanvas";

/** Everything CardStage needs to draw one read-only landing card. */
export type LandingCard = {
  businessName: string;
  palette: BrandSwatch[];
  template: CardTemplate;
  image: string | null;
  headline: string;
  badge: string;
  cta: string;
  audience?: string;
};

export function cardBrand(card: LandingCard): BrandLanguage {
  return {
    business_name: card.businessName,
    palette: card.palette,
    typography: { primary: "", mood: "" },
    visual_style: "",
    photography: "",
    voice: "",
    voice_examples: [],
    do_say: [],
    dont_say: [],
    messaging: [],
    offers_seen: [],
    audience: card.audience ?? "",
    logo_description: "",
  };
}

/** The card in the shape CardStage draws. Read-only: nothing here is editable. */
export function cardPost(card: LandingCard): RoadmapPost {
  return {
    week: 1,
    date_hint: "",
    format: "image",
    title: card.headline,
    angle: "",
    hook: "",
    caption: "",
    cta: card.cta,
    calendar_tie: "",
    goal_fit: "",
    overlay_theme: card.template,
    has_overlay: true,
    overlay_headline: card.headline,
    overlay_badge: card.badge,
    image_url: card.image ?? undefined,
  };
}

export function swatch(palette: BrandSwatch[], role: string, fallback = "#191b18"): string {
  return palette.find((item) => item.role === role)?.hex ?? fallback;
}
