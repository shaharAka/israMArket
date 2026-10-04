"use client";

import { useEffect } from "react";

/**
 * Scroll-linked motion for the landing draft. Motion follows the scroll position, both
 * ways, instead of firing once: scrolling back up rewinds it.
 *
 * - `data-scene="hero"`: `--p` goes 0 → 1 over the first 70% of a screen of scroll.
 * - `data-scene="view"`: `--p` goes 0 → 1 while the element travels from the bottom of
 *   the screen to 40% from the top. `--pp` mirrors it for counters and lines inside.
 * - `data-scene="track"`: a tall section with a sticky child, split into `data-steps`
 *   steps. It gets `data-step` (the active step) and each `[data-i]` inside gets
 *   `data-state` (past / current / future) and `--pp` (0 future, the progress within the
 *   step when current, 1 past).
 * - `[data-count-to]`: text counts from `data-count-from` to `data-count-to` with the
 *   nearest `--pp` host.
 * - A scene holding `[data-route-path]` (the hero map) gets `--q`, how far along the route
 *   (from the pinned scroll on desktop, from the map's own position on phones); the puck
 *   `[data-route-puck]` drives and turns along the path, stops `[data-at]` get
 *   `data-reached`, and the `[data-next]` step matching the stops passed gets `data-on`.
 *
 * The server HTML is the finished state (numbers at their final value, everything
 * visible), so nothing depends on JavaScript. CSS only hides "future" parts once this has
 * run (`html[data-lv2="on"]`). Under prefers-reduced-motion there is no scrubbing: the
 * story still moves step by step, everything else shows its final state.
 */
export function ScrollScenes() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scenes = Array.from(document.querySelectorAll<HTMLElement>("[data-scene]"));
    const counters = Array.from(document.querySelectorAll<HTMLElement>("[data-count-to]"));
    const progressOf = new WeakMap<Element, number>();
    let frame = 0;

    const routes = scenes.flatMap((scene) => {
      const path = scene.querySelector<SVGPathElement>("[data-route-path]");
      if (!path) return [];
      return [
        {
          scene,
          path,
          length: path.getTotalLength(),
          puck: scene.querySelector<SVGGElement>("[data-route-puck]"),
          map: scene.querySelector<HTMLElement>(".lv2-map"),
          stops: Array.from(scene.querySelectorAll<Element>("[data-at]")),
          next: Array.from(scene.querySelectorAll<HTMLElement>("[data-next]")),
        },
      ];
    });

    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    function update() {
      frame = 0;
      const vh = window.innerHeight;
      const still = reduce.matches;

      for (const scene of scenes) {
        const box = scene.getBoundingClientRect();
        const kind = scene.dataset.scene;

        if (kind === "track") {
          const run = box.height - vh;
          const p = run > 0 ? clamp(-box.top / run) : 1;
          const steps = Math.max(1, Number(scene.dataset.steps || 1));
          const position = p * steps;
          const step = Math.min(steps - 1, Math.floor(position));
          const within = still ? 1 : clamp(position - step);
          scene.dataset.step = String(step);
          scene.style.setProperty("--p", p.toFixed(4));
          progressOf.set(scene, p);
          for (const part of Array.from(scene.querySelectorAll<HTMLElement>("[data-i]"))) {
            const i = Number(part.dataset.i);
            const state = i < step ? "past" : i === step ? "current" : "future";
            const pp = state === "past" ? 1 : state === "current" ? within : 0;
            if (part.dataset.state !== state) part.dataset.state = state;
            if (part.hasAttribute("data-scene-step")) part.setAttribute("aria-current", state === "current" ? "step" : "false");
            part.style.setProperty("--pp", pp.toFixed(4));
            progressOf.set(part, pp);
          }
          continue;
        }

        const p = still
          ? 1
          : kind === "hero"
            ? clamp(window.scrollY / (vh * 0.7))
            : clamp((vh - box.top) / (vh * 0.6));
        scene.style.setProperty("--p", p.toFixed(4));
        scene.style.setProperty("--pp", p.toFixed(4));
        progressOf.set(scene, p);
      }

      for (const route of routes) {
        const run = route.scene.getBoundingClientRect().height - vh;
        let q = 1;
        if (!still) {
          if (route.scene.dataset.scene === "track" && run > 40) {
            q = clamp((progressOf.get(route.scene) ?? 0) / 0.85);
          } else if (route.map) {
            const box = route.map.getBoundingClientRect();
            q = clamp((vh * 0.92 - box.top) / (box.height * 0.95));
          }
        }
        route.scene.style.setProperty("--q", q.toFixed(4));
        if (route.puck) {
          const here = route.path.getPointAtLength(route.length * q);
          const ahead = route.path.getPointAtLength(Math.min(route.length, route.length * q + 2));
          const behind = route.path.getPointAtLength(Math.max(0, route.length * q - 2));
          const from = q >= 0.999 ? behind : here;
          const to = q >= 0.999 ? here : ahead;
          const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
          route.puck.setAttribute("transform", `translate(${here.x.toFixed(1)} ${here.y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
        }
        let passed = 0;
        for (const stop of route.stops) {
          const reached = q >= Number(stop.getAttribute("data-at"));
          if (reached && stop.hasAttribute("data-stop") && stop.tagName.toLowerCase() === "div") passed += 1;
          const value = reached ? "true" : "false";
          if (stop.getAttribute("data-reached") !== value) stop.setAttribute("data-reached", value);
        }
        const current = q >= 0.985 ? route.next.length - 1 : Math.min(passed, route.next.length - 1);
        route.next.forEach((item, i) => {
          if (i === current) item.dataset.on = "true";
          else delete item.dataset.on;
        });
      }

      for (const counter of counters) {
        const host = counter.closest("[data-i], [data-scene]");
        const pp = host ? progressOf.get(host) ?? 1 : 1;
        const from = Number(counter.dataset.countFrom || 0);
        const to = Number(counter.dataset.countTo);
        const value = Math.round(from + (to - from) * easeOut(pp));
        const text = value.toLocaleString("he-IL");
        if (counter.textContent !== text) counter.textContent = text;
      }
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    update();
    root.dataset.lv2 = "on";
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduce.addEventListener("change", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduce.removeEventListener("change", schedule);
      delete root.dataset.lv2;
    };
  }, []);

  return null;
}
