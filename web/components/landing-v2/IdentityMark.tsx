import styles from "./identity-type.module.css";

export type IdentityDirection = "grotesk" | "open" | "joined" | "blue";

/* Original lettering studies. These filled outlines keep the same drawing at every
   size; the two-line form rearranges the complete name, never abbreviates it. */
const GLYPHS = {
  i: "M0 25H13V80H0Z M0 5H13V18H0Z",
  s: "M43 32L35 41C31 37 26 35 21 35C15 35 12 37 12 40C12 43 15 44 23 46C37 49 44 53 44 64C44 75 35 82 21 82C11 82 3 79-2 72L6 63C10 68 15 71 22 71C28 71 31 69 31 65C31 62 28 61 19 59C6 56 0 51 0 41C0 30 9 23 22 23C31 23 38 26 43 32Z",
  r: "M0 25H13V34C17 27 23 23 32 24V37C20 35 13 41 13 52V80H0Z",
  a: "M24 23C32 23 38 26 42 32V25H55V80H42V73C38 79 32 82 24 82C9 82 0 70 0 52C0 35 9 23 24 23ZM27 35C18 35 13 41 13 52C13 63 18 70 27 70C36 70 42 63 42 52C42 41 36 35 27 35Z",
  m: "M0 25H13V32C17 26 22 23 29 23C37 23 43 27 46 34C50 27 57 23 65 23C77 23 84 31 84 45V80H71V47C71 39 68 35 62 35C54 35 50 41 50 49V80H37V47C37 39 34 35 28 35C19 35 13 41 13 51V80H0Z",
  k: "M0 3H13V48L33 25H49L27 50L51 80H35L13 52V80H0Z",
  e: "M50 55H13C14 65 19 71 28 71C35 71 40 68 44 64L50 73C44 79 37 82 27 82C10 82 0 70 0 53C0 35 10 23 26 23C42 23 51 34 51 51ZM13 45H38C37 37 33 33 26 33C19 33 15 37 13 45Z",
  t: "M8 9H21V25H37V37H21V61C21 67 23 70 29 70C32 70 34 69 37 68V79C33 81 29 82 25 82C13 82 8 76 8 64V37H0V25H8Z",
} as const;

const JOINED = {
  r: "M0 25H13V32C17 26 24 23 34 23H40V35H33C20 35 13 41 13 52V80H0Z",
  a: "M3 34C8 27 16 23 27 23C44 23 53 31 53 46V80H40V73C36 79 29 82 20 82C7 82 0 75 0 65C0 52 11 46 31 46H40V44C40 37 36 34 28 34C21 34 17 36 12 41ZM40 56H31C18 56 13 59 13 65C13 69 16 72 22 72C32 72 40 65 40 59Z",
  m: "M0 25H13V31C17 26 23 23 30 23C39 23 44 27 47 33C52 26 58 23 67 23C80 23 87 31 87 45V80H74V47C74 39 70 35 63 35C55 35 51 40 51 49V80H38V47C38 39 34 35 27 35C19 35 13 40 13 49V80H0Z",
  t: "M8 9H21V25H40V37H21V62C21 68 24 70 30 70H40V82H28C14 82 8 76 8 64V37H0V25H8Z",
} as const;

type Letter = keyof typeof GLYPHS;
const FIRST: readonly [Letter, number][] = [["i", 0], ["s", 19], ["r", 69], ["a", 101]];
const SECOND: readonly [Letter, number][] = [["m", 0], ["a", 91], ["r", 154], ["k", 193], ["e", 247], ["t", 301]];

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
