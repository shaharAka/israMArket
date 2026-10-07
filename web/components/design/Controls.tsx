"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { MotionCheck } from "@/components/motion";
import styles from "./controls.module.css";

export function UIAction({ children, variant = "primary", busy = false, busyLabel = "רגע…", className = "", disabled, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "text" | "danger"; busy?: boolean; busyLabel?: string }) {
  return <button {...props} type={type} disabled={disabled || busy} aria-busy={busy || undefined} className={`${styles.button} ${className}`} data-variant={variant}>
    {busy && <span className={styles.busyDots} aria-hidden="true"><i /><i /><i /></span>}{busy ? busyLabel : children}
  </button>;
}

export function TextField({ label, hint, error, className = "", id: suppliedId, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const generated = useId(); const id = suppliedId ?? generated;
  const description = [hint && `${id}-hint`, error && `${id}-error`, props["aria-describedby"]].filter(Boolean).join(" ");
  return <div className={`${styles.field} ${className}`}><label htmlFor={id}>{label}</label><input {...props} id={id} aria-invalid={Boolean(error) || undefined} aria-describedby={description || undefined} />{hint && <p id={`${id}-hint`}>{hint}</p>}{error && <p id={`${id}-error`} className={styles.error} role="alert">{error}</p>}</div>;
}

export function ChoiceCard({ selected, title, description, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean; title: string; description?: string }) {
  return <button {...props} type="button" aria-pressed={selected} className={`${styles.choice} ${className}`}><span><strong>{title}</strong>{description && <small>{description}</small>}</span><span className={styles.choiceCheck} aria-hidden="true">{selected && <MotionCheck />}</span></button>;
}

export type ControlOption = { value: string; label: string; disabled?: boolean };
export function SegmentedControl({ label, value, options, onChange }: { label: string; value: string; options: ControlOption[]; onChange: (value: string) => void }) {
  return <div className={styles.segmented} role="group" aria-label={label}>{options.map(option => <button type="button" key={option.value} disabled={option.disabled} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

/** Tabs keep one keyboard stop; left/right follow the document's visual direction. */
export function UITabs({ label, value, options, onChange, children }: { label: string; value: string; options: ControlOption[]; onChange: (value: string) => void; children: ReactNode }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function move(index: number, key: string, rtl: boolean) {
    const enabled = options.map((o, i) => o.disabled ? -1 : i).filter(i => i >= 0);
    if (!enabled.length) return;
    let next: number;
    if (key === "Home") next = enabled[0];
    else if (key === "End") next = enabled.at(-1)!;
    else { const delta = (key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1); next = enabled[(enabled.indexOf(index) + delta + enabled.length) % enabled.length]; }
    onChange(options[next].value); refs.current[next]?.focus();
  }
  return <div><div className={styles.tabs} role="tablist" aria-label={label}>{options.map((option, i) => <button type="button" key={option.value} ref={el => { refs.current[i] = el; }} role="tab" id={`${id}-${option.value}`} aria-selected={value === option.value} aria-controls={`${id}-panel`} disabled={option.disabled} tabIndex={value === option.value ? 0 : -1} onClick={() => onChange(option.value)} onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); move(i, e.key, getComputedStyle(e.currentTarget).direction === "rtl"); } }}>{option.label}</button>)}</div><div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`} tabIndex={0} className={styles.tabPanel}><TransitionPanel transitionKey={value}>{children}</TransitionPanel></div></div>;
}

export function ToggleField({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return <label className={styles.toggle}><span><strong>{label}</strong>{hint && <small id={`${id}-hint`}>{hint}</small>}</span><input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} /><span className={styles.toggleTrack} aria-hidden="true" /></label>;
}

export function InlineNotice({ tone = "info", title, children }: { tone?: "info" | "success" | "attention" | "error"; title: string; children?: ReactNode }) {
  return <div className={styles.notice} data-tone={tone} role={tone === "error" ? "alert" : "status"}><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
export function StateBadge({ tone = "neutral", children }: { tone?: "neutral" | "ready" | "waiting" | "error"; children: ReactNode }) {
  return <span className={styles.badge} data-tone={tone}>{children}</span>;
}
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className={styles.empty}><svg viewBox="0 0 80 60" fill="none" aria-hidden="true"><circle cx="52" cy="16" r="9" fill="var(--im-sun, var(--sun))" /><path d="M13 14h45l8 34H20zM22 35l10-10 10 8 8-5 10 14" stroke="currentColor" strokeWidth="1.5" /></svg><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}
export function SkeletonBlock({ label = "טוענים את התוכן" }: { label?: string }) {
  return <div className={styles.skeleton} role="status" aria-label={label}><span /><span /><span /><span /></div>;
}
export function TransitionPanel({ children, transitionKey }: { children: ReactNode; transitionKey: string | number }) {
  return <div key={transitionKey} className={styles.panel}>{children}</div>;
}

/** Native modal supplies focus containment, Escape and focus return without a new dependency. */
export function UIDialog({ open, onClose, title, description, children, variant = "modal" }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; variant?: "modal" | "drawer" }) {
  const t = useCopy();
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const el = ref.current; if (!el) return; if (open && !el.open) el.showModal(); else if (!open && el.open) el.close(); }, [open]);
  return <dialog ref={ref} className={styles.dialog} data-variant={variant} aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined} onCancel={e => { e.preventDefault(); onClose(); }} onClose={onClose}>
    <header><h2 id={`${id}-title`}>{title}</h2><UIAction variant="text" onClick={onClose} aria-label={t("לסגור את החלון")}><Copy text="סגירה" /> ×</UIAction></header>
    {description && <p id={`${id}-description`} className={styles.dialogDescription}>{description}</p>}{children}
  </dialog>;
}

export function FileField({ label, onSelect, accept = "image/*", hint }: { label: string; onSelect: (file: File | null) => void; accept?: string; hint?: string }) {
  const id = useId();
  return <div className={styles.fileField}><label htmlFor={id}>{label}</label><input id={id} type="file" accept={accept} onChange={e => onSelect(e.target.files?.[0] ?? null)} aria-describedby={hint ? `${id}-hint` : undefined} />{hint && <p id={`${id}-hint`}>{hint}</p>}</div>;
}
