import styles from "./editor.module.css";
/** Intentionally empty: never a stock photo that could be mistaken for the business. */
export function PhotoPlaceholder({ small = false }: { small?: boolean }) {
  return <svg viewBox="0 0 140 108" fill="none" aria-hidden="true" className={small ? styles.placeholderSmall : styles.placeholderDrawing}>
    <path d="m21 25 91-8 7 67-91 8Z" fill="var(--im-paper,var(--paper))" stroke="var(--im-rule,var(--rule))" strokeWidth="1.5" />
    <path d="M26 20h88v68H26Z" fill="var(--im-paper,var(--paper))" stroke="var(--im-muted,var(--ink-muted))" strokeOpacity=".45" strokeWidth="1.5" />
    <circle cx="91" cy="39" r="9" fill="var(--im-sun,var(--sun))" opacity=".5" />
    <path d="m27 76 24-24 24 24 13-13 25 20" stroke="var(--im-primary,var(--primary))" opacity=".35" strokeWidth="1.5" />
    <path d="M34 100h72" stroke="var(--im-rule,var(--rule))" />
  </svg>;
}
