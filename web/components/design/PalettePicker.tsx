"use client";

import { designPalettes } from "./foundations";
import { useDesignPalette } from "./palette";
import styles from "./palette.module.css";

export function PalettePicker({ compact = false }: { compact?: boolean }) {
  const { palette, choose } = useDesignPalette();
  return <section className={styles.picker} data-compact={compact} aria-label="כיווני צבע לספרייה"><div className={styles.heading}><span>שלושה כיוונים לשמש ולבית</span><small>לבחור צבע ולראות אותו בכל המסך</small></div><div className={styles.options}>{designPalettes.map((item) => <button type="button" key={item.id} aria-pressed={palette.id === item.id} onClick={() => choose(item.id)}><svg viewBox="0 0 74 48" aria-hidden="true"><rect width="74" height="48" rx="3" fill={item.soft} /><circle cx="37" cy="17" r="10" fill={item.sun} /><path d="m17 30 6-12h28l6 12H17m5 0v12h30V30" fill={item.paper} stroke={item.primary} strokeWidth="2" strokeLinejoin="round" /></svg><span><strong>{item.name}</strong><small>{item.description}</small></span><span className={styles.selected} aria-hidden="true">{palette.id === item.id ? "✓" : ""}</span></button>)}</div></section>;
}
