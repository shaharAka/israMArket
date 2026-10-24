"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { TRIAL_LABEL } from "@/lib/pricing";
import { PROCESS_HERO } from "./processStory";
import { PROCESS_EXAMPLES, type ProcessRole } from "./processExamples";
import { PROCESS_SCHEDULES } from "./processScenarios";
import { useFeatureCycle } from "./useFeatureCycle";
import { HeroBriefScene, CampaignMaterialsScene, CampaignGrowthScene } from "./LandingQaScenes";
import { TrialCtaLabel } from "./TrialCtaLabel";
import styles from "./signal-hero.module.css";

/** Whole words preserve Hebrew/Arabic shaping. The original message remains intact. */
export function ReactiveWords({ text }: { text: string }) {
  const t = useCopy();
  return t(text).split(" ").map((word, i) => <Fragment key={i}><span className={styles.word}>{word}</span>{" "}</Fragment>);
}

function Arrow(){const {locale}=useLanguage();return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={locale==="he"||locale==="ar"?"M20 12H4m6-6-6 6 6 6":"M4 12h16m-6-6 6 6-6 6"}/></svg>;}

export function SignalHero({ start, role }: { start: string; role: ProcessRole | null }) {
  const { ref, playing, reduced, setFocused } = useFeatureCycle(1);
  const [focus, setFocus] = useState<number | null>(null);
  const t = useCopy();
  const { locale } = useLanguage();
  const exampleRole = role ?? "online_shop";
  const example = PROCESS_EXAMPLES[exampleRole];
  const schedule = PROCESS_SCHEDULES[exampleRole];
  useEffect(() => {
    const root = ref.current;
    if (!root || !playing || !matchMedia("(pointer:fine)").matches) return;
    let frame = 0, x = 0, y = 0, tx = 0, ty = 0, vx = 0;
    function animate() {
      frame = 0;
      if (!root) return;
      vx = (vx + (tx - x) * .08) * .7; x += vx; y += (ty - y) * .11;
      root.style.setProperty("--hero-x", `${x * 12}px`);
      root.style.setProperty("--hero-y", `${y * 6}px`);
      root.style.setProperty("--hero-lean", `${Math.max(-2.2, Math.min(2.2, vx * 65))}deg`);
      if (Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(vx) > .0005) frame = requestAnimationFrame(animate);
    }
    function move(e: PointerEvent) {
      if (!root || e.pointerType === "touch") return;
      const box = root.getBoundingClientRect();
      tx = (e.clientX - box.left) / box.width * 2 - 1; ty = (e.clientY - box.top) / box.height * 2 - 1;
      if (!frame) frame = requestAnimationFrame(animate);
    }
    function leave() { tx = ty = 0; if (!frame) frame = requestAnimationFrame(animate); }
    root.addEventListener("pointermove", move); root.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(frame); root.removeEventListener("pointermove", move); root.removeEventListener("pointerleave", leave); };
  }, [playing, ref]);
  const panel = (i: number) => ({ draggable: false, onMouseEnter: () => { if (playing) setFocus(i); }, onMouseLeave: () => setFocus(null) });
  return <section className={styles.hero} aria-labelledby="process-title"><div ref={ref} className={styles.root} data-playing={playing} data-reduced={reduced} data-focus={focus ?? "none"}>
    <div className={styles.copy}>
      <h1 id="process-title" aria-label={t(PROCESS_HERO.title)}>{locale === "he" ? <><span className={styles.line}><ReactiveWords text="מערכת הקידום" /></span><span className={styles.line}><ReactiveWords text="שעושה בשבילך" /></span><span className={styles.line}><ReactiveWords text="את העבודה." /></span></> : <ReactiveWords text={PROCESS_HERO.title} />}</h1>
      <div className={styles.support}><p><Copy text={PROCESS_HERO.body} /></p><Link href={start} className={styles.start}><TrialCtaLabel /><Arrow /></Link><small><Copy text={TRIAL_LABEL} /> · <Copy text="בלי כרטיס אשראי. בלי התחייבות." /></small></div>
    </div>
    <div className={styles.panorama} data-panorama onFocusCapture={event => setFocused(event.target.matches(":focus-visible"))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      <div className={styles.track}>
        <Link href="#goals" className={`${styles.panel} ${styles.goal}`} {...panel(0)}>
          <h2><Copy text="בוחרים מטרה." /><br /><Copy text="בונים סביבה קמפיין." /></h2>
          <HeroBriefScene role={exampleRole} playing={playing} reduced={reduced}/>
        </Link>
        <Link href="#plan" className={`${styles.panel} ${styles.plan}`} {...panel(1)}>
          <div className={styles.calendar}><header><strong><Copy text="התוכנית לחודש הקרוב" /></strong><span><Copy text={example.name} /></span></header><div className={styles.calendarDays} aria-hidden="true">{Array.from({length:20},(_,i)=><i key={i}>{i+1}</i>)}</div><div className={styles.calendarTasks}>{schedule.tasks.map((task,i)=><span key={task} style={{ gridRow:i+1 }}><Copy text={task} /></span>)}</div><div className={styles.tracking}><i /><Copy text="לומדים כל הזמן" /></div></div>
          <h2><Copy text="יודעים מה לפרסם." /><br /><Copy text="וגם מתי." /></h2>
        </Link>
        <Link href="#campaign" className={`${styles.panel} ${styles.campaign}`} {...panel(2)}>
          <h2><Copy text="קמפיין אחד." /><br/><Copy text="מותאם לכל ערוץ." /></h2><CampaignMaterialsScene role={exampleRole} playing={playing} compact/>
        </Link>
        <Link href="#learning" className={`${styles.panel} ${styles.learning}`} {...panel(3)}>
          <h2><Copy text="לומדים מה עובד." /><br /><Copy text="משפרים את הקמפיין." /></h2>
          <CampaignGrowthScene role={exampleRole} playing={playing} reduced={reduced} compact/>
        </Link>
      </div>
    </div>
  </div></section>;
}
