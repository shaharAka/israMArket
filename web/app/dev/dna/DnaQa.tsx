"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CardCanvas, CardStage, cardSize, type CardRatio } from "@/components/CardCanvas";
import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import { renderCardPng } from "@/lib/cardExport";
import { COMPOSITION_KEYS, FONT_LIBRARY, isFontKey, type CompositionKey } from "@/lib/dna/library";
import { SAMPLE_BUSINESSES, type SampleBusiness, type SampleWords } from "@/lib/dna/samples";

function postFor(biz: SampleBusiness, words: SampleWords, composition: CompositionKey, i: number, pos?: string): RoadmapPost {
  return {
    week: 1,
    date_hint: "",
    format: "image",
    title: words.headline,
    angle: "",
    hook: "",
    caption: "",
    cta: words.cta || "",
    calendar_tie: "",
    goal_fit: "",
    uid: `${biz.id}-${i}`,
    image_url: biz.photo,
    has_overlay: true,
    overlay_headline: words.headline,
    overlay_badge: words.kicker || "",
    stat_highlight: words.stat || "",
    design: { composition, crop: biz.crop, text_position: pos },
  };
}

function brandOf(biz: SampleBusiness): BrandLanguage {
  return {
    business_name: biz.name,
    // The old palette, for the "no DNA yet" view (?nodna=1).
    palette: [
      { hex: biz.dna.colors.accent, role: "primary", name: "" },
      { hex: biz.dna.colors.accent_2 || biz.dna.colors.accent, role: "accent", name: "" },
      { hex: biz.dna.colors.paper, role: "background", name: "" },
      { hex: biz.dna.colors.ink, role: "ink", name: "" },
    ],
    typography: { primary: "", mood: "" },
    visual_style: "",
    photography: "",
    voice: "",
    voice_examples: [],
    do_say: [],
    dont_say: [],
    messaging: [],
    offers_seen: [],
    audience: "",
    logo_description: "",
    logo_url: biz.logo,
  };
}

function fontLabel(key: string) {
  return isFontKey(key) ? FONT_LIBRARY[key].family : key;
}

/** One card, with a PNG export of the real 1080px canvas next to it. */
function QaCard({ biz, post, ratio, label, nodna, logo }: { biz: SampleBusiness; post: RoadmapPost; ratio: CardRatio; label: string; nodna?: boolean; logo?: string }) {
  const dna = nodna ? null : biz.dna;
  // ?logo=<url> puts one logo on every business, to test a hot-linked logo end to end.
  const brand = logo ? { ...brandOf(biz), logo_url: logo } : brandOf(biz);
  const ref = useRef<HTMLDivElement>(null);
  const [png, setPng] = useState("");
  const [busy, setBusy] = useState(false);
  const size = cardSize("image", ratio);
  async function onExport() {
    if (!ref.current) return;
    setBusy(true);
    try {
      setPng(await renderCardPng(ref.current, { width: size.w, height: size.h }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <figure className="m-0" data-qa-card={`${biz.id}:${post.design?.composition}`}>
      <CardStage post={post} brand={brand} dna={dna} businessName={biz.name} ratio={ratio} rounded={false} />
      <figcaption className="mt-2 flex items-center justify-between text-[12px] text-[var(--ink-muted)]">
        <span>{label}</span>
        <button type="button" data-qa-export onClick={() => void onExport()} disabled={busy} className="font-semibold text-[var(--primary)] disabled:opacity-40">
          {busy ? "…" : "PNG"}
        </button>
      </figcaption>
      {png ? (
        // eslint-disable-next-line @next/next/no-img-element -- a generated data URL
        <img data-qa-png src={png} alt="" className="mt-2 w-full" />
      ) : null}
      <div aria-hidden style={{ position: "fixed", top: 0, left: 0, width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
        <CardCanvas post={post} brand={brand} dna={dna} businessName={biz.name} size={size} canvasRef={ref} />
      </div>
    </figure>
  );
}

function Grid() {
  const params = useSearchParams();
  const ratioParam = params.get("ratio");
  const ratio: CardRatio = ratioParam === "1:1" || ratioParam === "9:16" ? ratioParam : "4:5";
  const only = params.get("only");
  const all = params.get("all") === "1";
  // Old posts of a business with no DNA yet: no `design`, an old `overlay_theme`.
  const nodna = params.get("nodna") === "1";
  const logo = params.get("logo") || undefined;
  // ?pos=top|bottom|center|start|end: every card at that text position (where the composition takes it).
  const pos = params.get("pos") || undefined;
  const LEGACY = ["lower_editorial", "split_panel", "framed_inset", "type_hero"] as const;
  const list = SAMPLE_BUSINESSES.filter((b) => !only || only.split(",").includes(b.id));
  return (
    <main dir="rtl" className="mx-auto max-w-[1500px] px-6 py-8">
      <header className="mb-8">
        <h1 className="text-[22px] font-bold tracking-tight text-[var(--ink)]">Design DNA · בדיקה חזותית</h1>
        <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
          {list.length} עסקים, {ratio}. שלוש מאפיות עם אותה תמונה בדיוק. עמוד פנימי, לא מקושר.
        </p>
      </header>
      <div className="space-y-12">
        {list.map((biz) => {
          const keys: CompositionKey[] = all ? [...COMPOSITION_KEYS] : (biz.dna.compositions.slice(0, 3) as CompositionKey[]);
          return (
            <section key={biz.id} data-qa-business={biz.id}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className="text-[17px] font-bold text-[var(--ink)]">{biz.name}</h2>
                <span className="text-[13px] text-[var(--ink-muted)]">{biz.field_he}</span>
                <span className="text-[12px] text-[var(--ink-muted)]" dir="ltr">
                  {fontLabel(biz.dna.type.display)} + {fontLabel(biz.dna.type.text)} · {biz.dna.motif.kind} · {biz.dna.signature.kind} · {biz.dna.copy?.cta_style}/{biz.dna.copy?.price_style}
                </span>
              </div>
              <p className="mb-4 text-[14px] text-[var(--ink-soft)]">{biz.dna.rationale_he}</p>
              <div className={`grid gap-5 ${all ? "grid-cols-4" : ratio === "9:16" ? "grid-cols-3 max-w-[900px]" : "grid-cols-3"}`}>
                {keys.map((key, i) => (
                  <QaCard
                    key={key}
                    biz={biz}
                    ratio={ratio}
                    nodna={nodna}
                    logo={logo}
                    label={nodna ? LEGACY[i % LEGACY.length] : key}
                    post={
                      nodna
                        ? { ...postFor(biz, biz.posts[i % biz.posts.length], key, i, pos), design: undefined, overlay_theme: LEGACY[i % LEGACY.length] }
                        : postFor(biz, biz.posts[i % biz.posts.length], key, i, pos)
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

export function DnaQa() {
  return (
    <Suspense fallback={null}>
      <Grid />
    </Suspense>
  );
}
