"use client";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { CardStage, type CardRatio } from "@/components/CardCanvas";
import { PROCESS_EXAMPLES, PROCESS_ROLES, type ProcessRole } from "./processExamples";
import { PROCESS_CAMPAIGNS } from "./processCampaigns";
import { productFixtures } from "./productFixtures";
export function CampaignArtwork({ role, index, support = false, ratio }: { role: ProcessRole; index: number; support?: boolean; ratio?: CardRatio }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const example = PROCESS_EXAMPLES[role];
  const creative = PROCESS_CAMPAIGNS[role][index];
  const path = PROCESS_ROLES.find(item => item.segment === role)!.path;
  const { campaign, brand } = productFixtures(path, t, locale);
  const headline = support ? creative.headline : creative.title;
  const typeOnly = support && (index === 0 || index === 3);
  const composition = support ? ["type_led", "split", "full_bleed", "type_led"][index] : ["full_bleed", "full_bleed", "split", "inset_frame"][index];
  const hasHeadline = support || index > 1;
  const poster = role === "services" ? "/showcase/designer-human-motion-poster.jpg" : role === "online_shop" ? "/showcase/clothing-linen-ai.png" : role === "physical_shop" ? "/showcase/bakery-human-motion-poster.jpg" : role === "fundraising" ? "/showcase/community-human-motion-poster.jpg" : `/showcase/maslul-project-demo-${locale}.jpg`;
  const image = typeOnly ? undefined : creative.image ?? poster;
  const post = { ...campaign.roadmap.posts[0], uid: `public-${role}-week${index + 1}-${support ? "support" : "main"}`, week: index + 1,
    title: t(headline), overlay_headline: hasHeadline ? t(headline) : "", overlay_sub: support && typeOnly ? t(creative.subline) : "",
    caption: t(creative.caption), cta: t(example.action), image_url: image, has_overlay: hasHeadline,
    design: { composition, text_mode: typeOnly ? "type_led" : hasHeadline ? "headline" : "photo_only", text_position: support && index === 2 ? "bottom" : "top", ...(composition === "full_bleed" && hasHeadline ? {safe_area:{x:.06,y:.64,w:.88,h:.3}} : {}) }, content_language: locale,
  };
  const inverse = support && index === 2;
  const colors = { ink: inverse ? example.soft : example.color, paper: inverse ? example.color : example.soft, accent: inverse ? example.soft : example.color };
  const selectedBrand: typeof brand = { ...brand, business_name: t(example.name), palette: [{ role: "primary", hex: colors.ink, name: "" }, { role: "background", hex: colors.paper, name: "" }] };
  const dna = campaign.brand_dna ? { ...campaign.brand_dna, colors, type: role === "online_shop" ? { ...campaign.brand_dna.type, display: "heebo" as const, display_weight: 600 as const } : campaign.brand_dna.type } : undefined;
  return <CardStage post={post} brand={selectedBrand} dna={dna} businessName={t(example.name)} rounded={false} ratio={ratio} />;
}

