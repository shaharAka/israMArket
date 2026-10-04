"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { endpoints, type RecommendationPayload } from "@/lib/api";
import { IconChevron } from "@/lib/icons";

/**
 * Stable ID, scoped by the server to the signed-in business. This is read-only context:
 * one line that says which suggestion the owner came to check, and the rest on demand, so
 * the plan or the post stays the first thing on a phone's screen.
 */
function Review({ planId, postUid, targetUnavailable }: { planId?: number; postUid?: string; targetUnavailable?: boolean }) {
  const params = useSearchParams();
  const rawId = params.get("recommendation");
  const id = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null;
  const rawIndex = params.get("suggestion") ?? "0";
  const index = /^\d+$/.test(rawIndex) ? Number(rawIndex) : -1;
  const [data, setData] = useState<{ id: number; payload?: RecommendationPayload; error?: string } | null>(null);
  useEffect(() => {
    if (id === null) return;
    let active = true;
    endpoints.recommendation(id).then(payload => { if (active) setData({ id, payload }); })
      .catch(() => { if (active) setData({ id, error: "ההמלצה אינה זמינה כרגע. אפשר להמשיך בתוכנית ולחזור להצעה העדכנית." }); });
    return () => { active = false; };
  }, [id]);
  if (rawId === null) return null;
  const item = data?.id === id ? data.payload?.suggestions.suggestions[index] : undefined;
  const review = item?.review;
  const matches = Boolean(review && review.plan_id === planId && (!postUid || (review.kind === "post" && review.post_uid === postUid)));
  const valid = Boolean(item && matches && !targetUnavailable && (item.review?.status === "ready" || item.review?.status === "changed"));
  const loading = id !== null && index >= 0 && data?.id !== id;
  const reason = targetUnavailable ? "הקישור אינו מתאים לפוסט בתוכנית הנוכחית. נשארתם ברשימה כדי לבחור את הפוסט המתאים."
    : id === null || index < 0 ? "קישור ההמלצה אינו תקין."
    : loading ? "טוענים את ההצעה…"
    : data?.error || item?.review?.note_he || "היעד השתנה או שאין הצעה כזו. בדקו מה מתאים לתוכנית הנוכחית.";
  // The reason's first sentence is the line ("התוכנית התחלפה מאז ההמלצה"); the rest opens below.
  const cut = reason.indexOf(". ");
  const lead = cut > 0 ? reason.slice(0, cut) : reason.replace(/\.$/, "");
  const more = cut > 0 ? reason.slice(cut + 2) : "";

  return <details aria-label="ההצעה שבאתם לבדוק" className="group/review mb-6 rounded-xl bg-[var(--soft)] px-4 text-[14px] leading-6 text-[color:var(--ink-soft)] sm:px-5">
    <summary className="flex min-h-12 cursor-pointer list-none items-start gap-3 py-3 [&::-webkit-details-marker]:hidden">
      {/* Words first, the sun dot beside them: this is the thing being checked. */}
      <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--sun)]" />
      <span className="min-w-0 flex-1">
        <strong className="font-semibold text-[color:var(--ink)]">{valid ? "ההצעה שבאתם לבדוק" : "בדיקת המלצה קודמת"}</strong>
        {valid ? item?.title ? <>: {item.title}</> : null : <>: {lead}</>}
      </span>
      <IconChevron className="mt-1 h-4 w-4 shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 ease-[cubic-bezier(.2,.7,.2,1)] group-open/review:rotate-90 motion-reduce:transition-none" />
    </summary>
    <div className="space-y-2 pb-3 ps-5">
      {valid ? <>
        <p>{item?.action}</p>
        {item?.success_check ? <p><strong className="font-semibold text-[color:var(--ink)]">איך נבדוק אם זה הצליח: </strong>{item.success_check}</p> : null}
        {item?.review?.note_he ? <p className="text-[12px] text-[color:var(--ink-muted)]">{item.review.note_he}</p> : null}
      </> : <>
        {more ? <p>{more}</p> : null}
        {item ? <p><strong className="font-semibold text-[color:var(--ink)]">מה הוצע אז: </strong>{item.action}</p> : null}
      </>}
      <Link href="/recommendations" className="inline-flex min-h-11 items-center font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4">לראות את ההמלצות העדכניות</Link>
    </div>
  </details>;
}

export function RecommendationReview(props: { planId?: number; postUid?: string; targetUnavailable?: boolean }) {
  return <Suspense><Review {...props} /></Suspense>;
}
