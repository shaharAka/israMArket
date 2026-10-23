"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { designPalettes } from "./foundations";
import { useDesignPalette } from "./palette";
import styles from "./palette.module.css";

export function PalettePicker({ compact = false }: { compact?: boolean }) {
  const t=useCopy();
  const { palette, choose } = useDesignPalette();
  return <section className={styles.picker} data-compact={compact} aria-label={t("צבעי הממשק")}><div className={styles.heading}><span><Copy text="צבעי הממשק"/></span><small><Copy text="Signal / Punch הוא הכיוון שנבחר; השאר נשמרו להשוואה."/></small></div><div className={styles.options}>{designPalettes.map((item) => <button type="button" key={item.id} aria-pressed={palette.id === item.id} onClick={() => choose(item.id)}><span className={styles.colorSamples} aria-hidden="true"><i style={{ background:item.primary }} /><i style={{ background:item.sun }} /><i style={{ background:item.ink }} /></span><span><strong><Copy text={item.name}/></strong><small><Copy text={item.description}/></small></span><span className={styles.selected} aria-hidden="true">{palette.id === item.id ? "✓" : ""}</span></button>)}</div></section>;
}
