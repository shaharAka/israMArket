"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { LANDING_EXAMPLES, type LandingExample } from "./examples";
import { PlanPanel } from "./PlanPanel";
import { LANDING_PLANS } from "./plans";

/** Long enough to read the strategy, the measure and the three months once. */
const AUTO_ADVANCE_MS = 10000;

/**
 * "בחרו עסק וראו את התוכנית שלו": a tab per fictional business, and a stage with that
 * business's 3-month plan. The compact overview uses supplied connection states,
 * one example post title and the planned budget. Switching re-plays the plan assembling.
 *
 * Auto-advance follows the WAI carousel rules: it starts only when motion is allowed,
 * pauses while the pointer, focus or a finger is on the showcase, while the top of the
 * plan is off screen (a phone reader deep in the plan keeps their business)
 * and while the tab is hidden, and stops for good once the visitor picks a business.
 * The progress bar IS the timer: its CSS animation ending advances to the next tab, so
 * pausing the bar pauses the clock exactly where it was.
 */
export function Showcase({ examples: all = LANDING_EXAMPLES }: { examples?: LandingExample[] }) {
  // Only businesses with a hand-written plan (plans.ts) are shown.
  const examples = all.filter((example) => LANDING_PLANS[example.slug]);
  const [current, setCurrent] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [readingDetails, setReadingDetails] = useState(false);
  const [playRequested, setPlayRequested] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  /** Rows animate in only once the stage has been seen, not while it is below the fold. */
  const [seen, setSeen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  /** A 1px line at the top of the plan: whether its beginning is on screen. */
  const stageTopRef = useRef<HTMLDivElement>(null);
  const pillRowRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Decided after mount: the server cannot know the visitor's motion preference.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { setAutoplay(!media.matches); setMotionAllowed(!media.matches); };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const top = stageTopRef.current;
    if (!root || !top || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      setSeen(true);
      return;
    }
    const seenObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSeen(true);
      },
      { threshold: 0.2 },
    );
    // The clock runs only while the top of the plan is on screen. On a phone the plan is
    // taller than the screen, and it must not switch business under someone reading its
    // lower half.
    const clockObserver = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "0px 0px -15% 0px",
    });
    seenObserver.observe(root);
    clockObserver.observe(top);
    return () => {
      seenObserver.disconnect();
      clockObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const sync = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  /** Keep the current pill in view inside its own scroller (never scrolls the page). */
  useEffect(() => {
    const row = pillRowRef.current;
    const pill = tabRefs.current[current];
    if (!row || !pill || row.scrollWidth <= row.clientWidth) return;
    const box = row.getBoundingClientRect();
    const rect = pill.getBoundingClientRect();
    const margin = 24;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let delta = 0;
    if (rect.right > box.right - margin) delta = rect.right - box.right + margin;
    else if (rect.left < box.left + margin) delta = rect.left - box.left - margin;
    if (delta) row.scrollBy({ left: delta, behavior: smooth ? "smooth" : "auto" });
  }, [current]);

  const advance = useCallback(() => setCurrent((index) => (index + 1) % examples.length), [examples.length]);

  /** The visitor chose: stop the clock and let them read. */
  const choose = (index: number, focus = false) => {
    const next = (index + examples.length) % examples.length;
    setAutoplay(false);
    setReadingDetails(false);
    setPlayRequested(false);
    setCurrent(next);
    if (focus) tabRefs.current[next]?.focus();
  };

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // RTL: the next tab is to the left.
    const moves: Record<string, number> = {
      ArrowLeft: current + 1,
      ArrowRight: current - 1,
      Home: 0,
      End: examples.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    choose(moves[event.key], true);
  }

  const paused = ((hovered || focused) && !playRequested) || touching || readingDetails || !visible || pageHidden;
  const active = examples[current];
  const accent = "var(--primary)";

  return (
    <div
      ref={rootRef}
      className="lp-showcase"
      style={{ "--lp-accent": accent } as CSSProperties}
      onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerMove={(event) => { if (!(event.target as Element).closest("[data-rotation-control]")) setPlayRequested(false); }}
      onTouchStart={() => setTouching(true)}
      onTouchEnd={() => setTouching(false)}
      onTouchCancel={() => setTouching(false)}
      onFocus={(event) => { setFocused(true); if (!(event.target as Element).closest("[data-rotation-control]")) setPlayRequested(false); }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="mx-auto max-w-7xl px-4 pb-14 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
        <header data-rv className="max-w-2xl">
          <p className="text-sm font-bold text-[var(--primary)]">מחקר, אסטרטגיה ותוכנית</p>
          <h2 id="examples-title" className="mt-2 text-[1.9rem] font-black leading-[1.15] tracking-tight [text-wrap:balance] sm:text-[2.6rem]">
            בחרו עסק וראו את התוכנית שלו
          </h2>
          <p className="mt-2 text-base leading-7 text-[var(--ink-soft)]">לכל עסק תוכנית אחרת ל-3 חודשים, לפי מה שגילינו עליו. אלה עסקים בדויים.</p>
        </header>

        <div
          ref={pillRowRef}
          role="tablist"
          aria-label="סוג העסק"
          className="lp-pills -mx-4 mt-6 flex gap-1 overflow-x-auto px-4 py-2 sm:-mx-8 sm:px-8 lg:mx-0 lg:mt-7 lg:flex-wrap lg:overflow-visible lg:px-0 lg:py-1"
        >
          {examples.map((example, index) => {
            const selected = index === current;
            const color = "var(--primary)";
            return (
              <button
                key={example.slug}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`lp-tab-${example.slug}`}
                aria-selected={selected}
                aria-controls="lp-stage"
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(index)}
                onKeyDown={onTabKeyDown}
                className={`relative inline-flex min-h-11 shrink-0 items-center overflow-hidden border-b-2 px-4 text-sm font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)] ${
                  selected
                    ? "border-[var(--lp-accent)] text-[var(--ink)]"
                    : "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]"
                }`}
                style={selected ? { color, borderColor: color } : undefined}
              >
                {example.pill}
                {selected && autoplay ? (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-[var(--rule)]">
                    <span
                      key={current}
                      data-paused={paused}
                      onAnimationEnd={advance}
                      className="lp-progress block h-full"
                      style={{ "--lp-duration": `${AUTO_ADVANCE_MS}ms`, backgroundColor: color } as CSSProperties}
                    />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-end gap-4 text-xs text-[var(--ink-soft)]">
          <span dir="ltr" className="tabular-nums">{current + 1} / {examples.length}</span>
          {motionAllowed ? <button type="button" data-rotation-control className="inline-flex min-h-11 items-center gap-2 font-bold" aria-label={autoplay ? "לעצור את המעבר האוטומטי בין העסקים" : "להפעיל מעבר אוטומטי בין העסקים"}
            onClick={() => { setPlayRequested(!autoplay); setAutoplay(!autoplay); }}>
            <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
              {autoplay ? <path d="M5 3v10M11 3v10" /> : <path d="m5 3 7 5-7 5Z" />}
            </svg>{autoplay ? "לעצור" : "להמשיך אוטומטית"}
          </button> : null}
        </div>

        {/* Announced only when the visitor switched; auto-advance stays quiet. */}
        <p className="sr-only" aria-live={autoplay ? "off" : "polite"} aria-atomic="true">
          {active.businessName}, {active.typeLabel}
        </p>

        <div ref={stageTopRef} aria-hidden className="h-px" />
        <div
          id="lp-stage"
          role="tabpanel"
          aria-labelledby={`lp-tab-${active.slug}`}
          tabIndex={0}
          className="lp-stack mt-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-8 focus-visible:ring-offset-[var(--canvas)]"
        >
          {examples.map((example, index) => (
            <PlanPanel
              key={example.slug}
              example={example}
              plan={LANDING_PLANS[example.slug]}
              current={index === current}
              reveal={seen && index === current}
              onDetailsChange={setReadingDetails}
            />
          ))}
        </div>

        <p className="mt-10 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">
          התקציבים בדוגמאות הם טווחים משוערים. את האתר אנחנו קוראים לבד, ונתונים מאינסטגרם רק אחרי שתחברו אותו. לא נמציא לכם מספרים.
        </p>
      </div>
    </div>
  );
}
