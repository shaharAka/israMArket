"use client";

import Link from "next/link";
import { useEffect } from "react";
import { MonthBuildProgress } from "@/components/MonthBuildProgress";
import { IconArrowLeft } from "@/lib/icons";
import { loadTrial, useTrial } from "@/lib/trial";
import ui from "./chrome.module.css";

const actionClass = "drawn-button inline-flex min-h-12 items-center justify-center gap-2.5 bg-[var(--primary)] px-6 text-base text-white hover:bg-[var(--primary-dark)]";

/** The plan exists but has no posts: guide the owner, or resume a requested build. */
export function FirstPosts({ onDone }: { onDone: () => void }) {
  const { payload, failed, loading } = useTrial();
  // Photos can be added on another screen without refreshing the shared journey cache.
  useEffect(() => {
    void loadTrial(true);
  }, []);
  const foundations = ["photos", "featured", "voice"].map((key) => payload?.steps.find((step) => step.key === key));
  const next = foundations.find((step) => step && step.status !== "done");
  const startStep = payload?.steps.find((step) => step.key === "start_posts");
  const ready = foundations.every((step) => step?.status === "done") &&
    (startStep?.status === "todo" || startStep?.status === "done");

  return (
    <MonthBuildProgress
      kind="posts"
      onDone={() => {
        void loadTrial(true);
        onDone();
      }}
      idle={({ start }) => (
        <section className={`${ui.card} px-6 py-8 sm:px-8`} aria-labelledby="first-post-heading">
          <h2 id="first-post-heading" className="text-xl font-bold tracking-tight text-[color:var(--ink)]">
            {ready ? "אפשר להתחיל לכתוב" : "נכין את הפוסטים לפי התוכנית"}
          </h2>
          <p className="mt-2 max-w-lg text-[15px] leading-7 text-[color:var(--ink-soft)]">
            {ready
              ? "נכתוב לפי המוצרים או השירותים שבחרתם והסגנון שלכם. הפוסטים יחכו כאן לבדיקה ולאישור לפני הפרסום."
              : "נשתמש בתמונות של העסק, נבחר מה לקדם ונבדוק את הסגנון. אפשר להכין פוסטים גם כשעוד לא סיימתם לחבר את החשבונות."}
          </p>
          {failed && !loading ? (
            <div className="mt-5">
              <p role="alert" className="text-sm text-[color:var(--ink-soft)]">לא הצלחנו לבדוק מה כבר הושלם. נסו שוב.</p>
              <button type="button" className={`${actionClass} mt-4`} onClick={() => void loadTrial(true)}>לבדוק שוב</button>
            </div>
          ) : loading || !payload ? (
            <p role="status" className="mt-5 text-sm text-[color:var(--ink-muted)]">בודקים מה כבר מוכן…</p>
          ) : ready ? (
            <button type="button" className={`${actionClass} mt-6`} onClick={() => void start()}>
              להתחיל לכתוב את הפוסטים
              <IconArrowLeft className="h-4 w-4" />
            </button>
          ) : next ? (
            <div className="mt-6">
              <p className="text-[15px] font-semibold text-[color:var(--ink)]">{next.title_he}</p>
              <p className="mt-1 max-w-lg text-sm leading-6 text-[color:var(--ink-soft)]">{next.why_he}</p>
              <Link href={next.href} className={`${actionClass} mt-4`}>
                {next.action_he}
                <IconArrowLeft className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-sm leading-6 text-[color:var(--ink-soft)]">{startStep?.note_he || "נבדוק בתוכנית מה עוד צריך להשלים לפני הכתיבה."}</p>
              <Link href="/dashboard#step-start_posts" className={`${actionClass} mt-4`}>לראות את הצעד הבא</Link>
            </div>
          )}
        </section>
      )}
    />
  );
}
