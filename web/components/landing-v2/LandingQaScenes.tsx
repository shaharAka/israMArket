"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Copy, useLanguage } from "@/components/language/LanguageProvider";
import { DEFAULT_PROCESS_EXAMPLE, PROCESS_EXAMPLES, EXAMPLE_RESULTS, EXAMPLE_OUTCOME, type ProcessRole } from "./processExamples";
import { PROCESS_CAMPAIGNS } from "./processCampaigns";
import Image from "next/image";
import { campaignPhoto } from "./ProcessCampaignArtwork";
import { useProcessSequence } from "./useProcessSequence";
import styles from "./qa-scenes.module.css";
import rhythm from "./process-rhythm.module.css";
import campaign from "./campaign-edition.module.css";

/** The visible label on every invented example figure or business. */
export function ExampleTag(){return <b className={rhythm.exampleTag}><Copy text="דוגמה"/></b>;}

const BRIEF_TIMES=[900,4200] as const;
const GROWTH_TIMES=[2400,2600,3000] as const;
const CLIPS={services:["designer-human-motion-ai.mp4","designer-human-motion-poster.jpg"],online_shop:["kefel-fitting-room-campaign.mp4","kefel-fitting-room-poster.jpg"],physical_shop:["bakery-human-motion-ai.mp4","bakery-human-motion-poster.jpg"],fundraising:["community-human-motion-ai.mp4","community-human-motion-poster.jpg"]} as const;
export function TargetIcon(){return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="23" cy="25" r="18"/><circle cx="23" cy="25" r="11"/><circle cx="23" cy="25" r="4"/><path d="m23 25 17-17m-1-5v7h7"/></svg>;}
function Check(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>;}
export function CampaignClip({role,playing}:{role:ProcessRole;playing:boolean}){
  const {locale}=useLanguage();const ref=useRef<HTMLVideoElement>(null);
  const [src,poster]=role==="software"?[`maslul-project-demo-${locale}.mp4`,`maslul-project-demo-${locale}.jpg`]:CLIPS[role];
  useEffect(()=>{const v=ref.current;if(!v)return;if(playing)void v.play().catch(()=>{});else v.pause();},[src,playing]);
  return <video ref={ref} src={`/showcase/${src}`} poster={`/showcase/${poster}`} muted loop playsInline preload="metadata" data-software={role==="software"}/>;
}
export { QuestionnaireScene } from "./QuestionnaireDemo";
/** Three inputs converge into coordinated campaign material; the layout never changes height. */
export function HeroBriefScene({role,playing,reduced=false}:{role:ProcessRole;playing:boolean;reduced?:boolean}){
  const {locale}=useLanguage();
  const {index}=useProcessSequence(BRIEF_TIMES,playing);const active=reduced?1:index;
  return <div className={styles.brief} data-brief-stage={active}>
    <div className={styles.briefInputs}>{["המטרה","הקהל","מה מייחד אתכם"].map(label=><div key={label}><small><Copy text={label}/></small></div>)}</div>
    <svg className={styles.briefConnector} viewBox="0 0 300 42" preserveAspectRatio="none" fill="none" aria-hidden="true"><g className={styles.briefConnectorBase}><path d="M50 1v10q0 9 10 9h80q10 0 10 10v11M150 1v40M250 1v10q0 9-10 9h-80q-10 0-10 10v11"/></g><g className={styles.briefConnectorDraw}><path pathLength="1" d="M50 1v10q0 9 10 9h80q10 0 10 10v11"/><path pathLength="1" d="M150 1v40"/><path pathLength="1" d="M250 1v10q0 9-10 9h-80q-10 0-10 10v11"/></g></svg>
    <div className={styles.briefResult}><span><Copy text="הקמפיין שלכם"/></span><div>{[0,1,2].map(i=><div key={i}><Image src={campaignPhoto(role,i,locale)} alt="" width={240} height={300} sizes="120px" style={{display:"block",width:"100%",height:"100%",objectFit:"cover"}}/></div>)}</div></div>
  </div>;
}
function ChannelLabel({ channel }: { channel: "Instagram" | "Facebook" | "TikTok" | "LinkedIn" }) {
  return <span className={campaign.channel} dir="ltr">
    <Image src={`/connectors/${channel.toLowerCase()}.svg`} width={15} height={15} alt="" />
    {channel}
  </span>;
}

/** One campaign, with artwork, practical details and a short film for different feeds. */
export function CampaignMaterialsScene({ role: requested, playing }: { role: ProcessRole | null; playing: boolean }) {
  const { locale } = useLanguage();
  const role = requested ?? DEFAULT_PROCESS_EXAMPLE;
  const example = PROCESS_EXAMPLES[role];
  const [, film, offer] = PROCESS_CAMPAIGNS[role];
  const filmChannel = role === "software" ? "LinkedIn" : "TikTok";

  return <div className={campaign.edition} data-campaign-materials>
    <header className={campaign.identity}>
      <strong><Copy text={example.weeks[2]} /></strong>
      <span><Copy text={example.name} /> <ExampleTag /></span>
    </header>
    <div className={campaign.formats}>
      <article className={campaign.poster} data-social-platform="Instagram">
        <ChannelLabel channel="Instagram" />
        <div className={campaign.posterImage} data-campaign-media>
          <Image src={campaignPhoto(role, 2, locale)} alt="" fill sizes="(max-width: 700px) 90vw, 300px" />
        </div>
        <p><Copy text={offer.title} /></p>
      </article>
      <article className={campaign.feed} data-social-platform="Facebook">
        <ChannelLabel channel="Facebook" />
        <div className={campaign.feedImage} data-campaign-media>
          <Image src={campaignPhoto(role, 0, locale)} alt="" fill sizes="220px" />
        </div>
        <p><Copy text={offer.subline} /></p>
      </article>
      <article className={campaign.reel} data-social-platform={filmChannel} data-campaign-material="video">
        <ChannelLabel channel={filmChannel} />
        <div className={campaign.film} data-campaign-media>
          <CampaignClip role={role} playing={playing} />
        </div>
        <p><Copy text={film.headline} /></p>
      </article>
    </div>
  </div>;
}
/** The changing metric stays anchored to the campaign material behind it. */
export function CampaignGrowthScene({playing,reduced=false,compact=false,role="online_shop"}:{playing:boolean;reduced?:boolean;compact?:boolean;role?:ProcessRole}){
  const {locale}=useLanguage();
  const {index}=useProcessSequence(GROWTH_TIMES,playing);const active=reduced?2:index;
  const [count,setCount]=useState<number>(EXAMPLE_RESULTS.steps[0]);const previous=useRef<number>(EXAMPLE_RESULTS.steps[0]);
  useEffect(()=>{const target=EXAMPLE_RESULTS.steps[active];if(!playing){return;}const start=performance.now(),from=Math.min(previous.current,target);let frame=0;const tick=(now:number)=>{const p=Math.min(1,(now-start)/1100);const value=Math.round(from+(target-from)*(1-Math.pow(1-p,3)));previous.current=value;setCount(value);if(p<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[active,playing]);
  const value=reduced?EXAMPLE_RESULTS.outcome:count;
  const metric=EXAMPLE_OUTCOME[role].metric;
  const outcome={online_shop:"יותר הזמנות מהקמפיינים שלכם",physical_shop:"יותר אנשים מזמינים מראש",services:"יותר אנשים פונים אליכם",software:"יותר אנשים מתנסים במוצר",fundraising:"יותר אנשים תומכים בעשייה"}[role];
  return <div className={`${styles.growth} ${compact?styles.compactGrowth:""}`} data-growth-stage={active}><header><strong><Copy text={outcome}/></strong></header><div className={styles.result}><strong>{value}</strong><span><Copy text={metric}/></span><small><ExampleTag/> <Copy text="בחודש הקודם: {arg_0}" args={{arg_0:EXAMPLE_RESULTS.previous}}/></small></div><div className={styles.growthCampaigns}>{[0,1,2].map((i)=><div key={i} data-active={i===active} style={{"--growth-step":i} as CSSProperties}><div><Image src={campaignPhoto(role,i,locale)} alt="" width={240} height={240} sizes="160px" style={{display:"block",width:"100%",height:"100%",objectFit:"cover"}}/></div><span><Copy text={["קמפיין היכרות","קמפיין המשך","קמפיין חדש"][i]}/></span>{i<=active&&<Check/>}</div>)}</div></div>;
}
