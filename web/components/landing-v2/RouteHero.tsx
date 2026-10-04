import type { CSSProperties } from "react";
import { BrandMark } from "@/lib/icons";
import { EXAMPLE, GOAL, NEXT_STEPS, ROUTE_STOPS } from "./content";

/**
 * The hero's map: the plan as a route, like a navigation app. A dotted planned route, the
 * blue route drawing itself in, the storefront driving it, the months as stops, and
 * the goal as the destination. Two panels, as in a navigation app: the arrival (the goal)
 * and the next step (which changes at every stop).
 *
 * The map is a 640 × 560 SVG; the HTML labels sit on it in percentages of the same box, so
 * they stay crisp and aligned at any size. ScenePlayer plays it once it is on screen: it
 * drives `--q` (0–1, how far along) and moves the puck. Without JavaScript, or with reduced
 * motion, the route is simply complete.
 */

const W = 640;
const H = 560;

/** Along the streets: 480 → 430 → 330 → 250 → 180 → 110, rounded at every turn. */
export const ROUTE_D =
  "M560 480H454Q430 480 430 456V354Q430 330 406 330H274Q250 330 250 306V204Q250 180 226 180H134Q110 180 110 156V100";

const at = (x: number, y: number) =>
  ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }) as CSSProperties;

function Streets() {
  return (
    <g>
      {/* Blocks: faint buildings so the streets read as a city, not a grid. */}
      <g fill="#e3e8f1">
        <rect x="14" y="14" width="80" height="60" rx="8" />
        <rect x="126" y="14" width="108" height="60" rx="8" />
        <rect x="126" y="106" width="108" height="58" rx="8" />
        <rect x="14" y="106" width="80" height="58" rx="8" />
        <rect x="266" y="14" width="148" height="60" rx="8" />
        <rect x="446" y="14" width="98" height="60" rx="8" />
        <rect x="576" y="14" width="50" height="60" rx="8" />
        <rect x="446" y="106" width="98" height="58" rx="8" />
        <rect x="576" y="106" width="50" height="58" rx="8" />
        <rect x="14" y="196" width="80" height="118" rx="8" />
        <rect x="126" y="196" width="108" height="118" rx="8" />
        <rect x="446" y="196" width="98" height="118" rx="8" />
        <rect x="576" y="196" width="50" height="118" rx="8" />
        <rect x="14" y="346" width="80" height="118" rx="8" />
        <rect x="126" y="346" width="108" height="118" rx="8" />
        <rect x="266" y="346" width="60" height="118" rx="8" />
        <rect x="354" y="346" width="60" height="118" rx="8" />
        <rect x="446" y="346" width="98" height="118" rx="8" />
        <rect x="14" y="496" width="80" height="50" rx="8" />
        <rect x="126" y="496" width="108" height="50" rx="8" />
        <rect x="266" y="496" width="148" height="50" rx="8" />
        <rect x="446" y="496" width="98" height="50" rx="8" />
      </g>
      {/* A small park: the one warm patch on the map. */}
      <rect x="266" y="196" width="148" height="118" rx="18" fill="#e2eee5" />
      <g fill="#cfe3d4">
        <circle cx="300" cy="232" r="10" />
        <circle cx="324" cy="270" r="13" />
        <circle cx="372" cy="226" r="9" />
        <circle cx="386" cy="286" r="11" />
      </g>

      {/* Streets: a casing line under a white road, like a real map. */}
      <g fill="none" strokeLinecap="round">
        <g stroke="#d7deea">
          <path d="M0 330H640M430 0V560" strokeWidth="24" />
          <path
            d="M0 180H640M0 480H640M250 0V560M560 0V560M110 0V560"
            strokeWidth="16"
          />
          <path
            d="M0 90H640M340 330V560M180 330V480M500 180V330"
            strokeWidth="10"
          />
        </g>
        <g stroke="#ffffff">
          <path d="M0 330H640M430 0V560" strokeWidth="22" />
          <path
            d="M0 180H640M0 480H640M250 0V560M560 0V560M110 0V560"
            strokeWidth="14"
          />
          <path
            d="M0 90H640M340 330V560M180 330V480M500 180V330"
            strokeWidth="8"
          />
        </g>
      </g>

      <g className="lv2-map-names" fontSize="11" fill="#9aa6ba">
        <text x="620" y="334" textAnchor="start">
          ויצמן
        </text>
        <text x="84" y="484" textAnchor="start">
          התע״ש
        </text>
        <text transform="translate(434 150) rotate(-90)" textAnchor="middle">
          ירושלים
        </text>
      </g>
    </g>
  );
}

export function RouteHero() {
  return (
    <div className="lv2-map" data-scene="route" aria-hidden>
      <div className="lv2-map-canvas">
        <svg viewBox={`0 0 ${W} ${H}`} className="lv2-map-svg">
          <defs>
            <linearGradient id="lv2-route-grad" x1="1" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#2853c7" />
              <stop offset="1" stopColor="#4a78ee" />
            </linearGradient>
            <filter
              id="lv2-route-glow"
              x="-10%"
              y="-10%"
              width="120%"
              height="120%"
            >
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="3"
                floodColor="#2853c7"
                floodOpacity="0.35"
              />
            </filter>
            <filter
              id="lv2-puck-shadow"
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="2.5"
                floodColor="#111a2e"
                floodOpacity="0.28"
              />
            </filter>
          </defs>
          <Streets />

          {/* The plan: dotted where it is still ahead, blue where we have been. */}
          <path d={ROUTE_D} className="lv2-route-plan" />
          <g filter="url(#lv2-route-glow)">
            <path d={ROUTE_D} pathLength={1} className="lv2-route-casing" />
            <path
              d={ROUTE_D}
              pathLength={1}
              className="lv2-route-draw"
              data-route-path
            />
          </g>

          {ROUTE_STOPS.map((stop, i) => (
            <circle
              key={stop.month}
              cx={stop.x}
              cy={stop.y}
              r="7"
              className="lv2-stop-dot"
              data-stop={i}
              data-at={stop.at}
            />
          ))}

          {/* The puck: ScenePlayer moves and turns it along the route. */}
          <g
            className="lv2-puck"
            data-route-puck
            transform="translate(560 480) rotate(180)"
            filter="url(#lv2-puck-shadow)"
          >
            <circle r="15" fill="#ffffff" />
            <circle r="11" fill="#2853c7" />
            <path d="M-4.5 -5.5L6 0L-4.5 5.5L-2 0Z" fill="#ffffff" />
          </g>
        </svg>

        {/* The business, where the route starts. */}
        <div className="lv2-map-start" style={at(560, 480)}>
          <span className="lv2-map-badge">
            <BrandMark className="h-5 w-5 text-[#1b2a4a]" />
          </span>
          <span className="lv2-map-label">
            <strong>היום</strong> {GOAL.today} הזמנות
          </span>
        </div>

        {ROUTE_STOPS.map((stop, i) => (
          <div
            key={stop.month}
            className="lv2-map-stop"
            data-side={stop.side}
            data-stop={i}
            data-at={stop.at}
            style={at(stop.x, stop.y)}
          >
            <span className="lv2-map-label">
              <strong>{stop.month}</strong> {stop.text}
            </span>
          </div>
        ))}

        {/* The destination: the goal. */}
        <div className="lv2-map-goal" data-at="0.985" style={at(110, 100)}>
          <span className="lv2-map-flag">
            <svg viewBox="0 0 24 24" className="h-4 w-4">
              <path
                d="M6 21V4M6 4h10.5l-2 3.5 2 3.5H6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="lv2-map-label lv2-map-label--goal">
            <strong>היעד</strong> {GOAL.target} הזמנות
          </span>
        </div>
      </div>

      {/* Navigation-app panels: arrival and the next step. On the map on wide screens,
          under it on phones so the map stays readable. */}
      <div className="lv2-map-eta">
        <p className="lv2-map-eta-top">
          <span>המסלול של {EXAMPLE.name}</span>
          <span className="lv2-map-tag">דוגמה</span>
        </p>
        <p className="lv2-map-eta-main">
          <strong>{GOAL.target}</strong>
          <span>
            {GOAL.unit}
            <small>מגיעים בדצמבר · היום {GOAL.today}</small>
          </span>
        </p>
        <span className="lv2-map-progress">
          <i />
        </span>
      </div>

      <div className="lv2-map-next">
        <span className="lv2-map-turn" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-5 w-5">
            <path
              d="M16 19V11a3 3 0 00-3-3H7m0 0l3.5-3.5M7 8l3.5 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="lv2-map-next-text">
          <small>הצעד הבא</small>
          <span className="lv2-map-next-steps">
            {NEXT_STEPS.map((text, i) => (
              <span
                key={text}
                data-next={i}
                data-on={i === 0 ? "true" : undefined}
              >
                {text}
              </span>
            ))}
          </span>
        </span>
      </div>
    </div>
  );
}
