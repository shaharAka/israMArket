import type { CSSProperties } from "react";
import { Storefront } from "@/components/brand/Storefront";

/**
 * The hero's visual: a route being planned across a quiet street map, from "העסק שלכם"
 * through research and the plan to three months of work. It reads the way a navigation
 * app plots a trip (a faint alternative, then the chosen line drawing itself, stops
 * appearing as it reaches them), then arrives at the shared storefront and sunrise.
 * It is our own drawing: no pins, colours, icons or
 * chrome from any real map or navigation product.
 *
 * Server-rendered. The draw-in is CSS (stroke-dashoffset on a
 * pathLength=1 path, landing.css `.rm-*`), each stop's delay is computed here from its
 * distance along the route so it pops exactly when the line reaches it, and the small
 * dot that keeps travelling afterwards is SVG <animateMotion>. Under
 * prefers-reduced-motion the CSS shows the finished route and hides the moving dot.
 *
 * Two layouts of the same idea: `wide` beside the headline on desktop, `compact` under
 * the button on phones (short enough to keep the button above the fold). The headline
 * stays the page's LCP: nothing here is an image.
 */

type Point = readonly [number, number];
type Place = "above" | "below" | "right" | "left";
type Stop = { at: Point; label: string; place: Place; kind?: "start" | "end" };

type Layout = {
  width: number;
  height: number;
  route: Point[];
  /** A second way there, drawn faintly first: the "planning" beat. */
  ghost: Point[];
  streets: Point[][];
  park?: { x: number; y: number; w: number; h: number };
  stops: Stop[];
  radius: number;
};

const LABELS = ["העסק שלכם", "מחקר", "התוכנית", "חודש 1", "חודש 2", "חודש 3"] as const;

const LAYOUTS: Record<"wide" | "compact", Layout> = {
  wide: {
    width: 600,
    height: 480,
    radius: 26,
    route: [
      [515, 410],
      [380, 410],
      [380, 300],
      [260, 300],
      [260, 190],
      [120, 190],
      [120, 90],
      [64, 90],
    ],
    ghost: [
      [515, 410],
      [500, 410],
      [500, 190],
      [120, 190],
    ],
    streets: [
      [[180, 410], [600, 410]],
      [[40, 300], [560, 300]],
      [[0, 190], [540, 190]],
      [[0, 90], [340, 90]],
      [[380, 220], [380, 480]],
      [[260, 100], [260, 400]],
      [[120, 20], [120, 300]],
      [[500, 110], [500, 480]],
      [[60, 30], [60, 480]],
    ],
    park: { x: 400, y: 100, w: 84, h: 74 },
    stops: [
      { at: [515, 410], label: LABELS[0], place: "below", kind: "start" },
      { at: [445, 410], label: LABELS[1], place: "above" },
      { at: [320, 300], label: LABELS[2], place: "below" },
      { at: [260, 245], label: LABELS[3], place: "left" },
      { at: [190, 190], label: LABELS[4], place: "above" },
      { at: [64, 90], label: LABELS[5], place: "below", kind: "end" },
    ],
  },
  compact: {
    width: 360,
    height: 176,
    radius: 16,
    route: [
      [310, 128],
      [225, 128],
      [225, 62],
      [105, 62],
      [105, 128],
      [40, 128],
      [40, 62],
    ],
    ghost: [
      [310, 128],
      [280, 128],
      [280, 62],
      [225, 62],
    ],
    streets: [
      [[0, 128], [360, 128]],
      [[0, 62], [360, 62]],
      [[225, 20], [225, 176]],
      [[105, 0], [105, 176]],
      [[40, 20], [40, 160]],
      [[280, 0], [280, 176]],
    ],
    stops: [
      { at: [310, 128], label: LABELS[0], place: "above", kind: "start" },
      { at: [262, 128], label: LABELS[1], place: "below" },
      { at: [190, 62], label: LABELS[2], place: "above" },
      { at: [140, 62], label: LABELS[3], place: "below" },
      { at: [72, 128], label: LABELS[4], place: "below" },
      { at: [40, 62], label: LABELS[5], place: "below", kind: "end" },
    ],
  },
};

/** When the line starts drawing, and how long it takes end to end (seconds). */
const DRAW_START = 0.55;
const DRAW_DURATION = 2.1;
/** The travelling dot starts once the route is drawn and every stop has appeared. */
const TRAVEL_BEGIN = DRAW_START + DRAW_DURATION + 0.6;
const TRAVEL_DURATION = 13;

function polyline(points: Point[]): string {
  return points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(" ");
}

/** An orthogonal route with rounded corners, like a line following streets. */
function roundedPath(points: Point[], radius: number): string {
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const ax = cx - ((cx - px) / inLen) * r;
    const ay = cy - ((cy - py) / inLen) * r;
    const bx = cx + ((nx - cx) / outLen) * r;
    const by = cy + ((ny - cy) / outLen) * r;
    d += ` L${ax} ${ay} Q${cx} ${cy} ${bx} ${by}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L${lx} ${ly}`;
}

/**
 * How far along the route a stop sits, 0–1. Each rounded corner is a little shorter than
 * the square one it replaces, so corners passed are subtracted to keep the pop in sync.
 */
function progressAt(points: Point[], radius: number, at: Point): number {
  const corner = (2 - Math.PI / 2) * radius;
  let total = 0;
  let reached: number | null = null;
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const length = Math.hypot(bx - ax, by - ay);
    const onSegment =
      reached === null &&
      Math.abs(Math.hypot(at[0] - ax, at[1] - ay) + Math.hypot(bx - at[0], by - at[1]) - length) < 0.5;
    if (onSegment) reached = total + Math.hypot(at[0] - ax, at[1] - ay) - Math.max(0, i - 1) * corner;
    total += length;
  }
  const full = total - Math.max(0, points.length - 2) * corner;
  return Math.min(1, Math.max(0, (reached ?? full) / full));
}

const PLACE_CLASS: Record<Place, string> = {
  above: "-translate-x-1/2 -translate-y-[calc(100%+12px)]",
  below: "-translate-x-1/2 translate-y-[12px]",
  right: "translate-x-[14px] -translate-y-1/2",
  left: "-translate-x-[calc(100%+14px)] -translate-y-1/2",
};

export function RouteMap({ variant, className = "" }: { variant: "wide" | "compact"; className?: string }) {
  const layout = LAYOUTS[variant];
  const { width, height, route, radius } = layout;
  const id = `rm-route-${variant}`;
  const d = roundedPath(route, radius);
  const wide = variant === "wide";

  const stops = layout.stops.map((stop) => {
    const delay = stop.kind === "start" ? 0.2 : DRAW_START + DRAW_DURATION * progressAt(route, radius, stop.at);
    return { ...stop, delay };
  });

  return (
    <figure
      role="img"
      aria-label={`המסלול: ${LABELS.join(", ")}`}
      className={`lp-route relative overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--paper)] ${className}`}
    >
      <div aria-hidden className={`flex items-center gap-2 ${wide ? "px-6 pt-5" : "px-4 pt-3.5"}`}>
        <span className="rm-status-dot relative inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--primary)]" />
        <span className="grid text-[13px] font-bold text-[var(--ink-soft)]">
          <span className="rm-status-a [grid-area:1/1]">בונים את המסלול…</span>
          <span className="rm-status-b [grid-area:1/1]">המסלול ל-3 החודשים מוכן</span>
        </span>
      </div>

      <div aria-hidden className="relative" style={{ aspectRatio: `${width} / ${height}` }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full" fill="none">
          <defs>
            <pattern id={`${id}-dots`} width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="1.1" fill="var(--rule-dark)" />
            </pattern>
          </defs>

          {/* The map: dot paper, a few streets, one small park. */}
          <g className="rm-map">
            <rect width={width} height={height} fill={`url(#${id}-dots)`} opacity="0.7" />
            {layout.park ? (
              <rect x={layout.park.x} y={layout.park.y} width={layout.park.w} height={layout.park.h} rx="18" fill="var(--primary-soft)" opacity="0.8" />
            ) : null}
            {layout.streets.map((street, index) => (
              <path key={index} d={polyline(street)} stroke="var(--rule)" strokeWidth={wide ? 16 : 11} strokeLinecap="round" />
            ))}
          </g>

          {/* Another way there, considered and set aside. */}
          <path
            className="rm-ghost"
            d={roundedPath(layout.ghost, radius)}
            stroke="var(--rule-dark)"
            strokeWidth={wide ? 3 : 2.5}
            strokeDasharray={wide ? "2 9" : "2 7"}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* The chosen route: a white casing under the line, both drawn in together. */}
          <path
            className="rm-draw"
            d={d}
            pathLength={1}
            stroke="#ffffff"
            strokeWidth={wide ? 13 : 10}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ "--rm-delay": `${DRAW_START}s`, "--rm-dur": `${DRAW_DURATION}s` } as CSSProperties}
          />
          <path
            id={id}
            className="rm-draw"
            d={d}
            pathLength={1}
            stroke="var(--primary)"
            strokeWidth={wide ? 5.5 : 4.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ "--rm-delay": `${DRAW_START}s`, "--rm-dur": `${DRAW_DURATION}s` } as CSSProperties}
          />

          {stops.map((stop) => {
            const [x, y] = stop.at;
            const style = { "--rm-delay": `${stop.delay.toFixed(2)}s` } as CSSProperties;
            if (stop.kind === "start") {
              return (
                <g key={stop.label} transform={`translate(${x} ${y})`}>
                  <circle className="rm-halo" r={wide ? 11 : 9} fill="var(--primary)" opacity="0.18" />
                  <circle className="rm-pop" style={style} r={wide ? 9 : 7.5} fill="var(--primary)" stroke="#fff" strokeWidth="3" />
                </g>
              );
            }
            if (stop.kind === "end") {
              return (
                <g key={stop.label} transform={`translate(${x} ${y})`}>
                  <svg x={wide ? -80 : -50} y={wide ? -95 : -65} width={wide ? 160 : 100} height={wide ? 117 : 73} className="rm-store">
                    <Storefront phase={.5} animated className="rm-store-art" />
                  </svg>
                </g>
              );
            }
            return (
              <g key={stop.label} transform={`translate(${x} ${y})`}>
                <circle className="rm-pop" style={style} r={wide ? 8 : 6.5} fill="#fff" stroke="var(--primary)" strokeWidth={wide ? 3.5 : 3} />
              </g>
            );
          })}

          {/* Your business, moving along the plan. Starts after the draw, rests at the end,
              fades, and goes again. Hidden under reduced motion (landing.css). */}
          <g className="rm-traveler" opacity="0">
            <circle r={wide ? 11 : 9} fill="var(--sun)" opacity="0.28" />
            <circle r={wide ? 6 : 5} fill="var(--sun)" stroke="#fff" strokeWidth="2.5" />
            <animateMotion
              dur={`${TRAVEL_DURATION}s`}
              begin={`${TRAVEL_BEGIN}s`}
              repeatCount="indefinite"
              keyPoints="0;1;1"
              keyTimes="0;0.8;1"
              calcMode="linear"
            >
              <mpath href={`#${id}`} />
            </animateMotion>
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              keyTimes="0;0.05;0.9;1"
              dur={`${TRAVEL_DURATION}s`}
              begin={`${TRAVEL_BEGIN}s`}
              repeatCount="indefinite"
            />
          </g>
        </svg>

        {/* Labels are HTML so they stay a readable size however the map scales. */}
        {stops.map((stop) => (
          <span
            key={stop.label}
            className={`absolute ${PLACE_CLASS[stop.place]}`}
            style={{ left: `${(stop.at[0] / width) * 100}%`, top: `${(stop.at[1] / height) * 100}%` }}
          >
            <span
              className={`rm-label block whitespace-nowrap rounded-sm border font-bold ${
                wide ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[12px]"
              } ${
                stop.kind === "start"
                  ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                  : stop.kind === "end"
                    ? "border-[var(--sun)] bg-[var(--sand)] text-[var(--sand-dark)]"
                    : "border-[var(--rule)] bg-white/95 text-[var(--ink-soft)]"
              }`}
              style={{ "--rm-delay": `${(stop.delay + 0.08).toFixed(2)}s` } as CSSProperties}
            >
              {stop.label}
            </span>
          </span>
        ))}
      </div>
    </figure>
  );
}
