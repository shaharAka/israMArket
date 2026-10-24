"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, useLanguage } from "@/components/language/LanguageProvider";
import { endpoints, type IntegrationsPayload } from "@/lib/api";
import { ProviderLogo } from "@/components/landing-v2/ProviderLogo";
import { StepShell } from "./ui";
import type { StepProps } from "./steps";
import styles from "./connections-step.module.css";

/** Public links have already been collected. This step grants account access, not URLs. */
export function ConnectionsStep(props: StepProps & {mock: boolean; busy: boolean}) {
  const {locale}=useLanguage();
  const [data,setData]=useState<IntegrationsPayload|null>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{if(props.mock)return;let live=true;endpoints.integrations().then(value=>{if(live)setData(value);}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[props.mock]);
  const links=Object.entries(props.flow.draft.links).filter(([,value])=>value);
  const cards=[
    {key:"ga4",provider:"google-analytics",name:"Google Analytics",detail:"מאיפה מגיעים לאתר ומה עושים בו",hasLink:Boolean(props.flow.draft.links.website)},
    {key:"meta",provider:"facebook-instagram",name:"Facebook · Instagram",detail:"ביצועי הפוסטים והמודעות שלכם",hasLink:Boolean(props.flow.draft.links.instagram||props.flow.draft.links.facebook)},
  ] as const;
  const sortedCards=[...cards].sort((a,b)=>Number(b.hasLink)-Number(a.hasLink));
  return <StepShell {...props} tip={undefined} title="עכשיו מחברים את החשבונות שלכם" why="מאשרים גישה לנתונים בכלי הקידום והמדידה שלכם, כדי לדייק את התוכנית. החיבור נעשה בחשבון של אותו שירות." primary="להמשיך להגדרת המטרות" primaryDisabled={props.busy} onPrimary={props.next}>
    {links.length>0&&<section className={styles.saved}><h2><Copy text="כבר שיתפתם איתנו"/></h2>{links.map(([key,value])=><p key={key}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><bdi>{value}</bdi></p>)}</section>}
    <ol className={styles.how}><li><Copy text="בוחרים כלי"/></li><li><Copy text="מאשרים גישה בחשבון שלכם"/></li><li><Copy text="חוזרים לכאן וממשיכים"/></li></ol>
    <div className={styles.cards}>{sortedCards.map(card=>{const item=data?.integrations.find(i=>i.provider===card.key);const ready=item?.source_readiness?.status==="ready";const allowed=card.key==="ga4"?data?.ga4_ready:data?.meta_ready;return <section key={card.key} className={styles.card}><ProviderLogo provider={card.provider} size={32}/><div><h2>{card.name}</h2><p><Copy text={card.detail}/></p><span><Copy text={ready?"הנתונים נקראו":item?.connected?"הגישה אושרה. ממשיכים לבחירת הנתונים":data&&!allowed?"החיבור עדיין לא זמין לחשבון הזה":"ממתין לאישור שלכם"}/></span></div><Link href={`/integrations?lang=${locale}#${card.key}`}><Copy text={ready?"לבדוק את החיבור":"להמשיך לחיבור"}/></Link></section>;})}</div>
    {failed&&<p role="status" className={styles.note}><Copy text="לא הצלחנו לבדוק את מצב החיבורים. אפשר לפתוח את מסך החיבור ולנסות שם."/></p>}
    <p className={styles.note}><Copy text="אין לכם חשבון בכלי הזה? אפשר להמשיך ולהוסיף אותו בהמשך."/></p>
  </StepShell>;
}
