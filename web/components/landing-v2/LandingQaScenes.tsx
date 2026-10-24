"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { PROCESS_EXAMPLES, type ProcessRole } from "./processExamples";
import { PROCESS_GOALS } from "./processScenarios";
import { PROCESS_CAMPAIGNS } from "./processCampaigns";
import { CampaignArtwork } from "./ProcessCampaignArtwork";
import { ProcessSocialPost } from "./ProcessSocialPost";
import { useProcessSequence } from "./useProcessSequence";
import styles from "./qa-scenes.module.css";

const FORM_TIMES=[2200,2400,2400,1700] as const;
const BRIEF_TIMES=[3800,3400] as const;
const GROWTH_TIMES=[2400,2600,3000] as const;
const CLIPS={services:["designer-human-motion-ai.mp4","designer-human-motion-poster.jpg"],online_shop:["kefel-fitting-room-campaign.mp4","kefel-fitting-room-poster.jpg"],physical_shop:["bakery-human-motion-ai.mp4","bakery-human-motion-poster.jpg"],fundraising:["community-human-motion-ai.mp4","community-human-motion-poster.jpg"]} as const;
export function TargetIcon(){return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="23" cy="25" r="18"/><circle cx="23" cy="25" r="11"/><circle cx="23" cy="25" r="4"/><path d="m23 25 17-17m-1-5v7h7"/></svg>;}
function Check(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>;}
export function CampaignClip({role,playing,detail=false}:{role:ProcessRole;playing:boolean;detail?:boolean}){
  const {locale}=useLanguage();const ref=useRef<HTMLVideoElement>(null);
  const [src,poster]=role==="software"?[`maslul-project-demo-${locale}.mp4`,`maslul-project-demo-${locale}.jpg`]:CLIPS[role];
  const path=detail&&role==="online_shop"?"kefel-linen-detail-campaign.mp4":src;
  useEffect(()=>{const v=ref.current;if(!v)return;if(playing)void v.play().catch(()=>{});else v.pause();},[path,playing]);
  return <video ref={ref} src={`/showcase/${path}`} poster={`/showcase/${poster}`} muted loop playsInline preload="metadata" data-software={role==="software"}/>;
}
/** A real-looking interview form: labels stay put as the three example answers appear. */
export function QuestionnaireScene({role,playing,reduced=false}:{role:ProcessRole|null;playing:boolean;reduced?:boolean}){
  const {index}=useProcessSequence(FORM_TIMES,playing);const active=reduced?3:index;const example=PROCESS_EXAMPLES[role??"services"];
  const questions=[{q:"מה אתם מציעים?",a:example.kind},{q:role==="fundraising"?"מי האנשים שתרצו לצרף לעשייה?":"למי זה מתאים?",a:example.audienceSummary},{q:"מה מייחד אתכם?",a:example.answer}];
  return <div className={styles.questionnaire} data-form-stage={active}><header><span>isramarket</span><strong><Copy text="קודם מכירים אתכם"/></strong></header><div className={styles.formFields}>{questions.map((item,i)=><div key={item.q} data-filled={active>=i} data-active={active===i}><label><Copy text={item.q}/></label><div className={styles.answer}><span><Copy text={item.a}/></span>{active===i&&<i aria-hidden="true"/>}{active>i&&<Check/>}</div></div>)}</div><footer><Check/><Copy text="הפעילות, הקהל ומה שמייחד אתכם — הבסיס לתוכנית שלכם."/></footer></div>;
}
export function HeroBriefScene({role,playing}:{role:ProcessRole;playing:boolean}){
  const {index}=useProcessSequence(BRIEF_TIMES,playing);const example=PROCESS_EXAMPLES[role];
  return <div className={styles.brief} data-brief-stage={index}><div className={styles.briefInputs}>{[{label:"המטרה",value:PROCESS_GOALS[role][0]},{label:"הקהל",value:example.audienceSummary},{label:"מה מייחד אתכם",value:example.answer}].map(row=><div key={row.label}><small><Copy text={row.label}/></small><p><Copy text={row.value}/></p></div>)}</div><div className={styles.briefResult}><span><Copy text="הקמפיין שנבנה בשבילכם"/></span><strong><Copy text={example.name}/></strong><div>{[0,1,2].map(i=><div key={i}><CampaignArtwork role={role} index={i} support={i===1} ratio="4:5"/></div>)}</div></div></div>;
}
export function CampaignMaterialsScene({role:requested,playing,compact=false}:{role:ProcessRole|null;playing:boolean;compact?:boolean}){
  const t=useCopy();const role=requested??"online_shop",example=PROCESS_EXAMPLES[role];const channels=role==="software"?[2,0,3]:[2,0,1];
  return <div className={`${styles.materials} ${compact?styles.compact:""}`} data-campaign-materials><header><strong><Copy text="הקמפיין: {arg_0}" args={{arg_0:t(example.weeks[0])}}/></strong><span><Copy text={example.name}/></span></header><div className={styles.posts}>{channels.map((channel,i)=><div key={channel} className={styles.post}><ProcessSocialPost index={channel} name={example.name} caption={PROCESS_CAMPAIGNS[role][0].subline} video={i===2} material="campaign"><div className={styles.postMedia}>{i===2?<CampaignClip role={role} playing={playing} detail={compact}/>:<CampaignArtwork role={role} index={0} support={i===0} ratio="4:5"/>}</div></ProcessSocialPost>{compact&&<span className={styles.platformName}>{["Facebook","TikTok","Instagram","LinkedIn"][channel]}</span>}</div>)}</div></div>;
}
/** Illustrative results stay labelled; the campaign materials are the cause-and-effect anchor. */
export function CampaignGrowthScene({playing,reduced=false,compact=false,role="online_shop"}:{playing:boolean;reduced?:boolean;compact?:boolean;role?:ProcessRole}){
  const {index}=useProcessSequence(GROWTH_TIMES,playing);const active=reduced?2:index;
  const [count,setCount]=useState(12);const previous=useRef(12);
  useEffect(()=>{const target=[12,24,38][active];if(!playing){return;}const start=performance.now(),from=Math.min(previous.current,target);let frame=0;const tick=(now:number)=>{const p=Math.min(1,(now-start)/1100);const value=Math.round(from+(target-from)*(1-Math.pow(1-p,3)));previous.current=value;setCount(value);if(p<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[active,playing]);
  const value=reduced?38:count;
  const metric={online_shop:"הזמנות החודש",physical_shop:"הזמנות מראש",services:"פניות החודש",software:"הרשמות להתנסות",fundraising:"תרומות החודש"}[role];
  const outcome={online_shop:"יותר הזמנות מהקמפיינים שלכם",physical_shop:"יותר אנשים מזמינים מראש",services:"יותר אנשים פונים אליכם",software:"יותר אנשים מתנסים במוצר",fundraising:"יותר אנשים תומכים בעשייה"}[role];
  return <div className={`${styles.growth} ${compact?styles.compactGrowth:""}`} data-growth-stage={active}><header><span><Copy text="דוגמה למעקב אחר קמפיין"/></span><strong><Copy text={outcome}/></strong></header><div className={styles.result}><strong>{value}</strong><span><Copy text={metric}/></span><small><Copy text="לעומת 12 בתחילת החודש"/></small></div><div className={styles.growthCampaigns}>{[0,1,2].map((i)=><div key={i} data-active={i===active} style={{"--growth-step":i} as CSSProperties}><div><CampaignArtwork role={role} index={i} support={i===1} ratio="1:1"/></div><span><Copy text={["קמפיין היכרות","קמפיין המשך","קמפיין חדש"][i]}/></span>{i<=active&&<Check/>}</div>)}</div><p><Copy text="רואים מה מתקדם, ומשפרים את הקמפיין הבא."/></p><small className={styles.illustration}><Copy text="נתונים להמחשה"/></small></div>;
}
