"use client";

import { useState } from "react";
import { useFeatureCycle } from "./useFeatureCycle";
import { useCopy } from "@/components/language/LanguageProvider";
import { PostArtwork } from "./PostArtwork";
import "./CampaignPostExamples.css";

export type CampaignExample = {
  key: string;
  business: string;
  kind: string;
  image?: string;
  alt?: string;
  headline: string;
  tip: string;
  action: string;
  label: string;
  plan: string;
  caption: string;
  colors?: { paper: string; ink: string; accent?: string };
  motion?: string[];
};

/** Copy is passed by the landing page so interface translations stay with its catalog.
 * Images are explicitly fictional. Supply an actual product capture for software.
 */
export function CampaignPostExamples({
  examples,
  selectionLabel,
  captionLabel,
  screenshot,
  galleryOnly = false,
}: {
  galleryOnly?: boolean;
  examples: CampaignExample[];
  selectionLabel: string;
  captionLabel: string;
  screenshot?: { src: string; alt: string };
}) {
  const [selected, setSelected] = useState(0);
  const [captionOpen, setCaptionOpen] = useState(false);
  const t = useCopy();
  const example = examples[selected] ?? examples[0];
  if (!example) return null;
  return (
    <div className="campaign-examples" data-gallery={galleryOnly}>
      <div className="campaign-grid" data-count={examples.length} role="group" aria-label={selectionLabel}>
        {examples.map((item, index) => <div className="campaign-item" key={item.key}>
        <CampaignArtwork item={item} galleryOnly={galleryOnly} screenshot={screenshot} />
        {!galleryOnly && item.label ? <p className="campaign-context">{item.label}</p> : null}
        {!galleryOnly && <button type="button" className="campaign-read" aria-pressed={index === selected && captionOpen} aria-controls="campaign-example-detail" onClick={() => {
          setSelected(index); setCaptionOpen(true);
          window.requestAnimationFrame(() => document.getElementById("campaign-example-detail")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" }));
        }}>{t("לקרוא את הפוסט של {arg_0}", {arg_0:item.kind})}</button>}
        </div>)}
      </div>
      {!galleryOnly && <div id="campaign-example-detail" className="campaign-detail">
        <div className="campaign-explanation">
          <h3>{example.kind}</h3>
          {example.motion ? <div className="campaign-motion">
            <ol>{example.motion.map((line) => <li key={line}>{line}</li>)}</ol>
          </div> : null}
          <p className="campaign-plan">{example.plan}</p>
          <details className="campaign-caption" open={captionOpen} onToggle={event => setCaptionOpen(event.currentTarget.open)}><summary>{captionLabel}</summary><p>{example.caption}</p></details>
        </div>
      </div>}
    </div>
  );
}

function CampaignArtwork({ item, galleryOnly, screenshot }: { item: CampaignExample; galleryOnly: boolean; screenshot?: { src: string; alt: string } }) {
  const { ref: cycleRef, index: activeIndex, paused, reduced, playing, toggle } = useFeatureCycle(item.motion?.length ?? 1, 3000);
  const t = useCopy();
  return <div ref={cycleRef} className="campaign-player">
    <PostArtwork item={item} playing={Boolean(item.motion && playing)} beat={activeIndex} screenshot={screenshot} />
    {item.motion && !reduced ? <button type="button" className={galleryOnly ? "campaign-play" : "campaign-read"}
      aria-label={t(paused ? "לראות את הפוסט בתנועה" : "לעצור את התנועה")} onClick={toggle}>
      {galleryOnly ? <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span> : t(paused ? "לראות את הפוסט בתנועה" : "לעצור את התנועה")}
    </button> : null}
  </div>;
}
