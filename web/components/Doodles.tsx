import { BRAND_MARK_PATHS } from "@/lib/icons";

/** One loose hand-drawn stroke under a heading. */
export function Scribble({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`draw block h-2 w-24 text-[#2d3f32] ${className}`}
      viewBox="0 0 96 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path pathLength="1" d="M2 5.5C16 2.5 30 6.5 46 4.2S78 1.8 94 5" />
    </svg>
  );
}

/** Brand mark that draws itself in a loop. Use for loading states. */
export function LoadingMark({ label = "טוענים…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-[#747570]" role="status" aria-live="polite">
      <svg
        className="draw-loop h-10 w-10 text-[#20211f]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {BRAND_MARK_PATHS.map((d) => (
          <path key={d} pathLength="1" d={d} />
        ))}
      </svg>
      <p className="text-sm">{label}</p>
    </div>
  );
}

/**
 * Plan header doodle: a stall, a dotted route, a flag at the end.
 * Read right-to-left like the page: start at the stall, end at the flag.
 */
export function PlanDoodle({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`draw text-[#20211f] ${className}`}
      viewBox="0 0 168 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* stall (right side) */}
      <path pathLength="1" d="M134 22a5 5 0 0110 0M139 10.5v2M133 13l1.4 1.4M145 13l-1.4 1.4" />
      <path
        pathLength="1"
        d="M124 28l3.6-6h22.8l3.6 6M124 28c0 3.8 7.5 3.8 7.5 0c0 3.8 7.5 3.8 7.5 0c0 3.8 7.5 3.8 7.5 0c0 3.8 7.5 3.8 7.5 0M129 32.5v11.5M149 32.5v11.5M122 44h34"
      />
      {/* dotted route */}
      <path
        data-static=""
        className="rise"
        style={{ animationDelay: "500ms" }}
        strokeDasharray="2 3.2"
        strokeLinecap="round"
        d="M116 42c-14 8-24-12-40-4s-22 14-38 6"
      />
      {/* flag (left side) */}
      <path pathLength="1" d="M30 46V18M30 20h15l-2.4 4.4L45 29H30" />
      {/* tiny ground marks */}
      <path pathLength="1" d="M22 50h20M60 50h6M12 50h4" strokeWidth="1.2" />
    </svg>
  );
}
