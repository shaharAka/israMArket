"use client";

import { useEffect, useRef, useState } from "react";
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
}: {
  examples: CampaignExample[];
  selectionLabel: string;
  captionLabel: string;
  screenshot?: { src: string; alt: string };
}) {
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [captionOpen, setCaptionOpen] = useState(false);
  const activeArt = useRef<HTMLElement>(null);
  const t = useCopy();
  const example = examples[selected] ?? examples[0];
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.3), { threshold: 0.3 });
    if (activeArt.current) observer.observe(activeArt.current);
    return () => observer.disconnect();
  }, [selected]);
  useEffect(() => {
    const changed = () => setPageVisible(!document.hidden);
    changed();
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (!playing || !visible || !pageVisible) return;
    const timer = window.setTimeout(() => {
      if (beat >= (example?.motion?.length ?? 1) - 1) setPlaying(false);
      else setBeat(beat + 1);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [playing, visible, pageVisible, beat, example]);
  if (!example) return null;
  return (
    <div className="campaign-examples">
      <div className="campaign-grid" data-count={examples.length} role="group" aria-label={selectionLabel}>
        {examples.map((item, index) => <div className="campaign-item" key={item.key}>
        <PostArtwork item={item} artRef={selected === index ? activeArt : undefined} playing={selected === index && playing} beat={selected === index ? beat : 0} screenshot={screenshot} />
        <p className="campaign-context">{item.label}</p>
        <button type="button" className="campaign-read" aria-pressed={index === selected && captionOpen} aria-controls="campaign-example-detail" onClick={() => {
          setSelected(index); setBeat(0); setPlaying(false); setCaptionOpen(true);
          window.requestAnimationFrame(() => document.getElementById("campaign-example-detail")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" }));
        }}>{t("לקרוא את הפוסט של {arg_0}", {arg_0:item.kind})}</button>
        {item.motion ? <button type="button" className="campaign-read" onClick={(event) => {
          if (playing && selected === index) setPlaying(false);
          else if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setSelected(index); setBeat(0); setPlaying(true);
            // Keep the photograph visible when its control sits below a tall phone card.
            event.currentTarget.parentElement?.querySelector("figure")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }}>{t(playing && selected === index ? "לעצור את התנועה" : "לראות את הפוסט בתנועה")}</button> : null}
        </div>)}
      </div>
      <div id="campaign-example-detail" className="campaign-detail">
        <div className="campaign-explanation">
          <h3>{example.kind}</h3>
          {example.motion ? <div className="campaign-motion">
            <p>{t("דוגמת פוסט מונפש מתמונה שנוצרה ב-AI")}</p>
            <ol>{example.motion.map((line, index) => <li key={line} aria-current={playing && index === beat ? "step" : undefined}>{line}</li>)}</ol>
          </div> : null}
          <p className="campaign-plan">{example.plan}</p>
          <details className="campaign-caption" open={captionOpen} onToggle={event => setCaptionOpen(event.currentTarget.open)}><summary>{captionLabel}</summary><p>{example.caption}</p></details>
        </div>
      </div>
    </div>
  );
}
