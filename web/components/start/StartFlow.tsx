"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, endpoints, exitDemo, isDemo } from "@/lib/api";
import {
  AFTER_SAVE,
  clearSavedFlow,
  emptyFlow,
  loadFlow,
  normalizeUrl,
  saveFlow,
  saveFlowToAccount,
  scanBrand,
  type FlowState,
  type OnboardingDraft,
} from "@/lib/draft";
import { BrandMark, IconArrowRight } from "@/lib/icons";
import { BusinessCard, CardBar } from "./BusinessCard";
import {
  CHAPTERS,
  STEP_ORDER,
  chapterIndexOf,
  chapterSteps,
  isStepId,
  migrateStep,
  nextStep,
  previousStep,
  reflectionAfter,
  type StepId,
} from "./script";
import { StepBudget, StepGrow } from "./StepGoal";
import { StepBaseline, StepLever, StepTarget } from "./StepNumbers";
import { StepDirection, StepFound } from "./StepPlan";
import { StepQuarter } from "./StepQuarter";
import { StepSave } from "./StepSave";
import {
  PresetGrid,
  StepAudiences,
  StepCompetitors,
  StepDifferent,
  StepLinks,
  StepName,
  StepSeasons,
  StepTried,
  StepWhat,
  type StepProps,
} from "./steps";
import { QuietLink } from "./ui";
import styles from "./start.module.css";

/**
 * /start: the first meeting with a marketing consultant.
 *
 * One question per screen, in five chapters (the business, its customers, how it markets
 * today, the goal and the budget, what we learned). After each answer the consultant says
 * back what they heard, and the business card fills in. The end is the 3-month plan.
 * Nothing needs an account until the owner decides to keep it; the draft survives a
 * refresh in localStorage.
 */
export function StartFlow() {
  const router = useRouter();
  const [flow, setFlow] = useState<FlowState | null>(null);
  const [direction, setDirection] = useState<"fwd" | "back">("fwd");
  const [navigated, setNavigated] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  // A saved onboarding was picked up on load: say so, and offer a clean start.
  const [resumed, setResumed] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const latest = useRef<FlowState | null>(null);

  useEffect(() => {
    latest.current = flow;
  }, [flow]);

  // The draft and the URL only exist in the browser: read them after mount.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = loadFlow();
      const loaded = saved ?? emptyFlow();
      if (saved && (saved.step !== "name" || saved.draft.business_name.trim())) setResumed(true);
      loaded.step = migrateStep(loaded.step);
      if (!isStepId(loaded.step)) loaded.step = "name";
      // Arriving from the landing page's site box: the site is already answered.
      const site = new URLSearchParams(window.location.search).get("site");
      if (site && !Object.keys(loaded.draft.links).length && !loaded.draft.has_none) {
        loaded.draft = { ...loaded.draft, links: { website: site } };
      }
      setFlow(loaded);
    }, 0);
    // /start builds a real business. A browser still in demo mode (the owner looked at the
    // demo earlier) would otherwise answer with the demo's fixtures instead of the API.
    if (isDemo()) exitDemo();
    endpoints
      .me()
      .then(() => {
        setLoggedIn(true);
        return endpoints.business();
      })
      .then((res) => {
        if (res?.business?.onboarding_complete) router.replace("/dashboard");
      })
      .catch(() => {
        // Not signed in: the normal case here.
      });
    return () => window.clearTimeout(timer);
  }, [router]);

  const update = useCallback((fn: (f: FlowState) => FlowState) => {
    setFlow((current) => {
      if (!current) return current;
      const next = fn(current);
      saveFlow(next);
      return next;
    });
  }, []);

  const setDraft = useCallback(
    (patch: Partial<OnboardingDraft>) => update((f) => ({ ...f, draft: { ...f.draft, ...patch } })),
    [update],
  );

  const toggleCard = useCallback((open: boolean) => setCardOpen(open), []);

  function go(step: StepId, dir: "fwd" | "back") {
    setDirection(dir);
    setNavigated(true);
    setCardOpen(false);
    update((f) => ({
      ...f,
      step: step,
      seen: dir === "fwd" && !f.seen.includes(f.step) ? [...f.seen, f.step] : f.seen,
    }));
    window.scrollTo({ top: 0 });
  }

  /** Forget every answer in this browser and go back to the first question. */
  function startOver() {
    // The draft, and any photo an earlier version of this flow kept in IndexedDB.
    void clearSavedFlow();
    setResumed(false);
    setConfirmRestart(false);
    setNoticeDismissed(false);
    setCardOpen(false);
    setDirection("back");
    setNavigated(true);
    setFlow(emptyFlow());
    window.scrollTo({ top: 0 });
  }

  function startScan(url: string) {
    const normalized = normalizeUrl(url);
    const current = latest.current?.brandScan;
    if (current && current.url === normalized && current.status !== "failed") return;
    setNoticeDismissed(false);
    update((f) => ({ ...f, brandScan: { url: normalized, status: "reading", brand: null } }));
    const draft = latest.current?.draft;
    scanBrand(normalized, draft ?? emptyFlow().draft)
      .then((res) =>
        update((f) =>
          f.brandScan?.url === normalized
            ? { ...f, brandScan: { url: normalized, status: res.status, brand: res.brand, reason_he: res.reason_he } }
            : f,
        ),
      )
      .catch(() =>
        update((f) =>
          f.brandScan?.url === normalized ? { ...f, brandScan: { url: normalized, status: "failed", brand: null } } : f,
        ),
      );
  }

  async function save() {
    const current = latest.current;
    if (!current) return;
    setSaving(true);
    setSaveError("");
    try {
      await saveFlowToAccount(current);
      await finish();
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError && err.status === 401) {
        setLoggedIn(false);
        go("save", "fwd");
        return;
      }
      setSaveError(err instanceof Error && err.message ? err.message : "לא הצלחנו לשמור את התוכנית. נסו שוב.");
    }
  }

  /** Everything is in the account: nothing of the onboarding stays in this browser. */
  async function finish() {
    setSaving(true);
    await clearSavedFlow();
    // The budget was asked here, so the old budget step is skipped: straight to the plan.
    router.replace(AFTER_SAVE);
  }

  if (!flow) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f8f7f4]">
        <p className="text-sm text-[#63665e]">טוענים…</p>
      </div>
    );
  }

  const step = flow.step as StepId;
  const prev = previousStep(step, flow);
  const back = prev ? () => go(prev, "back") : null;
  const next = () => {
    // Read the latest flow: the answer given on this screen can change what comes next.
    const to = nextStep(step, latest.current ?? flow);
    if (to) go(to, "fwd");
  };
  const jump = (to: StepId) => go(to, STEP_ORDER.indexOf(to) > STEP_ORDER.indexOf(step) ? "fwd" : "back");

  const scanFailed = flow.brandScan?.status === "failed" && !flow.draft.style_preset;
  const notice =
    scanFailed && !noticeDismissed && step !== "links" ? (
      <div role="status" className={`rounded-xl border border-[#e8d9c2] bg-[#fbf5ea] px-3.5 py-3 text-sm leading-6 text-[#4a3b22] ${styles.rise}`}>
        <p>לא הצלחנו לקרוא את האתר. זה קורה, ולא צריך לתקן כלום עכשיו. אפשר לבחור סגנון במקום.</p>
        <div className="flex gap-3">
          <QuietLink onClick={() => setStyleOpen(true)} className="font-bold text-[#191b18]">
            לבחור סגנון
          </QuietLink>
          <QuietLink onClick={() => setNoticeDismissed(true)}>לא עכשיו</QuietLink>
        </div>
      </div>
    ) : null;

  const common: StepProps = {
    flow,
    update,
    setDraft,
    next,
    reflection: prev ? reflectionAfter(prev, flow) : null,
    notice,
    focus: navigated,
    direction,
  };

  const wide = step === "direction" || step === "quarter";
  let screen: React.ReactNode;
  switch (step) {
    case "name":
      screen = <StepName {...common} />;
      break;
    case "what":
      screen = <StepWhat {...common} />;
      break;
    case "different":
      screen = <StepDifferent {...common} />;
      break;
    case "audiences":
      screen = <StepAudiences {...common} />;
      break;
    case "seasons":
      screen = <StepSeasons {...common} />;
      break;
    case "links":
      screen = <StepLinks {...common} onWebsite={startScan} />;
      break;
    case "tried":
      screen = <StepTried {...common} />;
      break;
    case "competitors":
      screen = <StepCompetitors {...common} />;
      break;
    case "grow":
      screen = <StepGrow {...common} />;
      break;
    case "baseline":
      screen = <StepBaseline {...common} />;
      break;
    case "lever":
      screen = <StepLever {...common} />;
      break;
    case "budget":
      screen = <StepBudget {...common} />;
      break;
    case "target":
      screen = <StepTarget {...common} />;
      break;
    case "found":
      screen = <StepFound {...common} jump={jump} />;
      break;
    case "direction":
      screen = <StepDirection {...common} jump={jump} />;
      break;
    case "quarter":
      screen = (
        <StepQuarter {...common} jump={jump} loggedIn={loggedIn} saving={saving} saveError={saveError} onSave={() => void save()} />
      );
      break;
    case "save":
      screen = <StepSave {...common} loggedIn={loggedIn} saving={saving} saveError={saveError} onSave={save} />;
      break;
  }

  return (
    <div className="min-h-dvh bg-[#f8f7f4] text-[#191b18]">
      {/* Phones: back (or home) and the business card, in one bar. */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-[#e2e0d8] bg-white/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        {back ? (
          <button
            type="button"
            onClick={back}
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-sm font-bold text-[#191b18]"
          >
            <IconArrowRight className="h-5 w-5" />
            חזרה
          </button>
        ) : (
          <Link href="/" aria-label="לעמוד הבית" className="flex min-h-11 shrink-0 items-center px-1">
            <BrandMark className="h-7 w-7 text-[#191b18]" />
          </Link>
        )}
        <CardBar flow={flow} open={cardOpen} onToggle={toggleCard} onPickStyle={() => setStyleOpen(true)} />
      </header>

      {/* Desktop */}
      <header className="mx-auto hidden max-w-6xl items-center justify-between px-8 pt-6 lg:flex">
        <Link href="/" className="flex items-center gap-2.5" aria-label="לעמוד הבית">
          <BrandMark className="h-9 w-9 text-[#191b18]" />
          <span>
            <span className="block text-base font-black">ישראמארקט</span>
            <span className="-mt-0.5 block text-xs text-[#63665e]">שיווק לעסקים קטנים</span>
          </span>
        </Link>
        {loggedIn ? null : (
          <p className="text-sm text-[#5e6159]">
            כבר יש לכם חשבון?{" "}
            <Link href="/login" className="font-bold text-[#191b18] underline underline-offset-4">
              להיכנס
            </Link>
          </p>
        )}
      </header>

      <div className="mx-auto max-w-6xl px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12 lg:px-8">
        <main className={`mx-auto w-full py-4 lg:mx-0 lg:py-8 ${wide ? "max-w-3xl" : "max-w-xl"}`}>
          <div className="mb-4 space-y-2">
            <div className="hidden min-h-11 items-center lg:flex">
              {back ? <QuietLink onClick={back}>חזרה</QuietLink> : null}
            </div>
            <ChapterProgress step={step} flow={flow} />
            {resumed || step !== "name" ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#5e6159]">
                {confirmRestart ? (
                  <>
                    <span>כל התשובות שכאן יימחקו.</span>
                    <QuietLink onClick={startOver} className="font-bold text-[#191b18]">
                      למחוק ולהתחיל מחדש
                    </QuietLink>
                    <QuietLink onClick={() => setConfirmRestart(false)}>ביטול</QuietLink>
                  </>
                ) : (
                  <>
                    {resumed ? <span>המשכנו מאיפה שעצרתם.</span> : null}
                    <QuietLink onClick={() => setConfirmRestart(true)}>להתחיל מחדש</QuietLink>
                  </>
                )}
              </div>
            ) : null}
          </div>
          <div key={step}>{screen}</div>
        </main>
        <aside className="hidden lg:block" aria-label="העסק שלכם">
          <div className="sticky top-6 max-h-[calc(100dvh-7.5rem)] overflow-y-auto pt-8">
            <BusinessCard flow={flow} onPickStyle={() => setStyleOpen(true)} />
          </div>
        </aside>
      </div>

      {styleOpen ? (
        <StyleSheet
          value={flow.draft.style_preset}
          onPick={(key) => {
            setDraft({ style_preset: key });
            setStyleOpen(false);
          }}
          onClose={() => setStyleOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** Five chapters, not "step 7 of 14": where we are in the meeting. */
function ChapterProgress({ step, flow }: { step: StepId; flow: FlowState }) {
  const current = chapterIndexOf(step);
  return (
    <nav aria-label="איפה אנחנו בשיחה">
      <ol className="grid grid-cols-5 gap-1.5">
        {CHAPTERS.map((chapter, index) => {
          const steps = chapterSteps(index, flow);
          const within = steps.indexOf(step);
          const fill = index < current ? 1 : index === current ? (within + 1) / Math.max(1, steps.length) : 0;
          return (
            <li key={chapter.key} aria-current={index === current ? "step" : undefined}>
              <span className="block h-1.5 overflow-hidden rounded-full bg-[#e2e0d8]">
                <span
                  className="block h-full rounded-full bg-[#191b18] transition-[width] duration-500"
                  style={{ width: `${fill * 100}%` }}
                />
              </span>
              <span
                className={`mt-1 block truncate text-[11px] ${index === current ? "font-black text-[#191b18]" : "text-[#8a8c84]"}`}
              >
                <span className="lg:hidden">{chapter.short ?? chapter.label}</span>
                <span className="hidden lg:inline">{chapter.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StyleSheet({
  value,
  onPick,
  onClose,
}: {
  value?: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
      <button
        type="button"
        aria-label="לסגור"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-[#191b18]/40 ${styles.backdrop}`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="לבחור סגנון"
        tabIndex={-1}
        className={`relative w-full space-y-3 rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none lg:max-w-lg lg:rounded-3xl ${styles.sheet}`}
      >
        <h2 className="text-lg font-black text-[#191b18]">איזה סגנון מרגיש כמוכם?</h2>
        <p className="text-sm text-[#5e6159]">נצבע בו את הפוסטים. אפשר לשנות בכל רגע.</p>
        <PresetGrid value={value} onPick={onPick} />
        <QuietLink onClick={onClose}>לסגור</QuietLink>
      </div>
    </div>
  );
}
