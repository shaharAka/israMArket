"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useState } from "react";
import { FindingCard } from "@/components/results/FindingCard";
import { DEMO_RECS, type RecommendationPayload } from "@/lib/api";
import { SegmentedControl } from "./Controls";

/** The shipped card, rehearsed without customer reads, paid generation or writes. */
export function FindingRehearsal() {
  const t = useCopy();
  const [scenario, setScenario] = useState("connected");
  const [reviewing, setReviewing] = useState(false);
  const payload: RecommendationPayload = structuredClone(DEMO_RECS);
  payload.created_at = "2026-10-02T08:00:00Z";
  const basis = payload.suggestions.basis!;
  basis.sources = basis.sources.map(source => ({ ...source, period: { start: "2026-09-04", end: "2026-10-01" }, read_at: payload.created_at!, stale: false }));
  if (scenario === "partial" || scenario === "empty") {
    basis.sources = basis.sources.map(source => scenario === "empty" || source.key === "meta_ads" ? { ...source, status: "missing", read_at: "", period: {} } : source);
    basis.observations = scenario === "empty" ? [] : basis.observations.filter(fact => fact.source === "ga4");
  }
  if (scenario === "stale") {
    basis.sources = structuredClone(DEMO_RECS.suggestions.basis!.sources);
    payload.suggestions.suggestions[0].review = { ...payload.suggestions.suggestions[0].review!, kind: "plan", status: "stale", href: "/strategy?recommendation=1&suggestion=0", label: "לבדוק מה מתאים לתוכנית", note_he: "התוכנית התחלפה מאז ההמלצה. בדקו מה עדיין מתאים לתוכנית הנוכחית." };
  }
  // Only these public, explicitly fictional fixtures are translated. Customer
  // interpretations and saved posts retain their own language and wording.
  basis.sources = basis.sources.map(source => ({ ...source, label: t(source.label) }));
  basis.observations = basis.observations.map(fact => ({ ...fact, label: t(fact.label) }));
  basis.limits = basis.limits.map(limit => t(limit));
  payload.suggestions.suggestions = payload.suggestions.suggestions.map(item => ({ ...item,
    title: t(item.title), action: t(item.action),
    hypothesis: item.hypothesis ? t(item.hypothesis) : item.hypothesis,
    evidence: t(item.evidence), success_check: item.success_check ? t(item.success_check) : item.success_check,
    review: item.review ? { ...item.review, label: t(item.review.label), note_he: t(item.review.note_he) } : item.review,
  }));
  return <section className="mx-auto max-w-3xl py-6">
    <h1 className="text-[28px] font-bold tracking-tight text-[color:var(--ink)]"><Copy text="מנתונים להצעה שאפשר לבדוק" /></h1>
    <p className="mt-2 text-[14px] leading-6 text-[color:var(--ink-soft)]"><Copy text="זהו הרכיב שמופיע באפליקציה. המספרים והעסק כאן מומצאים; לא קוראים ולא משנים חשבון." /></p>
    <div className="my-6"><SegmentedControl label={t("מצב הנתונים בדוגמה")} value={scenario} onChange={value => { setScenario(value); setReviewing(false); }} options={[
      { value: "connected", label: t("שני מקורות") }, { value: "partial", label: t("רק האתר") }, { value: "empty", label: t("לפני מדידה") }, { value: "stale", label: t("תוכנית חדשה") },
    ]} /></div>
    <FindingCard payload={payload} onReview={() => setReviewing(true)} />
    {reviewing ? <aside aria-label={t("מעבר לסקירת ההצעה בדוגמה")} className="mt-6 rounded-xl bg-[var(--soft)] p-5 text-[14px] leading-7 text-[color:var(--ink-soft)]" role="status">
      <h2 className="text-[18px] font-semibold text-[color:var(--ink)]">{scenario === "stale" ? t("נבדוק את התוכנית העדכנית") : t("נפתח את הפוסט הקיים עם ההצעה לידו")}</h2>
      <p className="mt-2">{payload.suggestions.suggestions[0].review?.note_he}</p>
      <p className="mt-2"><Copy text="באפליקציה, הנוסח הקיים נשאר כפי שהוא. עורכים ובודקים לפני אישור; פתיחת המלצה לא מייצרת תמונות ולא מפרסמת." /></p>
      <Link href="/preview" className="mt-2 inline-flex min-h-11 items-center font-semibold text-[color:var(--primary)] hover:underline"><Copy text="לעבור לחשבון ההדגמה ולראות את העורך" /></Link>
    </aside> : null}
  </section>;
}
