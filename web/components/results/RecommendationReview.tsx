"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { endpoints, type RecommendationPayload } from "@/lib/api";

/** Stable ID, scoped by the server to the signed-in business. This is read-only context. */
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
  return <aside aria-label="ההצעה שבאתם לבדוק" className="mb-6 rounded-xl bg-[var(--soft)] p-4 text-[14px] leading-6 text-[color:var(--ink-soft)] sm:p-5">
    <p className="font-semibold text-[color:var(--ink)]">{valid ? "ההצעה שבאתם לבדוק" : "בדיקת המלצה קודמת"}</p>
    {valid ? <>
      <p className="mt-2">{item?.action}</p>
      {item?.success_check ? <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 font-medium">איך נבדוק אם זה עבד</summary><p>{item.success_check}</p></details> : null}
      <p className="mt-2 text-[12px] text-[color:var(--ink-muted)]">{item?.review?.note_he}</p>
    </> : <p className="mt-2">{targetUnavailable ? "הקישור אינו מתאים לפוסט בתוכנית הנוכחית. נשארתם ברשימה כדי לבחור את הפוסט המתאים." : id === null || index < 0 ? "קישור ההמלצה אינו תקין." : data?.id !== id ? "טוענים את ההצעה…" : data.error || item?.review?.note_he || "היעד השתנה או שאין הצעה כזו. בדקו מה מתאים לתוכנית הנוכחית."}</p>}
    {!valid && item ? <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 font-medium">מה הוצע אז</summary><p>{item.action}</p></details> : null}
    <Link href="/recommendations" className="mt-2 inline-flex min-h-11 items-center font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4">לראות את ההמלצות העדכניות</Link>
  </aside>;
}

export function RecommendationReview(props: { planId?: number; postUid?: string; targetUnavailable?: boolean }) {
  return <Suspense><Review {...props} /></Suspense>;
}
