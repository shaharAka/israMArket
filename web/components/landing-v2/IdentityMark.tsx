import styles from "./identity-type.module.css";
import { IDENTITY_GLYPHS as GLYPHS, IDENTITY_FIRST as FIRST, IDENTITY_SECOND as SECOND } from "@/lib/identity";

export type IdentityDirection = "grotesk" | "open" | "joined" | "blue";

/* Original lettering studies. These filled outlines keep the same drawing at every
   size; the two-line form rearranges the complete name, never abbreviates it. */

const JOINED = {
  r: "M0 25H13V32C17 26 24 23 34 23H40V35H33C20 35 13 41 13 52V80H0Z",
  a: "M3 34C8 27 16 23 27 23C44 23 53 31 53 46V80H40V73C36 79 29 82 20 82C7 82 0 75 0 65C0 52 11 46 31 46H40V44C40 37 36 34 28 34C21 34 17 36 12 41ZM40 56H31C18 56 13 59 13 65C13 69 16 72 22 72C32 72 40 65 40 59Z",
  m: "M0 25H13V31C17 26 23 23 30 23C39 23 44 27 47 33C52 26 58 23 67 23C80 23 87 31 87 45V80H74V47C74 39 70 35 63 35C55 35 51 40 51 49V80H38V47C38 39 34 35 27 35C19 35 13 40 13 49V80H0Z",
  t: "M8 9H21V25H40V37H21V62C21 68 24 70 30 70H40V82H28C14 82 8 76 8 64V37H0V25H8Z",
} as const;

type Letter = keyof typeof GLYPHS;

function Lettering({ joined, compact }: { joined: boolean; compact: boolean }) {
  const draw = (letters: readonly [Letter, number][]) => letters.map(([letter, x]) => {
    const path = joined && letter in JOINED ? JOINED[letter as keyof typeof JOINED] : GLYPHS[letter];
    return <path key={`${letter}-${x}`} d={path} transform={`translate(${x} 0)`} fillRule="evenodd" />;
  });
  return <svg viewBox={compact ? "0 0 343 176" : "0 0 508 86"} focusable="false" className={styles.lettering}>
    <g fill="currentColor">
      <g>{draw(FIRST)}</g>
      <g transform={compact ? "translate(0 94)" : "translate(165 0)"}>{draw(SECOND)}</g>
      {joined && <path d="M96 25H113V35H96Z" />}
    </g>
    <path className={styles.accent} d="M0 5H13V18H0Z" />
  </svg>;
}

/** Direction 02 is the selected custom lettering; alternatives remain in the workshop. */
export function IdentityMark({ direction = "open", compact = false, className = "" }: { direction?: IdentityDirection; compact?: boolean; className?: string }) {
  return <span dir="ltr" aria-hidden="true" className={`${styles.word} ${className}`} data-type={direction} data-compact={compact}>
    {direction === "grotesk" ? <><span>isra</span><span>market</span></> : <Lettering joined={direction === "joined"} compact={compact} />}
  </span>;
}
