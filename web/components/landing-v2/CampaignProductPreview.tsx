"use client";

import { useState } from "react";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { CampaignWeek } from "@/components/posts/CampaignWeek";
import { CampaignPostCard } from "@/components/posts/CampaignPostCard";
import { CampaignBrief } from "@/components/posts/CampaignBrief";
import { CardStage } from "@/components/CardCanvas";
import { PostWorkspace, PostPreview } from "@/components/posts/PostWorkspace";
import { productFixtures } from "./productFixtures";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import styles from "./product-feature.module.css";

// תכלית: להראות איך התוכנית מתחלקת לשבועות ולפוסטים, באותו ממשק של הקמפיין.
// בחירה כאן פותחת תצוגה מקומית בלבד; אין יצירה בתשלום או שינוי בחשבון.
export function CampaignProductPreview({ path, initialWeek = 1 }: { path: ExamplePath; initialWeek?: number }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const { campaign, brand } = productFixtures(path, t, locale);
  const [week, setWeek] = useState(initialWeek);
  const [selected, setSelected] = useState<string | null>(null);
  const posts = campaign.roadmap.posts;
  const post = posts.find(item => item.uid === selected);
  return <div className={styles.campaignPreview}>
    {post ? <>
      <button className={styles.textAction} onClick={() => setSelected(null)}>{t("לחזור לקמפיין")}</button>
      <PostWorkspace header={<h2 className={styles.postTitle}>{post.title}</h2>}
        preview={<PostPreview style={{ width: "min(100%, 220px)" }} media={<CardStage post={post} brand={brand} businessName={t(BUSINESS_EXAMPLES[path].name)} rounded={false} />} caption={<p className={styles.caption}>{post.caption}</p>} />}
        panel={<CampaignBrief post={post} audience={post.audience_name || ""} dna={null} />} />
    </> : <>
      <h2 className={styles.postTitle}>{t("הקמפיין שלכם")}</h2>
      <div className={styles.campaignWeeks} role="group" aria-label={t("לבחור שבוע בקמפיין")}>
        {[1, 2].map(value => <button key={value} aria-pressed={week === value} onClick={() => setWeek(value)}>{t("שבוע {arg_0}", { arg_0: value })}</button>)}
      </div>
      <CampaignWeek preview week={week} posts={posts.filter(item => item.week === week)} strategy={campaign}>
        {posts.filter(item => item.week === week).map(item => <CampaignPostCard key={item.uid} post={item} strategy={campaign} onChoose={() => setSelected(item.uid!)} />)}
      </CampaignWeek>
    </>}
  </div>;
}
