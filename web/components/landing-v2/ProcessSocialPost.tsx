"use client";
import Image from "next/image";
import type { ReactNode } from "react";
import { Copy } from "@/components/language/LanguageProvider";
import styles from "./process-story.module.css";

const CHANNELS = ["Facebook", "TikTok", "Instagram", "LinkedIn"] as const;
function Heart() { return <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>; }
function Like() { return <path d="M7 10H3v11h4m0-11 5-8c3 0 3 3 1 7h6a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7V10Z"/>; }
function Comment() { return <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z"/>; }
function Share() { return <path d="m22 2-7 20-4-9-9-4 20-7Zm0 0L11 13"/>; }
/** Platform chrome demonstrates formats, without invented likes, followers or endorsement. */
export function ProcessSocialPost({index,name,caption,video,material,children}:{index:number;name:string;caption:string;video:boolean;material:string;children:ReactNode}) {
  const channel=CHANNELS[index];
  const vertical=channel==="TikTok";
  const textFirst=channel==="Facebook"||channel==="LinkedIn";
  return <article className={styles.socialPost} data-social-platform={channel} data-campaign-material={video?"video":material}>
    <header className={styles.socialHeader}><span className={styles.socialAvatar}><Image src={`/connectors/${channel.toLowerCase()}.svg`} width={22} height={22} alt=""/></span><strong><Copy text={name}/></strong><span className={styles.socialPlatform} dir="ltr">{channel}</span></header>
    {textFirst&&<p className={styles.socialCaption}><Copy text={caption}/></p>}
    <div className={styles.timelineArtwork}>{children}</div>
    <div className={styles.socialActions} aria-hidden="true"><svg viewBox="0 0 24 24">{channel==="Facebook"||channel==="LinkedIn"?<Like/>:<Heart/>}</svg><svg viewBox="0 0 24 24"><Comment/></svg><svg viewBox="0 0 24 24"><Share/></svg>{channel==="Instagram"&&<svg viewBox="0 0 24 24"><path d="M5 3h14v18l-7-4-7 4V3Z"/></svg>}</div>
    {!textFirst&&<p className={styles.socialCaption}><Copy text={caption}/></p>}
    {!vertical&&(channel==="Facebook"||channel==="LinkedIn")&&<div className={styles.networkLabels} aria-hidden="true"><Copy text="אהבתי"/><Copy text="תגובה"/><Copy text="שיתוף"/></div>}
  </article>;
}
