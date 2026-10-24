"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { IconCheck, IconUser } from "@/lib/icons";
import { PROCESS_EXAMPLES, type ProcessRole } from "./processExamples";
import { useProcessSequence } from "./useProcessSequence";
import styles from "./qa-scenes.module.css";

const FORM_TIMES = [2200, 2400, 2400, 1700] as const;
type Props = { role: ProcessRole | null; playing: boolean; reduced?: boolean };
type Phase = "moving" | "clicking" | "typing";

/** Match the example's clock: move, click, then type, retaining time while paused. */
function useExampleTyping(answer: string, step: number, playing: boolean, reduced: boolean) {
  const key = `${step}:${answer}`;
  const letters = useMemo(() => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(answer), item => item.segment), [answer]);
  const progress = useRef({ key: "", elapsed: 0 });
  const [frame, setFrame] = useState<{ key: string; count: number; phase: Phase }>({ key: "", count: 0, phase: "moving" });
  useEffect(() => {
    if (progress.current.key !== key) progress.current = { key, elapsed: 0 };
    if (!playing || reduced || step >= 3) return;
    const before = progress.current.elapsed, started = performance.now();
    const duration = Math.min(1100, Math.max(440, letters.length * 22));
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = before + now - started;
      const phase: Phase = elapsed < 420 ? "moving" : elapsed < 620 ? "clicking" : "typing";
      const count = Math.floor(Math.min(1, Math.max(0, (elapsed - 620) / duration)) * letters.length);
      setFrame(old => old.key === key && old.count === count && old.phase === phase ? old : { key, count, phase });
      if (elapsed < FORM_TIMES[step]) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); if (progress.current.key === key) progress.current.elapsed = before + performance.now() - started; };
  }, [key, letters.length, playing, reduced, step]);
  return { phase: frame.key === key ? frame.phase : "moving", text: frame.key === key ? letters.slice(0, frame.count).join("") : "" };
}

/** A role change restarts the local walkthrough, without touching an owner's interview. */
export function QuestionnaireScene(props: Props) {
  const { locale } = useLanguage();
  return <QuestionnaireDemo key={`${props.role ?? "services"}:${locale}:${props.reduced ? "static" : "motion"}`} {...props} />;
}

function QuestionnaireDemo({ role, playing, reduced = false }: Props) {
  const t = useCopy();
  const root = useRef<HTMLDivElement>(null);
  const { index } = useProcessSequence(FORM_TIMES, playing);
  const active = reduced ? 3 : index;
  const example = PROCESS_EXAMPLES[role ?? "services"];
  const questions = [
    { q: "מה אתם מציעים?", a: example.kind },
    { q: role === "fundraising" ? "מי האנשים שתרצו לצרף לעשייה?" : "למי זה מתאים?", a: example.audienceSummary },
    { q: "מה מייחד אתכם?", a: example.answer },
  ];
  const answers = questions.map(item => t(item.a));
  const typing = useExampleTyping(answers[active] ?? "", active, playing, reduced);
  const [point, setPoint] = useState({ x: 36, y: 72, restX: 6 });
  useEffect(() => {
    const node = root.current;
    if (!node || reduced || active >= 3) return;
    const measure = () => {
      const field = node.querySelector<HTMLElement>(`[data-interview-answer="${active}"]`);
      if (!field) return;
      const box = node.getBoundingClientRect(), target = field.getBoundingClientRect();
      const x = Math.max(8, Math.min(box.width - 48, target.left - box.left + target.width * .52));
      const y = target.top - box.top + target.height * .55;
      const restX = getComputedStyle(node).direction === "rtl" ? 6 : box.width - 48;
      setPoint(old => old.x === x && old.y === y && old.restX === restX ? old : { x, y, restX });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, reduced]);

  return <div ref={root} className={styles.questionnaire} role="figure" aria-label={t("הדגמה אוטומטית של שאלות ההיכרות")} data-form-stage={active} data-demo-playing={playing}>
    <header><span>isramarket</span><strong>{t("קודם מכירים אתכם")}</strong></header>
    <div className={styles.formFields}>{questions.map((item, i) => <div key={item.q} data-active={active === i && typing.phase !== "moving"}>
      <span className={styles.formLabel}>{t(item.q)}</span>
      <div className={styles.answer} data-interview-answer={i}>
        <span className={styles.answerText}>
          <span className={styles.answerMeasure}>{answers[i]}</span>
          <span className={styles.answerTyped} aria-hidden="true">{active > i ? answers[i] : active === i ? typing.text : ""}{active === i && typing.phase === "typing" && <i />}</span>
        </span>
        <span className={styles.formCheck} data-complete={active > i}><IconCheck /></span>
      </div>
    </div>)}</div>
    <footer><IconCheck />{t("הפעילות, הקהל ומה שמייחד אתכם — הבסיס לתוכנית שלכם.")}</footer>
    {!reduced && active < 3 ? <div className={styles.demoCursor} data-phase={typing.phase} aria-hidden="true" style={{ transform: `translate(${typing.phase === "typing" ? point.restX : point.x}px, ${point.y}px)` } as CSSProperties}>
      <div key={active} className={styles.demoCursorTip}>
        <span className={styles.demoClick} />
        <svg viewBox="0 0 24 30" fill="var(--ink)" stroke="var(--paper)" strokeWidth="1.4"><path d="M2 2v23l6-6 5 9 4-2-5-9 9-1Z" /></svg>
        <span className={styles.demoAvatar}><IconUser /></span>
      </div>
    </div> : null}
  </div>;
}
