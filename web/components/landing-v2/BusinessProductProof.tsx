"use client";

import { useState } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { PlanBrief } from "@/components/design/PlanBrief";
import { UIAction, UIDialog } from "@/components/design/Controls";
import { FindingCard } from "@/components/results/FindingCard";
import type { RecommendationPayload } from "@/lib/api";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import styles from "./product-proof.module.css";

/** Fixtures stay local to marketing/design previews: no enterDemo, API or account mutation. */
export function BusinessProductProof({ path, screen, compact = false }: { path: ExamplePath; screen: "plan" | "results"; compact?: boolean }) {
  const example = BUSINESS_EXAMPLES[path];
  const t = useCopy();
  const [open, setOpen] = useState(false);
  const payload: RecommendationPayload = {
    available: true, week_of: "2026-09-20",
    suggestions: {
      week_summary: t(example.finding),
      basis: { version: 1,
        sources: [{ key: "ga4", label: t("נתוני האתר · דוגמה"), status: "available", period: { start: "2026-09-20", end: "2026-09-26" }, read_at: "2026-09-27T08:00:00Z" }],
        observations: example.comparison.map((label, index) => ({ source: "ga4", metric: `example_clicks_${index}`, label: `${t(label)} · ${t("לחיצות")}`, value: index === 0 ? 12 : 4 })),
        limits: [t(example.missing)],
      },
      suggestions: [{ priority: "medium", title: t(example.finding), action: t(example.next), evidence: t(example.measure), target: "post",
        success_check: t("נבדוק את הפוסט הבא, ונפריד בין לחיצות לבין התוצאה שהעסק רוצה."),
        review: { kind: "post", status: "ready", href: "#", label: t("לראות את השינוי לפוסט הבא"), note_he: t("הצעה לדוגמה. אתם בודקים ומחליטים לפני פרסום.") },
      }],
    },
  };
  return <div className={styles.proof} data-product-screen={screen}>
    {screen === "plan" ? <PlanBrief compact={compact} businessName={t(example.name)} direction={t(example.plan)} why={t(example.learned)}
      measure={t(example.metric)} baseline={t("עוד אין נקודת התחלה. כשנחבר מדידה נוכל לעקוב אחרי ההתקדמות.")}
      ownerAction={t(example.recommendation)} action={<UIAction variant="text" onClick={() => setOpen(true)}><Copy text="לראות את הפוסט שבתוכנית" /></UIAction>} />
      : <FindingCard payload={payload} primary={false} onReview={() => setOpen(true)} />}
    <p className={styles.note}><Copy text="רכיב מהמערכת עם נתוני דוגמה, שמתאימים לעסק הזה." /></p>
    <UIDialog open={open} onClose={() => setOpen(false)} title={t(screen === "plan" ? "הפוסט הבא בתוכנית" : "השינוי שננסה בפוסט הבא")} description={t("תצוגה עם נתונים לדוגמה. החשבון שלכם לא משתנה.")}>
      <div className={styles.proposal}><p className={styles.label}><Copy text={example.name} /></p><h3><Copy text={screen === "plan" ? example.draft : example.next} /></h3><p><Copy text={example.caption} /></p><p className={styles.limit}><Copy text={example.missing} /></p><UIAction onClick={() => setOpen(false)}><Copy text="לחזור לדוגמה" /></UIAction></div>
    </UIDialog>
  </div>;
}
