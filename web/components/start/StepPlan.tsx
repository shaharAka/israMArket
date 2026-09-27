"use client";

import { useEffect, useState } from "react";
import { ApiError, type PlanInsight } from "@/lib/api";
import { draftForApi, fetchPlanPreview, signature } from "@/lib/draft";
import { lookOf } from "./BusinessCard";
import { IdeaCard } from "./IdeaCard";
import { IdeaSheet } from "./IdeaSheet";
import type { StepProps } from "./steps";
import { QuietLink, StepShell } from "./ui";
import styles from "./start.module.css";

/**
 * The reveal, in three layers: what we found, the two directions to choose between (the
 * decision of this screen, so it is the visual centre), and only then what the posts in
 * the chosen direction would look like. Posts are the output of the plan, not the product.
 */

const SOURCE_HE: Record<string, string> = {
  site: "מהאתר שלכם",
  answers: "ממה שסיפרתם",
  calendar: "מלוח השנה",
  category: "מה שידוע על עסקים כמו שלכם",
  industry: "מה שידוע על עסקים כמו שלכם",
  social: "מהרשתות",
};

function sourceLabel(source: PlanInsight["source"]): string {
  return SOURCE_HE[source] ?? source;
}

const LETTERS = ["א׳", "ב׳"];

function ResearchProgress({ hasSite }: { hasSite: boolean }) {
  const lines = [
    "קוראים את מה שסיפרתם",
    ...(hasSite ? ["בודקים מה ראינו באתר"] : []),
    "בודקים מה קורה בלוח השנה",
    "משווים לעסקים כמו שלכם",
    "מנסחים 2 כיוונים לחודש הראשון",
  ];
  const [at, setAt] = useState(0);
  useEffect(() => {
    // The real research takes about half a minute: pace the list to it.
    const timer = window.setInterval(() => setAt((i) => Math.min(i + 1, lines.length - 1)), 5500);
    return () => window.clearInterval(timer);
  }, [lines.length]);
  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-[#e2e0d8] bg-white p-4">
      <p className="text-sm font-black text-[#191b18]">חוקרים את העסק שלכם…</p>
      <p className="text-xs text-[#5e6159]">זה לוקח בערך חצי דקה. אפשר להשאיר את המסך פתוח.</p>
      <ol className="mt-3 space-y-2.5">
        {lines.map((line, index) => (
          <li
            key={line}
            className={`flex items-center gap-2.5 text-sm ${
              index < at ? "text-[#191b18]" : index === at ? "font-bold text-[#191b18]" : "text-[#a3a59c]"
            }`}
          >
            {index < at ? (
              <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <span
                className={`mx-[3px] h-2.5 w-2.5 shrink-0 rounded-full ${index === at ? `bg-[#191b18] ${styles.shimmer}` : "bg-[#d8d6ce]"}`}
              />
            )}
            {index < at || index === at ? `${line}${index === at ? "…" : ""}` : line}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function StepPlan(
  props: StepProps & { loggedIn: boolean; saving: boolean; saveError: string; onSave: () => void },
) {
  const { flow, update, next, loggedIn, saving, saveError, onSave } = props;
  const draft = draftForApi(flow);
  const brand = flow.brandScan?.status === "ready" ? flow.brandScan.brand : null;
  const want = signature([draft, brand ? "brand" : ""]);
  const [failed, setFailed] = useState(false);
  const [failMessage, setFailMessage] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const plan = flow.planFor === want ? flow.plan : null;
  const loading = !plan && !failed;

  useEffect(() => {
    if (flow.planFor === want && flow.plan) return;
    let live = true;
    fetchPlanPreview(draft, brand)
      .then((result) => {
        if (!live) return;
        setFailed(false);
        update((f) => ({ ...f, plan: result, planFor: want, chosenDirection: null, chosenIdea: null }));
      })
      .catch((err: unknown) => {
        if (!live) return;
        // 429 / 502 / 503 come with a Hebrew message worth showing as is.
        setFailMessage(err instanceof ApiError && /[֐-׿]/.test(err.message) ? err.message : "");
        setFailed(true);
      });
    return () => {
      live = false;
    };
    // Once per set of answers (and per retry); the payload is derived from the flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, attempt]);

  const chosen = plan && flow.chosenDirection != null ? flow.chosenDirection : null;
  const ideas = plan && chosen != null ? plan.ideas.filter((idea) => (idea.direction_index ?? 0) === chosen).slice(0, 3) : [];
  const palette = lookOf(flow).palette ?? (plan?.brand?.palette?.length ? plan.brand.palette : null);
  const openIdea = open != null ? plan?.ideas[open] : null;

  return (
    <StepShell
      {...props}
      title="מה למדנו ואיך מתקדמים"
      why={loading ? "רגע, מחברים את כל מה שסיפרתם." : "זה מה שגילינו. בחרו כיוון אחד לחודש הראשון, ותמיד אפשר לשנות."}
      primary={saving ? "שומרים…" : loggedIn ? "לשמור ולהמשיך לתקציב" : "לשמור את הכיוון ולהמשיך"}
      primaryDisabled={saving || loading}
      stickyAction
      onPrimary={() => {
        if (plan && chosen == null) {
          setError("בחרו אחד משני הכיוונים. אפשר לשנות אחר כך.");
          return;
        }
        if (loggedIn) onSave();
        else next();
      }}
    >
      {loading ? <ResearchProgress hasSite={Boolean(draft.links.website)} /> : null}

      {failed && !plan ? (
        <div className="rounded-xl border border-[#e2e0d8] bg-white p-4 text-sm leading-6 text-[#2b2d28]">
          <p className="font-bold text-[#191b18]">לא הצלחנו לחקור כרגע.</p>
          {failMessage ? <p>{failMessage}</p> : null}
          <p>אפשר לנסות שוב, או להמשיך ולבנות את הכיוון אחרי ההרשמה. שום דבר ממה שסיפרתם לא הולך לאיבוד.</p>
          <QuietLink
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            לנסות שוב
          </QuietLink>
        </div>
      ) : null}

      {plan ? (
        <>
          <section aria-labelledby="found-title" className={styles.rise}>
            <h2 id="found-title" className="mb-1.5 text-base font-black text-[#191b18]">
              מה גילינו
            </h2>
            <ul className={`divide-y divide-[#ecebe5] rounded-xl border border-[#e2e0d8] bg-white ${styles.stagger}`}>
              {plan.insights.slice(0, 4).map((insight, index) => (
                <li key={index} className="px-3.5 py-2">
                  <p className="text-sm leading-6 text-[#191b18]">
                    <span className="ml-1.5 inline-block rounded-full bg-[#f1efe8] px-2 align-[1px] text-[11px] font-bold leading-5 text-[#5e6159]">
                      {sourceLabel(insight.source)}
                    </span>
                    {insight.text_he}
                  </p>
                  {insight.detail_he ? <p className="text-xs leading-5 text-[#5e6159]">{insight.detail_he}</p> : null}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="direction-title" className={styles.rise}>
            <h2 id="direction-title" className="text-lg font-black text-[#191b18]">
              הכיוון לחודש הראשון
            </h2>
            <p className="mb-2 text-sm text-[#5e6159]">שתי דרכים טובות. בחרו את זו שמרגישה נכון לכם.</p>
            <div role="radiogroup" aria-labelledby="direction-title" className="grid gap-3 lg:grid-cols-2">
              {plan.directions.slice(0, 2).map((direction, index) => {
                const on = chosen === index;
                return (
                  <button
                    key={direction.title}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setError("");
                      update((f) => ({ ...f, chosenDirection: index, chosenIdea: null }));
                    }}
                    className={`relative cursor-pointer rounded-2xl border bg-white p-4 text-right transition-shadow ${
                      on
                        ? "border-[#191b18] shadow-[0_10px_28px_-16px_rgba(25,27,24,0.55)] ring-2 ring-[#191b18]"
                        : "border-[#dedcd4] hover:border-[#b9b7ad]"
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#6b6e65]">כיוון {LETTERS[index]}</span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                          on ? "border-[#191b18] bg-[#f1efe8]" : "border-[#c7c4b8]"
                        }`}
                        aria-hidden
                      >
                        {on ? <span className={`h-2.5 w-2.5 rounded-full bg-[#191b18] ${styles.pop}`} /> : null}
                      </span>
                    </span>
                    <span className="mt-1 block text-xl font-black leading-tight text-[#191b18]">{direction.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-[#2b2d28]">{direction.approach_he}</span>
                    <span className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-[#4f524b]">
                      <span className="rounded-full bg-[#f1efe8] px-2 py-0.5">למי: {direction.audience}</span>
                      <span className="rounded-full bg-[#f1efe8] px-2 py-0.5">מטרה: {direction.goal_he}</span>
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-[#5e6159]">
                      <b className="text-[#191b18]">למה: </b>
                      {direction.why_he}
                    </span>
                    <span className={`${on ? "block" : "hidden lg:block"} mt-2 border-t border-[#ecebe5] pt-2`}>
                      <span className="block text-[11px] font-black text-[#191b18]">הצעדים הראשונים</span>
                      <span className="mt-1 block space-y-0.5">
                        {direction.first_steps.slice(0, 3).map((stepText, i) => (
                          <span key={stepText} className="flex gap-1.5 text-xs leading-5 text-[#2b2d28]">
                            <span className="font-black text-[#8a8c84]">{i + 1}.</span>
                            {stepText}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {error ? (
              <p role="alert" className="mt-2 text-sm font-bold text-[#9f4330]">
                {error}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="looks-title">
            <h2 id="looks-title" className="text-base font-black text-[#191b18]">
              איך זה ייראה
            </h2>
            {chosen == null ? (
              <p className="mt-1 rounded-xl border border-dashed border-[#c7c4b8] px-4 py-4 text-sm text-[#5e6159]">
                בחרו כיוון, ונראה 3 פוסטים ראשונים שיוצאים ממנו.
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-[#5e6159]">3 פוסטים ראשונים בכיוון הזה. לחצו כדי לראות בגדול.</p>
                <div
                  key={chosen}
                  className={`-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 ${styles.strip} ${styles.stagger}`}
                >
                  {ideas.map((idea) => {
                    const index = plan.ideas.indexOf(idea);
                    return (
                      <div key={index} className="w-[76%] shrink-0 lg:w-auto">
                        <IdeaCard
                          idea={idea}
                          palette={palette}
                          chosen={flow.chosenIdea === index}
                          onOpen={() => setOpen(index)}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </>
      ) : null}

      {saveError ? (
        <p role="alert" className="text-sm font-bold text-[#9f4330]">
          {saveError}
        </p>
      ) : null}

      {openIdea && open != null ? (
        <IdeaSheet
          idea={openIdea}
          businessName={flow.draft.business_name}
          palette={palette}
          chosen={flow.chosenIdea === open}
          onChoose={() => update((f) => ({ ...f, chosenIdea: f.chosenIdea === open ? null : open }))}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </StepShell>
  );
}
