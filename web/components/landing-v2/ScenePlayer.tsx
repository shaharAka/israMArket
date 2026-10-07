"use client";

import { useEffect } from "react";

/**
 * Plays the landing's scenes by themselves once they are on screen. Nothing waits for the
 * visitor to scroll, and nothing is pinned: the page scrolls normally, and a scene that is
 * on screen moves on a clock (requestAnimationFrame), setting the same custom properties
 * and attributes the CSS reads (--q, --p, --pp, data-state, data-reached, data-on).
 *
 * - `data-scene="steps"` (how the plan is built, the weekly screen): each `[data-i]` inside
 *   gets `data-state` (past / current / future) and `--pp` (the progress within its step),
 *   one step every `data-hold` ms. After the last step the scene gets `data-done` and the
 *   CSS shows everything at once. Its rows are buttons (`[data-step-to]`): picking one
 *   shows that step and stops the autoplay for good, the visitor's choice wins.
 *   A plan sheet that folds (`[data-fold-stack]`) takes the height of its tallest state,
 *   and its parts fold by transform and clip-path, so nothing on the page reflows.
 * - `data-scene="reveal"`: `--p` goes 0 → 1 in a second, once, when it comes into view.
 * - `[data-count-to]` counts from `data-count-from` with its step's `--pp`.
 *
 * A scene plays while at least half of it is on screen (or it fills half the screen), pauses
 * in place once most of it has left, and resumes from the same point. The server HTML is the
 * finished state, so nothing depends on JavaScript. The inline script in Landing marks
 * `html[data-lv2="on"]` before the first paint when motion is allowed, so the lower scenes start
 * at their first step instead of flashing finished. Under prefers-reduced-motion nothing moves: every
 * scene shows its finished state, and picking a step still works, without animation.
 */

const PLAY_AT = 0.5;
const PAUSE_BELOW = 0.3;
const REVEAL_AT = 0.2;
const REVEAL_MS = 1000;

/** A step's counter reaches its number in the first part of the step, then holds. */
const COUNT_SHARE = 0.4;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

type Scene = {
  el: HTMLElement;
  kind: "steps" | "reveal";
  /** The whole play, in ms. */
  length: number;
  /** How far it has played, in ms. */
  t: number;
  /** On screen enough to move. */
  playing: boolean;
  done: boolean;
  /** The visitor picked a step: no more autoplay. */
  held: boolean;
  /** Keyboard focus is inside: wait. */
  paused: boolean;
  draw: (t: number) => void;
  finish: () => void;
  pick?: (index: number) => void;
  reset?: () => void;
  size?: () => void;
};

function base(el: HTMLElement, kind: Scene["kind"], length: number) {
  return { el, kind, length, t: 0, playing: false, done: false, held: false, paused: false };
}

function stepsScene(el: HTMLElement): Scene {
  const parts = Array.from(el.querySelectorAll<HTMLElement>("[data-i]"));
  const buttons = Array.from(el.querySelectorAll<HTMLElement>("[data-step-to]"));
  const counters = Array.from(el.querySelectorAll<HTMLElement>("[data-count-to]"));
  const stacks = Array.from(el.querySelectorAll<HTMLElement>("[data-fold-stack]"));
  const count = Math.max(1, ...parts.map((part) => Number(part.dataset.i) + 1));
  const hold = Number(el.dataset.hold) || 3000;

  const progress = (i: number, step: number, within: number) => (i < step ? 1 : i === step ? within : 0);

  // The folding plan sheet. Live, its parts sit on top of each other (position: absolute)
  // and fold by transform and clip-path, never by layout, so nothing reflows while it
  // plays. Each part is either open (its full height) or folded (down to its body).
  const folds = stacks.map((stack) => ({ stack, parts: Array.from(stack.querySelectorAll<HTMLElement>(".lv2-fold")) }));
  const heights = folds.map(() => ({ open: [] as number[], folded: [] as number[] }));
  let current = 0;

  const fold = (step: number) => {
    folds.forEach(({ parts }, k) => {
      const { open, folded } = heights[k];
      if (!open.length) return;
      let y = 0;
      parts.forEach((part, i) => {
        const shown = i === step ? open[i] : folded[i];
        part.style.setProperty("--fold-y", `${y}px`);
        part.style.setProperty("--fold-cut", `${open[i] - shown}px`);
        y += shown;
      });
    });
  };

  // Measured while live: every part laid out open. The stack takes its tallest state.
  const size = () => {
    folds.forEach(({ stack, parts }, k) => {
      const open = parts.map((part) => part.offsetHeight);
      const folded = parts.map((part, i) => {
        const body = part.querySelector<HTMLElement>(".lv2-fold-body");
        return body ? body.getBoundingClientRect().top - part.getBoundingClientRect().top : open[i];
      });
      heights[k] = { open, folded };
      const tallest = Math.max(...parts.map((_, c) => parts.reduce((sum, __, i) => sum + (i === c ? open[i] : folded[i]), 0)));
      stack.style.height = `${Math.ceil(tallest)}px`;
    });
    fold(current);
  };

  const show = (step: number, within: number) => {
    if (step !== current) {
      current = step;
      fold(step);
    }
    for (const part of parts) {
      const i = Number(part.dataset.i);
      const state = i < step ? "past" : i === step ? "current" : "future";
      if (part.dataset.state !== state) part.dataset.state = state;
      part.style.setProperty("--pp", progress(i, step, within).toFixed(4));
    }
    for (const button of buttons) {
      if (Number(button.dataset.stepTo) === step) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    }
    for (const counter of counters) {
      const host = counter.closest<HTMLElement>("[data-i]");
      const pp = host ? progress(Number(host.dataset.i), step, within) : 1;
      const from = Number(counter.dataset.countFrom || 0);
      const to = Number(counter.dataset.countTo);
      const text = Math.round(from + (to - from) * easeOut(clamp(pp / COUNT_SHARE))).toLocaleString("he-IL");
      if (counter.textContent !== text) counter.textContent = text;
    }
  };

  const scene: Scene = {
    ...base(el, "steps", hold * count),
    draw: (t) => {
      const step = Math.min(count - 1, Math.floor(t / hold));
      show(step, clamp(t / hold - step));
    },
    finish: () => {
      show(count - 1, 1);
      el.dataset.done = "";
    },
    pick: (index) => {
      delete el.dataset.done;
      show(index, 1);
    },
    reset: () => {
      delete el.dataset.live;
      delete el.dataset.done;
      for (const stack of stacks) stack.style.height = "";
      for (const part of parts) {
        part.style.removeProperty("--pp");
        part.style.removeProperty("--fold-y");
        part.style.removeProperty("--fold-cut");
      }
      for (const button of buttons) button.removeAttribute("aria-current");
      for (const counter of counters) counter.textContent = Number(counter.dataset.countTo).toLocaleString("he-IL");
    },
    size,
  };
  return scene;
}

function revealScene(el: HTMLElement): Scene {
  const show = (p: number) => el.style.setProperty("--p", p.toFixed(4));
  return { ...base(el, "reveal", REVEAL_MS), draw: (t) => show(easeOut(clamp(t / REVEAL_MS))), finish: () => show(1) };
}

export function ScenePlayer() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let still = reduce.matches;
    if (still) delete root.dataset.lv2;
    else root.dataset.lv2 = "on";

    const scenes: Scene[] = [];
    const byElement = new Map<Element, Scene>();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-scene]"))) {
      const kind = el.dataset.scene;
      const scene = kind === "steps" ? stepsScene(el) : kind === "reveal" ? revealScene(el) : null;
      if (!scene) continue;
      scenes.push(scene);
      byElement.set(el, scene);
    }
    const sceneOf = (node: EventTarget | null) => {
      const el = node instanceof Element ? node.closest("[data-scene]") : null;
      return el ? byElement.get(el) : undefined;
    };

    const live = (scene: Scene) => {
      scene.el.dataset.live = "";
      scene.size?.();
    };

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      let more = false;
      for (const scene of scenes) {
        if (still || !scene.playing || scene.done || scene.held || scene.paused) continue;
        scene.t = Math.min(scene.length, scene.t + dt);
        if (scene.t >= scene.length) {
          scene.done = true;
          scene.finish();
        } else {
          scene.draw(scene.t);
          more = true;
        }
      }
      if (more) frame = window.requestAnimationFrame(tick);
      else last = 0;
    };
    const wake = () => {
      if (!frame) frame = window.requestAnimationFrame(tick);
    };

    // The start: the first frame of every scene, set without animation, or, without
    // motion, the finished one.
    const instant: HTMLElement[] = [];
    for (const scene of scenes) {
      if (still) {
        if (scene.kind !== "steps") {
          scene.done = true;
          scene.finish();
        }
        continue;
      }
      scene.el.dataset.instant = "";
      instant.push(scene.el);
      scene.draw(0);
      if (scene.kind === "steps") live(scene);
    }
    let settle = window.requestAnimationFrame(() => {
      settle = window.requestAnimationFrame(() => {
        settle = 0;
        for (const el of instant) delete el.dataset.instant;
      });
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const scene = byElement.get(entry.target);
          if (!scene || still) continue;
          const screen = entry.rootBounds?.height || window.innerHeight;
          const seen = entry.isIntersecting ? Math.max(entry.intersectionRatio, entry.intersectionRect.height / screen) : 0;
          if (scene.done) continue;
          if (seen >= (scene.kind === "reveal" ? REVEAL_AT : PLAY_AT)) {
            scene.playing = true;
          } else if (seen < PAUSE_BELOW && scene.kind !== "reveal") {
            scene.playing = false;
          }
        }
        wake();
      },
      { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
    );
    for (const scene of scenes) observer.observe(scene.el);

    // Picking a step: show it and stop the autoplay. Works without motion too.
    const onClick = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-step-to]") : null;
      const scene = button ? sceneOf(button) : undefined;
      if (!button || !scene?.pick) return;
      scene.held = true;
      scene.done = false;
      if (!("live" in scene.el.dataset)) live(scene);
      scene.pick(Number(button.dataset.stepTo));
    };

    // Moving through the steps with the keyboard: wait until focus leaves.
    const onFocusIn = (event: FocusEvent) => {
      const scene = sceneOf(event.target);
      if (scene?.kind === "steps" && event.target instanceof Element && event.target.matches(":focus-visible")) scene.paused = true;
    };
    const onFocusOut = (event: FocusEvent) => {
      const scene = sceneOf(event.target);
      if (!scene?.paused || (event.relatedTarget instanceof Node && scene.el.contains(event.relatedTarget))) return;
      scene.paused = false;
      wake();
    };

    let sizing = 0;
    const onResize = () => {
      if (sizing) return;
      sizing = window.requestAnimationFrame(() => {
        sizing = 0;
        for (const scene of scenes) if ("live" in scene.el.dataset) scene.size?.();
      });
    };
    document.fonts?.ready.then(onResize);

    // Motion turned off while on the page: everything to its finished state.
    const onMotion = () => {
      if (!reduce.matches || still) return;
      still = true;
      delete root.dataset.lv2;
      for (const scene of scenes) {
        if (scene.kind === "steps") {
          if (!scene.held) scene.reset?.();
        } else {
          scene.done = true;
          scene.finish();
        }
      }
    };

    document.addEventListener("click", onClick);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("resize", onResize);
    reduce.addEventListener("change", onMotion);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (sizing) window.cancelAnimationFrame(sizing);
      if (settle) window.cancelAnimationFrame(settle);
      observer.disconnect();
      document.removeEventListener("click", onClick);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", onResize);
      reduce.removeEventListener("change", onMotion);
      delete root.dataset.lv2;
    };
  }, []);

  return null;
}
