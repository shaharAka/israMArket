"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
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

export type ProductScreen = "plan" | "posts" | "results";
const FEATURES = [
  { key: "plan", label: "התוכנית", benefit: "מהמחקר, לצעדים שאפשר לבצע." },
  { key: "posts", label: "הפוסטים", benefit: "תוכן שנכתב לפי התוכנית ובאופי של העסק." },
  { key: "results", label: "התוצאות", benefit: "מה למדנו ומה ננסה בפוסט הבא." },
] as const;

/** Live product views, not independent marketing replicas. Fixtures are local to this view. */
export function ProductFeatureShowcase({ path, initialScreen = "plan", initialPost }: { path: ExamplePath; initialScreen?: ProductScreen; initialPost?: number }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [screen, setScreen] = useState<ProductScreen>(initialScreen);
  const [postIndex, setPostIndex] = useState<number | null>(initialPost ?? null);
  const business = BUSINESS_EXAMPLES[path];
  const { plan, posts, brand } = productFixtures(path, t, locale);
  const post = postIndex === null ? null : posts[postIndex];
  const active = FEATURES.find(item => item.key === screen)!;
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const rtl = event.currentTarget.closest("[dir]")?.getAttribute("dir") === "rtl" || document.documentElement.dir === "rtl";
    let next = index;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = FEATURES.length - 1;
    else if (event.key === "ArrowRight") next = (index + (rtl ? -1 : 1) + FEATURES.length) % FEATURES.length;
    else if (event.key === "ArrowLeft") next = (index + (rtl ? 1 : -1) + FEATURES.length) % FEATURES.length;
    else return;
    event.preventDefault(); setScreen(FEATURES[next].key); buttons.current[next]?.focus();
  }
  return <div className={styles.showcase}>
    <div className={styles.tabs} role="tablist" aria-label={t("מסכי המערכת")}>
      {FEATURES.map((item, index) => <button key={item.key} type="button" role="tab"
        id={`${id}-${item.key}-tab`} aria-selected={screen === item.key} aria-controls={`${id}-${item.key}-panel`}
        tabIndex={screen === item.key ? 0 : -1} ref={node => { buttons.current[index] = node; }}
        onClick={() => setScreen(item.key)} onKeyDown={event => move(event, index)}><Copy text={item.label} /></button>)}
    </div>
    <div className={styles.frame}>
      <header className={styles.header}><strong><Copy text={business.name} /></strong><p><Copy text={active.benefit} /></p></header>
      {FEATURES.map(item => <div key={item.key} className={styles.screen} role="tabpanel" hidden={screen !== item.key}
        tabIndex={screen === item.key ? 0 : -1} id={`${id}-${item.key}-panel`} aria-labelledby={`${id}-${item.key}-tab`}>
        {item.key === "plan" && screen === "plan" ? <MonthPlanOverview strategy={plan} currentWeek={1}
          nextAction={{ title_he: t("לבדוק את הפוסט שהכנו.") }}
          weekAction={<button className={styles.textAction} onClick={() => { setPostIndex(0); setScreen("posts"); buttons.current[1]?.focus(); }}><Copy text="לראות את הפוסט שבתוכנית" /></button>} /> : null}
        {item.key === "posts" && screen === "posts" ? post ? <PostWorkspace header={<>
          <button className={styles.textAction} onClick={() => { setPostIndex(null); buttons.current[1]?.focus(); }}><IconArrowRight className="h-4 w-4" /><Copy text="הפוסטים" /></button>
          <h2 className={styles.postTitle}>{post.title}</h2><p className={styles.postMeta}><ChannelIcon channel="instagram" /> Instagram · <Copy text="מוכן לאישור" /></p>
        </>}
          preview={<PostPreview style={{ width: "min(100%, 320px)" }} media={<CardStage post={post} brand={brand} businessName={t(business.name)} rounded={false} />} caption={<p className={styles.caption}>{post.caption}</p>} />}
          panel={<PostActionPanel why={post.why_line} needs={<div className={styles.ownerCheck}><Copy text="לבדוק את התמונה, הטקסט והפרטים לפני הפרסום." /></div>} />} />
          : <PostFeed posts={posts} brand={brand} strategy={plan} onOpen={setPostIndex}
            postHref={index => `/design/business?persona=${path}&screen=posts&post=${index}&lang=${locale}`} /> : null}
        {item.key === "results" && screen === "results" ? <BusinessProductProof path={path} screen="results" /> : null}
      </div>)}
    </div>
  </div>;
}
