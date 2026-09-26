"use client";

import { CardStage } from "@/components/CardCanvas";
import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import type { LandingExample } from "./examples";

function exampleBrand(example: LandingExample): BrandLanguage {
  return {
    business_name: example.businessName,
    palette: example.palette,
    typography: { primary: "", mood: "" },
    visual_style: "",
    photography: "",
    voice: "",
    voice_examples: [],
    do_say: [],
    dont_say: [],
    messaging: [],
    offers_seen: [],
    audience: example.why.audience,
    logo_description: "",
  };
}

/** The example post in the shape CardStage draws. Read-only: nothing here is editable. */
function examplePost(example: LandingExample): RoadmapPost {
  return {
    week: 1,
    date_hint: "",
    format: example.post.format,
    title: example.post.overlayHeadline,
    angle: "",
    hook: example.post.hook,
    caption: example.post.caption,
    cta: example.post.cta,
    calendar_tie: example.why.timing,
    goal_fit: example.why.goal,
    overlay_theme: example.template,
    has_overlay: true,
    overlay_headline: example.post.overlayHeadline,
    overlay_badge: example.post.overlayBadge,
    image_url: example.image ?? undefined,
  };
}

/**
 * One example as a short story: what the research found, the month's direction, and a
 * post that carries it out. The post card is deliberately small and last: the plan is
 * the product, the post is its output.
 */
export function ExampleStory({ example }: { example: LandingExample }) {
  const primary = example.palette.find((swatch) => swatch.role === "primary")?.hex ?? "#191b18";
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-[#e6e4dc] bg-white">
      <div aria-hidden className="h-1.5" style={{ backgroundColor: primary }} />
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <header>
          <h3 className="text-lg font-black leading-tight text-[#191b18]">{example.businessName}</h3>
          <p className="text-sm text-[#5e6159]">
            {example.typeLabel} · {example.city}
          </p>
        </header>

        <ol className="mt-4 flex-1 divide-y divide-[#eeece5]">
          <Step label="מה גילינו">
            <p>{example.insight}</p>
            <p className="mt-1 text-xs text-[#6d7068]">מתוך: {example.sources.join(", ")}</p>
          </Step>
          <Step label="הכיוון לחודש">
            <p>{example.direction}</p>
          </Step>
          <Step label="פוסט לדוגמה">
            <div className="flex items-start gap-3">
              <div
                className="w-[104px] shrink-0 sm:w-[112px]"
                role="img"
                aria-label={`הכרטיס של הפוסט: ${example.post.overlayHeadline}`}
              >
                <CardStage
                  post={examplePost(example)}
                  brand={exampleBrand(example)}
                  businessName={example.businessName}
                  rounded
                />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[#191b18]">{example.post.hook}</p>
                <p className="mt-1.5 text-[#4f524b]">
                  <span className="font-bold text-[#191b18]">למה הפוסט הזה: </span>
                  {example.why.reason}
                </p>
              </div>
            </div>
          </Step>
        </ol>

        <p className="mt-3 rounded-md bg-[#f3f7f1] px-3 py-2 text-sm text-[#2d3f32]">
          <span className="font-bold">בסוף החודש בודקים: </span>
          {example.check}
        </p>
      </div>
    </article>
  );
}

function Step({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="py-3 text-sm leading-6 text-[#34372f] first:pt-0">
      <p className="mb-0.5 text-xs font-bold text-[#2d3f32]">{label}</p>
      {children}
    </li>
  );
}
