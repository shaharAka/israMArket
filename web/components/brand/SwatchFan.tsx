/** Three schematic paint cards, coloured by the business. */
export function SwatchFan({ colors, className = "" }: { colors: string[]; className?: string }) {
  return <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" className={className}>
    {[-36, 0, 36].map((angle, i) => <g key={angle} transform={`rotate(${angle} 14 23)`}>
      <path d="M10 3h8v22h-8Z" fill={colors[i % colors.length] || "var(--rule-dark)"} stroke="var(--paper,#fff)" strokeWidth="1.2" />
    </g>)}
    <circle cx="14" cy="23" r="1.2" fill="var(--paper,#fff)" />
  </svg>;
}
