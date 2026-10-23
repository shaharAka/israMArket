"use client";

import { useCopy } from "@/components/language/LanguageProvider";
import type { RoadmapPost } from "@/lib/api";
import { ownerNeedsOf } from "@/lib/postLifecycle";
import styles from "./campaign.module.css";

// A grounded editing starting point, not an invented finding or a promise of lift.
// The generation endpoint receives the saved full creative/brand brief on submission.
export function CampaignDirection({ post, onUse }: { post: RoadmapPost; onUse: (instruction: string) => void }) {
  const t=useCopy();
  if(ownerNeedsOf(post).length || !post.cta?.trim())return null;
  const instruction=t("חדדו את המסר לקהל של הפוסט. הבליטו את ההזמנה לפעולה הקיימת, בלי להוסיף פרטים, ושמרו על הסגנון של העסק.");
  return <section className={styles.direction} aria-label={t("כיוון לעריכה")}>
    <h3>{t("כיוון לעריכה")}</h3>
    <p>{t("נחדד את המסר סביב הפעולה ״{arg_0}״, עם הפרטים והסגנון שכבר בחרתם.",{arg_0:post.cta})}</p>
    <button type="button" onClick={()=>onUse(instruction)}>{t("להשתמש בכיוון הזה לפוסט הזה")}</button>
  </section>;
}
