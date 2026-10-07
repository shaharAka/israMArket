"use client";

import Image from "next/image";
import { type CSSProperties, type Ref } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import type { CampaignExample } from "./CampaignPostExamples";

/** Shared media plumbing, deliberately different compositions and type per business. */
export function PostArtwork({ item, artRef, playing = false, beat = 0, screenshot }: { item: CampaignExample; artRef?: Ref<HTMLElement>; playing?: boolean; beat?: number; screenshot?: { src: string; alt: string } }) {
  const t = useCopy();
  return <figure ref={artRef} className={`campaign-art campaign-art--${item.key}`} data-playing={playing} data-beat={beat} style={item.colors ? { "--art-paper": item.colors.paper, "--art-ink": item.colors.ink, "--art-accent": item.colors.accent ?? item.colors.ink } as CSSProperties : undefined}>
    {item.image ? <div className="campaign-photo"><Image src={item.image} alt={item.alt ?? ""} fill sizes="(max-width: 700px) 90vw, 380px" />{item.motion && playing ? <span className="campaign-beat">{item.motion[beat]}</span> : null}</div> : null}
    <span className="campaign-business">{item.business}</span>
    <h3>{item.headline}</h3>
    {item.key === "interior" ? <div className="campaign-light-notes"><span><Copy text="בבוקר" /></span><span><Copy text="בערב" /></span><span><Copy text="באור של הבית" /></span></div> : null}
    {item.key === "dj" ? <ol className="campaign-track-list">{item.motion?.map((line, index) => <li key={line} data-current={playing && beat === index}><small>0{index + 1}</small><span>{line}</span></li>)}</ol> : null}
    {item.key === "mobile" ? <div className="campaign-phone-notes"><span><Copy text="לצילום" /></span><span><Copy text="לעבודה" /></span><span><Copy text="ליומיום" /></span></div> : null}
    {item.key === "wellness" ? <ul className="campaign-kit-list"><li><Copy text="בקבוק" /></li><li><Copy text="מגבת" /></li><li><Copy text="רגע לצאת" /></li></ul> : null}
    {item.key === "software" ? <div className="campaign-software-screen"><Image src={screenshot?.src ?? "/showcase/platform-week-desktop.png"} alt={screenshot?.alt ?? t("התוכנית והצעד הבא במערכת")} width={1440} height={1000} sizes="(max-width: 700px) 75vw, 280px" /></div> : null}
    <figcaption className="campaign-art-footer"><span>{item.action}</span></figcaption>
  </figure>;
}
