"use client";

import { useId, useRef, useState } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { MonthPlanOverview } from "@/components/plan/MonthPlanOverview";
import { PostFeed } from "@/components/posts/PostFeed";
import { PostWorkspace, PostPreview, PostActionPanel } from "@/components/posts/PostWorkspace";
import { CardStage } from "@/components/CardCanvas";
import { ChannelIcon } from "@/components/posts/ChannelIcon";
import { IconArrowRight } from "@/lib/icons";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import { BusinessProductProof } from "./BusinessProductProof";
import { productFixtures } from "./productFixtures";
import styles from "./product-feature.module.css";
import { useProductPlayback } from "./useProductPlayback";

export type ProductScreen = "plan" | "posts" | "results";
const FEATURES = [
  { key: "plan", label: "תוכנית השיווק", benefit: "מהמחקר, לצעדים שאפשר לבצע." },
  { key: "posts", label: "יצירת פוסטים", benefit: "תוכן שנכתב לפי התוכנית ובאופי של העסק." },
  { key: "results", label: "תוצאות ושיפור", benefit: "מה למדנו ומה ננסה בפוסט הבא." },
] as const;

/** Live product views, not independent marketing replicas. Fixtures are local to this view. */
export function ProductFeatureShowcase({ path, initialScreen = "plan", initialPost, presentation = "full" }: { path: ExamplePath; initialScreen?: ProductScreen; initialPost?: number; presentation?: "full" | "hero" }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [screen, setScreen] = useState<ProductScreen>(initialScreen);
  const [postIndex, setPostIndex] = useState<number | null>(initialPost ?? 0);
  const { frame, viewport, cursor, playing, requested, reduced, pause, toggle } = useProductPlayback(presentation === "hero", screen, setScreen, setPostIndex);
  const business = BUSINESS_EXAMPLES[path];
  const { plan, posts, brand } = productFixtures(path, t, locale);
  const post = postIndex === null ? null : posts[postIndex];
  const active = FEATURES.find(item => item.key === screen)!;
  return <div className={styles.showcase} data-presentation={presentation} data-playing={playing}
    onPointerDownCapture={event => { if (!(event.target as HTMLElement).closest("[data-playback-control]")) pause(); }}
    onFocusCapture={event => { if (!(event.target as HTMLElement).closest("[data-playback-control]")) pause(); }}
    onWheelCapture={pause}>

    <div className={styles.frame} ref={frame}>
      <header className={styles.header}><strong><Copy text={business.name} /></strong><p className="sr-only" aria-live={playing ? "off" : "polite"}><Copy text={active.benefit} /></p></header>
      <div className={styles.views} ref={viewport}>
      {FEATURES.map(item => <section key={item.key} className={styles.screen} data-active={screen === item.key}
        aria-hidden={screen !== item.key} inert={screen !== item.key}
        id={`${id}-${item.key}-view`} aria-labelledby={`${id}-${item.key}-control`}>
        {item.key === "plan" ? <MonthPlanOverview strategy={plan} currentWeek={1}
          nextAction={{ title_he: t("לבדוק את הפוסט שהכנו.") }}
          weekAction={<button className={styles.textAction} onClick={() => { setPostIndex(0); setScreen("posts"); buttons.current[1]?.focus({ preventScroll: true }); }}><Copy text="לראות את הפוסט שבתוכנית" /></button>} /> : null}
        {item.key === "posts" ? post ? <PostWorkspace header={<>
          <button className={styles.textAction} onClick={() => { setPostIndex(null); buttons.current[1]?.focus({ preventScroll: true }); }}><IconArrowRight className="h-4 w-4" /><Copy text="הפוסטים" /></button>
          <h2 className={styles.postTitle}>{post.title}</h2><p className={styles.postMeta}><ChannelIcon channel="instagram" /> Instagram · <Copy text="מוכן לאישור" /></p>
        </>}
          preview={<PostPreview style={{ width: "min(100%, 240px)" }} media={<CardStage post={post} brand={brand} businessName={t(business.name)} rounded={false} />} caption={<p className={styles.caption}>{post.caption}</p>} />}
          panel={<PostActionPanel why={post.why_line} needs={<div className={styles.ownerCheck}><Copy text="לבדוק את התמונה, הטקסט והפרטים לפני הפרסום." /></div>} />} />
          : <PostFeed posts={posts} brand={brand} strategy={plan} onOpen={setPostIndex}
            postHref={index => `/design/business?persona=${path}&screen=posts&post=${index}&lang=${locale}`} /> : null}
        {item.key === "results" ? <BusinessProductProof path={path} screen="results" /> : null}
      </section>)}
      </div>
      {cursor ? <div className={styles.cursorLayer} aria-hidden="true"><span className={styles.cursor} data-pressed={cursor.pressed} style={{ left: cursor.x, top: cursor.y }}>
        <svg width="34" height="42" viewBox="0 0 34 42" fill="none"><path d="M10 22V5a3 3 0 0 1 6 0v12-3a3 3 0 0 1 6 0v4-2a3 3 0 0 1 6 0v4a3 3 0 0 1 5 2v7c0 4-3 7-4 10H13c-1-5-4-7-7-11L2 23c-2-3 2-6 5-3l3 2Z" fill="white" stroke="#17252c" strokeWidth="2" strokeLinejoin="round"/></svg>
      </span></div> : null}
    </div>
    <div className={styles.controls}>
    <div className={styles.selector} role="group" aria-label={t("לבחור מה לראות במערכת")}>
      {FEATURES.map((item, index) => <button key={item.key} type="button"
        id={`${id}-${item.key}-control`} aria-pressed={screen === item.key} aria-controls={`${id}-${item.key}-view`}
        ref={node => { buttons.current[index] = node; }}
        onClick={() => { pause(); setScreen(item.key); if (item.key === "posts") setPostIndex(0); }}>
        <span className={styles.featureDot} aria-hidden="true" /><Copy text={item.label} />
      </button>)}
    </div>
    {presentation === "hero" && !reduced ? <button type="button" className={styles.playback} data-playback-control
      onClick={toggle} aria-label={t(requested ? "לעצור את ההדגמה" : "להפעיל את ההדגמה")} title={t(requested ? "לעצור את ההדגמה" : "להפעיל את ההדגמה")}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{requested ? <path d="M3 2h3v12H3zm7 0h3v12h-3z" /> : <path d="m4 2 10 6-10 6z" />}</svg>
    </button> : null}
    </div>
  </div>;
}
