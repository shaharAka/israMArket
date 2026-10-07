"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { BrandMark } from "@/lib/icons";
import { EXAMPLE } from "./content";

const STAGES = ["חוקרים", "מחברים", "יוצרים", "מודדים"];
const HOLD_MS = 6500;

/** One plan, four contributions. No accounts or model calls: this is a labelled example.
 * Play once when visible. A manual choice, keyboard focus or reduced motion stops it.
 */
export function PlanCycleHero() {
  const t = useCopy();
  const host = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [motion, setMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setMotion(!preference.matches);
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    onMotion();
    onVisibility();
    preference.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    const observer = new IntersectionObserver(([entry]) => {
      const screen = entry.rootBounds?.height || window.innerHeight;
      setVisible(entry.isIntersecting && Math.max(entry.intersectionRatio, entry.intersectionRect.height / screen) >= 0.5);
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    if (host.current) observer.observe(host.current);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!playing || !motion || !visible || !pageVisible) return;
    const timer = window.setTimeout(() => {
      if (stage === STAGES.length - 1) setPlaying(false);
      else setStage(stage + 1);
    }, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [stage, playing, motion, visible, pageVisible]);

  const running = playing && motion;
  const pick = (index: number) => { setPlaying(false); setStage(index); };

  return (
    <div className="lv2-cycle" ref={host} onFocusCapture={(event) => {
      if (event.target instanceof Element && event.target.closest(".lv2-cycle-steps")) setPlaying(false);
    }}>
      <div className="lv2-cycle-steps" role="group" aria-label={t("מה מתווסף לתוכנית")}>
        {STAGES.map((label, index) => (
          <button key={label} type="button" aria-pressed={stage === index} aria-controls="lv2-cycle-detail" onClick={() => pick(index)}>
            <span className="lv2-cycle-step-num" aria-hidden>{index + 1}</span>
            <Copy text={label} />
          </button>
        ))}
      </div>

      <div className="lv2-cycle-paper">
        <div className="lv2-cycle-business">
          <span className="lv2-cycle-mark" aria-hidden>
            <i className="lv2-cycle-sun" />
            <BrandMark className="h-9 w-9" />
          </span>
          <p><strong><Copy text={EXAMPLE.name} /></strong><span><Copy text={EXAMPLE.kind} /></span></p>
          <span className="lv2-cycle-example"><Copy text="דוגמה" /></span>
        </div>

        <div className="lv2-cycle-plan">
          <p className="lv2-cycle-label"><Copy text="תוכנית השיווק" /></p>
          <h2>
            <span aria-hidden={stage === 3}><Copy text="יותר הזמנות מראש, פחות קניות של הרגע האחרון." /></span>
            <span aria-hidden={stage !== 3}><Copy text="בפוסט הבא: מחיר וקישור להזמנה." /></span>
          </h2>
          <p className="lv2-cycle-audience"><Copy text="למשפחות מהשכונה, לקראת יום שישי." /></p>
        </div>

        <div className="lv2-cycle-detail" id="lv2-cycle-detail" aria-live="off">
          <section aria-hidden={stage !== 0} className="lv2-cycle-panel">
            <h3><Copy text="מכירים את העסק לפני שמציעים מה לפרסם." /></h3>
            <dl className="lv2-cycle-facts">
              <div><dt><Copy text="מה מצאנו" /></dt><dd><Copy text="לקוחות קבועים מגיעים בעיקר בשישי בבוקר." /></dd></div>
              <div><dt><Copy text="מה מציעים" /></dt><dd><Copy text="להזכיר בחמישי שאפשר להזמין מראש." /></dd></div>
            </dl>
            <p className="lv2-cycle-note"><Copy text="לפי האתר, הקהל ומה שסיפרתם לנו על העסק." /></p>
          </section>

          <section aria-hidden={stage !== 1} className="lv2-cycle-panel">
            <h3><Copy text="מחברים את הנתונים לתוכנית." /></h3>
            <dl className="lv2-cycle-connections">
              <div><dt><Copy text="נתוני האתר" /></dt><dd data-status="connected"><Copy text="מחובר" /></dd></div>
              <div><dt><Copy text="אינסטגרם" /></dt><dd><Copy text="עדיין לא מחובר" /></dd></div>
              <div><dt><Copy text="הזמנות" /></dt><dd><Copy text="מעדכנים ידנית" /></dd></div>
            </dl>
            <p className="lv2-cycle-note"><Copy text="מתחילים מהמידע שיש. אפשר לחבר עוד בהמשך." /></p>
          </section>

          <section aria-hidden={stage !== 2} className="lv2-cycle-panel">
            <h3><Copy text="מהתוכנית לפוסט בסגנון שלכם." /></h3>
            <div className="lv2-cycle-draft">
              <span className="lv2-cycle-loaf" aria-hidden><i /><i /><i /></span>
              <div><small><Copy text="טיוטה לאינסטגרם" /></small><strong><Copy text="מזמינים בחמישי, אוספים בשישי." /></strong><p><Copy text="להזמנה מראש ולאיסוף בבוקר, שלחו לנו הודעה." /></p></div>
            </div>
            <p className="lv2-cycle-note"><Copy text="מכינים גם את התמונה. אתם בודקים, משנים ומפרסמים." /></p>
          </section>

          <section aria-hidden={stage !== 3} className="lv2-cycle-panel">
            <h3><Copy text="הפוסט עם המחיר הביא יותר לחיצות." /></h3>
            <p className="lv2-cycle-measure-label"><Copy text="לחיצות על קישור ההזמנה" /></p>
            <dl className="lv2-cycle-bars">
              <div><dt><Copy text="עם מחיר" /></dt><dd><i data-size="full" aria-hidden /><strong>12</strong></dd></div>
              <div><dt><Copy text="בלי מחיר" /></dt><dd><i data-size="third" aria-hidden /><strong>4</strong></dd></div>
            </dl>
            <p className="lv2-cycle-note"><Copy text="הזמנות עדיין לא נמדדו. בינתיים מעדכנים את הפוסט הבא לפי הלחיצות." /></p>
          </section>
        </div>

        <div className="lv2-cycle-footer">
          <p><Copy text="לומדים, מפרסמים ומשפרים את התוכנית." /></p>
          {motion ? <button type="button" onClick={() => {
            if (running) setPlaying(false);
            else { setStage(0); setPlaying(true); }
          }}><Copy text={running ? "לעצור את ההדגמה" : "לראות מהתחלה"} /></button> : null}
        </div>
      </div>
    </div>
  );
}
