import type { InspirationSource } from "@/lib/api";
import { sourceLabel, sourceWho } from "./sources";

/**
 * A cited Instagram post as a small link to the post itself, so "we learned this from
 * your reel" can be checked in one tap. Plain text when Meta gave no permalink.
 */
export function SourceLink({
  source,
  withMetric = true,
  short = false,
  className = "",
}: {
  source: InspirationSource;
  withMetric?: boolean;
  short?: boolean;
  className?: string;
}) {
  const text = withMetric ? sourceLabel(source) : sourceWho(source, short);
  if (!source.permalink) return <span className={className}>{text}</span>;
  return (
    <a
      href={source.permalink}
      target="_blank"
      rel="noopener noreferrer"
      title={source.hook ? `“${source.hook}”: לפתוח באינסטגרם` : "לפתוח באינסטגרם"}
      className={`underline decoration-[var(--rule-dark)] underline-offset-2 hover:text-[var(--ink)] hover:decoration-current ${className}`}
    >
      {text}
    </a>
  );
}

/** A camera outline: "Instagram" without borrowing the brand's logo. */
export function IconCamera({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4h16v16H4z" />
      <path d="M15.5 12a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" />
      <path d="M16.8 7.2h.01" />
    </svg>
  );
}
