/** Original vector studies. They stay in the identity workshop until a direction is chosen. */
export type IdentityDirection = "signature" | "sun" | "fold";

export function IdentityMark({ direction, className }: { direction: IdentityDirection; className?: string }) {
  return <svg className={className} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
    {direction === "signature" ? <>
      <circle cx="12" cy="12" r="5" />
      <path d="M7 23h10v29H7V23Zm16 29V24h9v4c2-3 4-5 8-5 4 0 7 2 9 5 2-3 5-5 8-5 4 0 6 2 6 8v21h-9V35c0-3-1-4-3-4s-4 2-4 5v16h-9V35c0-3-1-4-3-4s-4 2-4 5v16h-8Z" />
    </> : direction === "sun" ? <>
      <path d="M23 20a9 9 0 0 1 18 0H23Z" />
      <path d="M7 54V41c0-9 7-15 15-15 4 0 7 1 10 4 3-3 6-4 10-4 8 0 15 6 15 15v13H47V41c0-3-2-5-5-5s-5 2-5 5v13H27V41c0-3-2-5-5-5s-5 2-5 5v13H7Z" />
    </> : <>
      <path d="M6 52V12l16 12 10-12 10 12 16-12v40H46V34L32 48 18 34v18H6Z" />
      <path d="m22 24 10-12 10 12-10 12-10-12Z" opacity=".2" />
    </>}
  </svg>;
}
