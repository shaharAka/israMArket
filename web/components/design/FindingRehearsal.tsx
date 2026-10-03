"use client";

import Link from "next/link";
import { useState } from "react";
import { FindingCard } from "@/components/results/FindingCard";
import { DEMO_RECS, type RecommendationPayload } from "@/lib/api";
import { SegmentedControl } from "./Controls";

/** The shipped card, rehearsed without customer reads, paid generation or writes. */
export function FindingRehearsal() {
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
  return <section className="mx-auto max-w-3xl py-6">
    <h1 className="text-[28px] font-bold tracking-tight text-[color:var(--ink)]">מנתונים להצעה שאפשר לבדוק</h1>
    <p className="mt-2 text-[14px] leading-6 text-[color:var(--ink-soft)]">זהו הרכיב שמופיע באפליקציה. המספרים והעסק כאן מומצאים; לא קוראים ולא משנים חשבון.</p>
    <div className="my-6"><SegmentedControl label="מצב הנתונים בדוגמה" value={scenario} onChange={value => { setScenario(value); setReviewing(false); }} options={[
      { value: "connected", label: "שני מקורות" }, { value: "partial", label: "רק האתר" }, { value: "empty", label: "לפני מדידה" }, { value: "stale", label: "תוכנית חדשה" },
    ]} /></div>
    <FindingCard payload={payload} onReview={() => setReviewing(true)} />
    {reviewing ? <aside aria-label="מעבר לסקירת ההצעה בדוגמה" className="mt-6 rounded-xl bg-[var(--soft)] p-5 text-[14px] leading-7 text-[color:var(--ink-soft)]" role="status">
      <h2 className="text-[18px] font-semibold text-[color:var(--ink)]">{scenario === "stale" ? "נבדוק את התוכנית העדכנית" : "נפתח את הפוסט הקיים עם ההצעה לידו"}</h2>
      <p className="mt-2">{payload.suggestions.suggestions[0].review?.note_he}</p>
      <p className="mt-2">באפליקציה, הנוסח הקיים נשאר כפי שהוא. עורכים ובודקים לפני אישור; פתיחת המלצה לא מייצרת תמונות ולא מפרסמת.</p>
      <Link href="/preview" className="mt-2 inline-flex min-h-11 items-center font-semibold text-[color:var(--primary)] hover:underline">לעבור לחשבון ההדגמה ולראות את העורך</Link>
    </aside> : null}
  </section>;
}
