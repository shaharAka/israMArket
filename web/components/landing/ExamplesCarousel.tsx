"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconArrowLeft, IconArrowRight } from "@/lib/icons";
import { LANDING_EXAMPLES, type LandingExample } from "./examples";
import { ExampleStory } from "./ExampleStory";

/** Slow on purpose: a slide carries three short paragraphs, not a single picture. */
const AUTO_ADVANCE_MS = 8000;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Horizontal scroll-snap carousel of example stories (research → direction → post).
 *
 * The track is a native scroller, so swiping on a phone is the browser's own gesture and
 * needs no library. Arrows and dots move it with `scrollBy` measured from the slide's
 * RTL start edge, which is correct under every browser's RTL `scrollLeft` convention.
 *
 * Auto-advance is optional and gentle: off under prefers-reduced-motion, paused while the
 * pointer or focus is inside, while the carousel is off screen or the tab is hidden, and
 * stopped for good once the visitor swipes, clicks or uses the keyboard.
 */
export function ExamplesCarousel({ examples = LANDING_EXAMPLES }: { examples?: LandingExample[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  /** Every slide fully on screen: one on a phone, three on a wide desktop. */
  const [inView, setInView] = useState<number[]>([0]);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  // Decided after mount: the server cannot know the visitor's motion preference.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAutoplay(!media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  /** Which slide sits at the start (right) edge, and whether either end is reached. */
  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const box = track.getBoundingClientRect();
    const padStart = parseFloat(getComputedStyle(track).paddingRight) || 0;
    const edge = box.right - padStart;
    let best = 0;
    let bestDistance = Infinity;
    const shown: number[] = [];
    slideRefs.current.forEach((slide, index) => {
      if (!slide) return;
      const rect = slide.getBoundingClientRect();
      const distance = Math.abs(rect.right - edge);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
      if (rect.left >= box.left - 8 && rect.right <= box.right + 8) shown.push(index);
    });
    const scrolled = Math.abs(track.scrollLeft);
    const maxScroll = track.scrollWidth - track.clientWidth;
    setActive(best);
    setInView(shown.length ? shown : [best]);
    setAtStart(scrolled < 4);
    setAtEnd(scrolled > maxScroll - 4);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    measure();
    return () => {
      window.cancelAnimationFrame(frame);
      track.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [measure]);

  // Only advance while the carousel is actually on screen.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.5,
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const goTo = useCallback((index: number) => {
    const track = trackRef.current;
    const count = slideRefs.current.length;
    if (!track || !count) return;
    const target = slideRefs.current[((index % count) + count) % count];
    if (!target) return;
    const padStart = parseFloat(getComputedStyle(track).paddingRight) || 0;
    const delta = target.getBoundingClientRect().right - (track.getBoundingClientRect().right - padStart);
    track.scrollBy({ left: delta, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  const paused = !autoplay || hovered || focused || !visible;
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      // At the last position that can reach the start edge, wrap back to the first.
      goTo(atEnd ? 0 : active + 1);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [paused, active, atEnd, goTo]);

  /** Any deliberate move by the visitor ends auto-advance: they are reading now. */
  const takeOver = () => setAutoplay(false);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // RTL: the next slide is to the left.
    const moves: Record<string, () => void> = {
      ArrowLeft: () => goTo(active + 1),
      ArrowRight: () => goTo(active - 1),
      Home: () => goTo(0),
      End: () => goTo(examples.length - 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    takeOver();
    move();
  }

  return (
    <div
      role="region"
      aria-roledescription="קרוסלה"
      aria-label="דוגמאות לעסקים"
      onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div
        ref={trackRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={takeOver}
        onWheel={(event) => Math.abs(event.deltaX) > Math.abs(event.deltaY) && takeOver()}
        aria-label="אפשר לגלול לצדדים, או להשתמש בחצים במקלדת"
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-2 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-[#191b18] focus-visible:ring-offset-4 focus-visible:ring-offset-[#f9f8f6] sm:scroll-px-8 sm:px-8 [&::-webkit-scrollbar]:hidden"
      >
        {examples.map((example, index) => (
          <div
            key={example.slug}
            ref={(node) => {
              slideRefs.current[index] = node;
            }}
            role="group"
            aria-roledescription="דוגמה"
            aria-label={`${index + 1} מתוך ${examples.length}: ${example.businessName}`}
            className="w-[86%] max-w-[380px] shrink-0 snap-start sm:w-[380px] lg:w-[calc((100%-2rem)/3)] lg:max-w-none"
          >
            <ExampleStory example={example} />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 px-4 sm:justify-between sm:px-8">
        <button
          type="button"
          onClick={() => {
            takeOver();
            goTo(active - 1);
          }}
          disabled={atStart}
          aria-label="לדוגמה הקודמת"
          title="לדוגמה הקודמת"
          className="hidden h-11 w-11 items-center justify-center rounded-full border border-[#dedcd4] bg-white text-[#191b18] transition-colors hover:border-[#191b18] disabled:opacity-35 disabled:hover:border-[#dedcd4] sm:inline-flex"
        >
          <IconArrowRight className="h-5 w-5" />
        </button>

        <div className="flex items-center" role="group" aria-label="בחירת דוגמה">
          {examples.map((example, index) => (
            <button
              key={example.slug}
              type="button"
              onClick={() => {
                takeOver();
                goTo(index);
              }}
              aria-label={`דוגמה ${index + 1}: ${example.businessName}`}
              aria-current={index === active ? "true" : undefined}
              title={example.businessName}
              className="group inline-flex h-11 w-7 items-center justify-center"
            >
              <span
                className={`block h-2 rounded-full transition-all duration-300 motion-reduce:transition-none ${
                  inView.includes(index) ? "w-5 bg-[#191b18]" : "w-2 bg-[#cfccc2] group-hover:bg-[#8b8e84]"
                }`}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            takeOver();
            goTo(active + 1);
          }}
          disabled={atEnd}
          aria-label="לדוגמה הבאה"
          title="לדוגמה הבאה"
          className="hidden h-11 w-11 items-center justify-center rounded-full border border-[#dedcd4] bg-white text-[#191b18] transition-colors hover:border-[#191b18] disabled:opacity-35 disabled:hover:border-[#dedcd4] sm:inline-flex"
        >
          <IconArrowLeft className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
