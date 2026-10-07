"use client";

import Link from "next/link";
import type { ContentLanguage } from "@/lib/content-language";
import { ContentLanguagePicker } from "./ContentLanguagePicker";
import { useCopy } from "@/components/language/LanguageProvider";
import { useCallback, useRef, useState } from "react";
import { MonthBuildProgress } from "@/components/MonthBuildProgress";
import { LoadingMark } from "@/components/Doodles";
import { IconArrowLeft, IconCheck } from "@/lib/icons";
import { loadTrial, useTrial, type TrialPayload } from "@/lib/trial";
import { TopicsStep } from "./TopicsStep";
import { PhotosStep } from "./PhotosStep";
import { VoiceStep } from "./VoiceStep";
import ui from "../chrome.module.css";

const STAGES = [
  { key: "featured", title: "נושאים", detail: "מה כדאי להבליט" },
  { key: "photos", title: "תמונות", detail: "החומר של העסק" },
  { key: "voice", title: "סגנון", detail: "איך אתם נשמעים" },
  { key: "start_posts", title: "פוסטים", detail: "טיוטות לבדיקה" },
] as const;
const primary = "drawn-button inline-flex min-h-12 items-center justify-center gap-2 bg-[var(--primary)] px-6 text-[15px] text-white enabled:hover:bg-[var(--primary-dark)]";

/** Forms stay mounted so moving between stages keeps the owner's edits.
 * Reads may run on mount; generation starts only after an explicit ask. */
function Workspace({ initial, onReview }: { initial: TrialPayload; onReview?: () => void }) {
  const t = useCopy();
  const { payload, failed, loading } = useTrial();
  const journey = payload ?? initial;
  const [stage, setStage] = useState(() => {
    const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("stage");
    const selected = ["topics", "photos", "style", "write"].indexOf(requested || "");
    if (selected >= 0) return selected;
    const first = STAGES.findIndex(item => initial.steps.find(step => step.key === item.key)?.status !== "done");
    return first < 0 ? 3 : first;
  });
  const root = useRef<HTMLElement>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const [finished, setFinished] = useState(false);
  const [pending, setPending] = useState([true, true, true]);
  const topicPending = useCallback((value: boolean) => setPending(p => p[0] === value ? p : [value, p[1], p[2]]), []);
  const photoPending = useCallback((value: boolean) => setPending(p => p[1] === value ? p : [p[0], value, p[2]]), []);
  const voicePending = useCallback((value: boolean) => setPending(p => p[2] === value ? p : [p[0], p[1], value]), []);
  const ready = STAGES.slice(0, 3).every(item => journey.steps.find(step => step.key === item.key)?.status === "done");
  const [languagePending, setLanguagePending] = useState(false);
  const [batchLanguage, setBatchLanguage] = useState<ContentLanguage>();
  const canStart = !languagePending && ready && !pending.some(Boolean) && !failed && !loading;
  const startStep = journey.steps.find(step => step.key === "start_posts");
  const reviewStep = journey.steps.find(step => step.key === "approve_first");
  const draftsExist = finished || (journey.posts_written !== undefined
    ? journey.posts_written > 0
    : reviewStep?.status === "todo" || reviewStep?.status === "done");
  const missing = STAGES.slice(0, 3).filter(item => journey.steps.find(step => step.key === item.key)?.status !== "done");
  const move = (index: number) => {
    setStage(index);
    requestAnimationFrame(() => {
      panels.current[index]?.focus({ preventScroll: true });
      root.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    if (window.location.pathname === "/prepare") {
      const url = new URL(window.location.href);
      url.searchParams.set("stage", ["topics", "photos", "style", "write"][index]);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  };
  const Heading = onReview ? "h2" : "h1";

  return <section ref={root} aria-label={t("הכנת פוסטים לפי התוכנית")} className="mx-auto max-w-[880px] scroll-mt-[calc(4rem+env(safe-area-inset-top))] md:scroll-mt-2">
    <header className="mb-6">
      <Heading className="text-[28px] font-bold tracking-tight text-[var(--ink)]">{t("מהתוכנית לפוסטים שלכם")}</Heading>
      <p className="mt-2 text-[15px] leading-7 text-[var(--ink-soft)]">{t("בוחרים במה להתמקד, מביאים את הסגנון שלכם ומכינים טיוטות. אתם בודקים ומאשרים לפני הפרסום.")}</p>
    </header>
    <nav aria-label={t("שלבי הכנת הפוסטים")} className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 mb-8 rounded-[14px] bg-[var(--paper)] p-2 shadow-[var(--shadow-card)] md:top-2">
      <ol className="grid grid-cols-4 gap-1">
        {STAGES.map((item, index) => {
          const done = item.key === "start_posts" ? draftsExist : !pending[index] && journey.steps.find(step => step.key === item.key)?.status === "done";
          return <li key={item.key}><button type="button" onClick={() => move(index)} aria-current={stage === index ? "step" : undefined}
            aria-label={`${t(item.title)}${done ? ` — ${t("נשמר")}` : ""}`} className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-[10px] px-1 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--primary)] sm:items-start sm:px-4 ${stage === index ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--ink-soft)] hover:bg-[var(--soft)]"}`}>
            <span className="flex items-center gap-2 font-semibold"><span className="text-[12px] tabular-nums">{done ? <IconCheck className="h-3.5 w-3.5" /> : index + 1}</span>{t(item.title)}</span>
            <span className="hidden text-[12px] text-[var(--ink-muted)] sm:block">{t(item.detail)}</span>
          </button></li>;
        })}
      </ol>
    </nav>
    <div hidden={stage !== 0} tabIndex={-1} ref={node => { panels.current[0] = node; }} className="focus:outline-none"><TopicsStep embedded onPendingChange={topicPending} onNext={() => move(1)} /></div>
    <div hidden={stage !== 1} tabIndex={-1} ref={node => { panels.current[1] = node; }} className="focus:outline-none"><PhotosStep embedded onPendingChange={photoPending} onNext={() => move(2)} /></div>
    <div hidden={stage !== 2} tabIndex={-1} ref={node => { panels.current[2] = node; }} className="focus:outline-none"><VoiceStep embedded onPendingChange={voicePending} onNext={() => move(3)} /></div>
    <div hidden={stage !== 3} tabIndex={-1} ref={node => { panels.current[3] = node; }} className="focus:outline-none">
      <h2 className="mb-3 text-[20px] font-bold">{t(draftsExist ? "הטיוטות מוכנות לבדיקה" : "מכינים פוסטים לפי התוכנית")}</h2>
      <ContentLanguagePicker onPendingChange={setLanguagePending} onBatchChange={setBatchLanguage} />
      {draftsExist ? <>
        <p className="mb-5 text-[15px] leading-7 text-[var(--ink-soft)]">{t("בדקו את התוכן ואת התמונה של כל פוסט. אפשר לערוך הכול לפני שמאשרים.")}</p>
        {onReview ? <button type="button" onClick={onReview} className={primary}>{t("לבדיקת הפוסטים")}<IconArrowLeft /></button> : <Link href="/posts" className={primary}>{t("לבדיקת הפוסטים")}<IconArrowLeft /></Link>}
      </> : <MonthBuildProgress kind="posts" contentLanguage={batchLanguage} canStart={canStart} onDone={() => { setFinished(true); void loadTrial(true); }} idle={({ start }) => <>
        {canStart && (startStep?.status === "todo" || startStep?.status === "done") ? <>
          <p className="mb-5 text-[15px] leading-7 text-[var(--ink-soft)]">{t("נכתוב לפי הנושאים והסגנון ששמרתם. הפוסטים והתמונות יוכנו ברקע; שום דבר לא יתפרסם בלי אישורכם.")}</p>
          <button type="button" onClick={() => void start()} className={primary}>{t("להכין את הפוסטים")}<IconArrowLeft /></button>
        </> : <div className={`${ui.inset} p-5`}>
          <p className="text-[15px] leading-7">{t(failed ? "לא הצלחנו לבדוק את השלבים. נסו לטעון אותם שוב." : languagePending ? "שמרו את בחירת שפת הפוסטים לפני הכתיבה." : pending.some(Boolean) ? "יש שינויים שעוד לא נשמרו או תמונות שעדיין נטענות. בדקו ושמרו לפני שנכתוב לפיהם." : missing.length ? "נשאר להשלים לפני הכתיבה:" : startStep?.note_he || "התוכנית עוד נבנית. הפוסטים יוכלו להתחיל כשהיא מוכנה.")}</p>
          {failed ? <button type="button" onClick={() => void loadTrial(true)} className={`${ui.link} min-h-11`}>{t("לטעון שוב")}</button> : null}
          <ul className="mt-2">{STAGES.slice(0, 3).filter((item, index) => pending[index] || missing.includes(item)).map(item => <li key={item.key}><button type="button" onClick={() => move(STAGES.findIndex(s => s.key === item.key))} className={`${ui.link} min-h-11`}>{t(item.title)} <IconArrowLeft /></button></li>)}</ul>
        </div>}
      </>} />}
    </div>
    {stage > 0 ? <button type="button" onClick={() => move(stage - 1)} className={`${ui.link} mt-6 min-h-11`}>{t("לחזור לשלב הקודם")}</button> : null}
    <p className={`${ui.help} mt-6 border-t border-[var(--rule)] pt-4`}>{t("השינויים נשמרים כשלוחצים על הכפתור בכל שלב. אפשר לחזור לשלבים כאן בלי לעזוב את המסך.")}</p>
  </section>;
}

export function PostPreparation({ onReview }: { onReview?: () => void }) {
  const t = useCopy();
  const { payload, failed, loading } = useTrial();
  if (!payload) return failed && !loading ? <div role="alert"><p>{t("לא הצלחנו לטעון את השלבים.")}</p><button type="button" onClick={() => void loadTrial(true)} className={`${ui.button} mt-4`}>{t("לנסות שוב")}</button></div> : <LoadingMark label={t("טוענים את השלבים…")} />;
  return <Workspace initial={payload} onReview={onReview} />;
}
