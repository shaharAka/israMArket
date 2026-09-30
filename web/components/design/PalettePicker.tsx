"use client";

import { designPalettes } from "./foundations";
import { useDesignPalette } from "./palette";
import styles from "./palette.module.css";

export function PalettePicker({ compact = false }: { compact?: boolean }) {
  const { palette, choose } = useDesignPalette();
  return <section className={styles.picker} data-compact={compact} aria-label="צבעי הממשק"><div className={styles.heading}><span>שלושה כיוונים לשמש ולבית</span><small>לבחור ולראות את הספרייה בצבעים האלה</small></div><div className={styles.options}>{designPalettes.map((item) => <button type="button" key={item.id} aria-pressed={palette.id === item.id} onClick={() => choose(item.id)}><span className={styles.colorSamples} aria-hidden="true"><i style={{ background:item.primary }} /><i style={{ background:item.sun }} /><i style={{ background:item.ink }} /></span><span><strong>{item.name}</strong><small>{item.description}</small></span><span className={styles.selected} aria-hidden="true">{palette.id === item.id ? "✓" : ""}</span></button>)}</div></section>;
}
