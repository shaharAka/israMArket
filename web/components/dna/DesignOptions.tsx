"use client";

/**
 * The editor's design step: three designs of the business's own DNA for one post, each
 * drawn by the real renderer with the post's words and photo, and named in words by what
 * the card actually draws ("רק התמונה", "כותרת על התמונה", "טקסט על רקע") — never by a
 * composition key. A choice changes the design only: the photo, its empty area and its
 * subject stay with the post.
 */

import { CardStage, cardSize, logoFor, wordsOf, type CardRatio } from "@/components/CardCanvas";
import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import { IconCheck } from "@/lib/icons";
import { OUTCOME_LABEL, planCard, type Outcome } from "@/lib/dna/layout";
import { compositionDrawsPhoto, type BrandDna, type CompositionKey, type TextMode } from "@/lib/dna/library";
import { useFontEpoch } from "@/lib/dna/measure";
import { usePhotoInfo } from "@/lib/dna/photoInfo";
import { resolveDesign, resolveDna, type ResolvedDna } from "@/lib/dna/resolve";
import editorStyles from "@/components/posts/editor.module.css";

export type DesignChoice = { mode: TextMode; composition: CompositionKey };

/** Mix types that show a real product: never set as type on its own (the server's rule too). */
const PRODUCT_MIX = new Set(["product", "offer"]);

function candidates(post: RoadmapPost, dna: ResolvedDna): DesignChoice[] {
  const photoKeys = dna.compositions.filter((k) => compositionDrawsPhoto(k));
  for (const k of ["full_bleed", "split"] as CompositionKey[]) if (!photoKeys.includes(k)) photoKeys.push(k);
  const list: DesignChoice[] = [{ mode: "photo_only", composition: "full_bleed" }];
  for (const k of photoKeys) list.push({ mode: "headline", composition: k });
  const typeAllowed = (dna.compositions.includes("type_led") || dna.mix.type_led >= 0.1) && !PRODUCT_MIX.has(post.mix_type || "");
  if (typeAllowed) list.splice(2, 0, { mode: "type_led", composition: "type_led" });
  return list;
}

export function DesignOptions({
  post,
  brand,
  dna: dnaIn,
  businessName,
  ratio,
  disabled,
  onChoose,
}: {
  post: RoadmapPost;
  brand?: BrandLanguage | null;
  dna?: BrandDna | null;
  businessName: string;
  ratio?: CardRatio;
  disabled?: boolean;
  onChoose: (choice: DesignChoice) => void;
}) {
  const exact = useFontEpoch() > 0;
  const dna = resolveDna(dnaIn, brand);
  const size = cardSize(post.format, ratio);
  const info = usePhotoInfo(post.image_url || undefined);
  const logo = logoFor(dna, brand);
  const logoInfo = usePhotoInfo(logo);
  const outcomeOf = (p: RoadmapPost): Outcome => {
    const design = resolveDesign(p, dna);
    return planCard({
      W: size.w,
      H: size.h,
      dna,
      design,
      words: wordsOf(p, design.mode, businessName),
      photo: { url: p.image_url || undefined, info },
      channel: "feed",
      logo: logo ? { src: logo, aspect: logoInfo?.aspect } : undefined,
      name: businessName,
      exact,
    }).outcome;
  };
  // As it will be saved: "רק התמונה" turns the words off (the server's text-mode rule).
  const withDesign = (c: DesignChoice): RoadmapPost => ({ ...post, has_overlay: c.mode !== "photo_only", design: { ...post.design, composition: c.composition, text_mode: c.mode } });
  const current = resolveDesign(post, dna);
  const currentOutcome = outcomeOf(post);

  // One option per distinct result, in the DNA's own order, so a choice never reshuffles
  // the row; the post's current design is always among the three.
  const seen = new Set<Outcome>();
  const options: (DesignChoice & { outcome: Outcome })[] = [];
  for (const c of candidates(post, dna)) {
    const outcome = outcomeOf(withDesign(c));
    if (seen.has(outcome)) continue;
    seen.add(outcome);
    options.push({ ...c, outcome });
  }
  let shown = options.slice(0, 3);
  if (!shown.some((o) => o.outcome === currentOutcome)) {
    const mine = options.find((o) => o.outcome === currentOutcome) ?? { mode: current.mode, composition: current.composition, outcome: currentOutcome };
    shown = [...shown.slice(0, 2), mine];
  }

  return (
    <div role="radiogroup" aria-label="העיצוב של הפוסט" className={`${editorStyles.looks} mt-2.5`}>
      {shown.map((o) => {
        const on = o.outcome === currentOutcome;
        return (
          <button key={o.outcome} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => (on ? undefined : onChoose({ mode: o.mode, composition: o.composition }))} className={editorStyles.look}>
            <span className={editorStyles.lookThumb} aria-hidden>
              <CardStage post={withDesign(o)} brand={brand} dna={dnaIn} businessName={businessName} rounded={false} ratio={ratio} quietPlaceholder />
            </span>
            <span className={editorStyles.lookLabel}>
              {on ? <IconCheck className="h-3.5 w-3.5 shrink-0" /> : null}
              {OUTCOME_LABEL[o.outcome]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
