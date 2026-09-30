import type { CSSProperties } from "react";
import { Storefront } from "@/components/brand/Storefront";

type Point = readonly [number, number];
type Stop = { at: Point; label: string; place: "above" | "below" | "right" };
type Layout = { width: number; height: number; route: Point[]; stops: Stop[]; shopLabel: Point };

const LAYOUTS: Record<"wide" | "compact", Layout> = {
  wide: {
    width: 620, height: 280,
    route: [[535, 65], [365, 65], [365, 205], [145, 205], [145, 90], [80, 90]],
    stops: [
      { at: [535, 65], label: "מכירים את העסק", place: "above" },
      { at: [435, 65], label: "בונים תוכנית", place: "below" },
      { at: [365, 135], label: "כותבים פוסטים", place: "right" },
      { at: [285, 205], label: "מודדים", place: "below" },
      { at: [190, 205], label: "משפרים", place: "below" },
    ],
    shopLabel: [80, 146],
  },
  compact: {
    width: 360, height: 220,
    route: [[300, 60], [195, 60], [195, 160], [60, 160], [60, 60]],
    stops: [
      { at: [300, 60], label: "מכירים את העסק", place: "above" },
      { at: [242, 60], label: "בונים תוכנית", place: "below" },
      { at: [195, 115], label: "כותבים פוסטים", place: "right" },
      { at: [120, 160], label: "מודדים ומשפרים", place: "below" },
    ],
    shopLabel: [60, 106],
  },
};

const DRAW_START = .55;
const DRAW_DURATION = 2.1;
const TRAVEL_BEGIN = DRAW_START + DRAW_DURATION + .6;
const TRAVEL_DURATION = 7.2;

/** One flat, numbered route. First we draw the plan, then walk it to the shop. */
function roundedPath(points: Point[], radius: number): string {
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    d += ` L${cx - ((cx - px) / inLen) * r} ${cy - ((cy - py) / inLen) * r}`;
    d += ` Q${cx} ${cy} ${cx + ((nx - cx) / outLen) * r} ${cy + ((ny - cy) / outLen) * r}`;
  }
  const [x, y] = points[points.length - 1];
  return `${d} L${x} ${y}`;
}

const PLACE_CLASS = {
  above: "-translate-x-1/2 -translate-y-[calc(100%+16px)]",
  below: "-translate-x-1/2 translate-y-[16px]",
  right: "translate-x-[18px] -translate-y-1/2",
};

export function RouteMap({ variant, className = "" }: { variant: "wide" | "compact"; className?: string }) {
  const { width, height, route, stops, shopLabel } = LAYOUTS[variant];
  const wide = variant === "wide";
  const id = `rm-route-${variant}`;
  const d = roundedPath(route, wide ? 20 : 16);
  const [shopX, shopY] = route[route.length - 1];
  const timing = { "--rm-delay": `${DRAW_START}s`, "--rm-dur": `${DRAW_DURATION}s` } as CSSProperties;

  return (
    <figure
      style={{ "--rm-arrival": `${TRAVEL_BEGIN + TRAVEL_DURATION}s` } as CSSProperties}
      role="img"
      aria-label="מכירים את העסק, בונים תוכנית, כותבים פוסטים, מודדים ומשפרים. המסלול מסתיים בחנות שלכם, עם שמש שעולה מעליה."
      className={`lp-route relative overflow-hidden rounded border border-[var(--rule)] bg-[var(--paper)] ${className}`}
    >
      <figcaption className="px-5 pt-4 text-sm font-bold text-[var(--ink-soft)]">תוכנית אחת. 3 חודשים של עבודה.</figcaption>
      <div aria-hidden className="relative" style={{ aspectRatio: `${width} / ${height}` }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full" fill="none">
          <path d={d} stroke="var(--rule)" strokeWidth={wide ? 9 : 7} />
          <path id={id} className="rm-draw" d={d} pathLength={1} stroke="var(--primary)" strokeWidth={wide ? 4 : 3} style={timing} />
          {stops.map((stop, index) => (
            <g key={stop.label} transform={`translate(${stop.at[0]} ${stop.at[1]})`}>
              <circle r={wide ? 12 : 10} fill="var(--paper)" stroke="var(--primary)" strokeWidth="2" />
              <text textAnchor="middle" dominantBaseline="central" fill="var(--primary)" fontSize={wide ? 16 : 14} fontWeight="700">{index + 1}</text>
            </g>
          ))}
          <g className="rm-traveler" opacity="0">
            <circle r={wide ? 6 : 5} fill="var(--sun)" stroke="var(--paper)" strokeWidth="2" />
            <animateMotion dur={`${TRAVEL_DURATION}s`} begin={`${TRAVEL_BEGIN}s`} fill="freeze" calcMode="linear"><mpath href={`#${id}`} /></animateMotion>
            <animate attributeName="opacity" values="0;1;1" keyTimes="0;0.04;1" dur={`${TRAVEL_DURATION}s`} begin={`${TRAVEL_BEGIN}s`} fill="freeze" />
          </g>
          <svg x={shopX - (wide ? 75 : 50)} y={shopY - (wide ? 62 : 50)} width={wide ? 150 : 100} height={wide ? 110 : 73} className="rm-store">
            <Storefront phase={.5} animated className="rm-store-art" />
          </svg>
        </svg>
        {stops.map((stop) => (
          <span key={stop.label} className={`absolute whitespace-nowrap text-[13px] font-bold text-[var(--ink-soft)] ${PLACE_CLASS[stop.place]}`}
            style={{ left: `${stop.at[0] / width * 100}%`, top: `${stop.at[1] / height * 100}%` }}>{stop.label}</span>
        ))}
        <span className="absolute -translate-x-1/2 whitespace-nowrap text-[13px] font-bold text-[var(--primary)]"
          style={{ left: `${shopLabel[0] / width * 100}%`, top: `${shopLabel[1] / height * 100}%` }}>העסק שלכם</span>
      </div>
    </figure>
  );
}
