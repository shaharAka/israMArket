"use client";

import type { CSSProperties, ReactNode } from "react";
import { Copy } from "@/components/language/LanguageProvider";
import styles from "./editor.module.css";

/** The real editor layout. API calls and editing state belong to PostEditor. */
export function PostWorkspace({ header, preview, panel }: { header: ReactNode; preview: ReactNode; panel: ReactNode }) {
  return <div className={styles.workspace}>
    <header className={styles.workspaceHeader}>{header}</header>
    <div className={styles.workspaceBody}>
      <div className={styles.previewColumn}>{preview}</div>
      <div className={styles.panelColumn}>{panel}</div>
    </div>
  </div>;
}

/** Channel placement and caption chrome around the actual exported artwork. */
export function PostPreview({ media, caption, facebook = false, style }: { media: ReactNode; caption: ReactNode; facebook?: boolean; style?: CSSProperties }) {
  return <div className={styles.preview} style={style}>
    <div className={styles.previewSurface}>
      {facebook ? caption : null}
      {media}
      {!facebook ? caption : null}
    </div>
  </div>;
}

/** One reason, the owner's checks, and one next action. No implicit account work. */
export function PostActionPanel({ why, inspiration, notice, needs, results, link, primary, tools }: {
  why?: string; inspiration?: ReactNode; notice?: ReactNode; needs?: ReactNode;
  results?: ReactNode; link?: ReactNode; primary?: ReactNode; tools?: ReactNode;
}) {
  return <div className={styles.actionPanel}>
    {why ? <div className={styles.reason}>
      <p className={styles.reasonLabel}><Copy text="למה הפוסט הזה" /></p>
      <p className={styles.reasonText}>{why}</p>
    </div> : null}
    {inspiration}{notice}{needs}{results}{link}
    {primary ? <div className={why || needs || results ? styles.primary : undefined}>{primary}</div> : null}
    <div className={primary ? undefined : "mt-4"}>{tools}</div>
  </div>;
}
