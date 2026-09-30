"use client";

import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { BrandMark, IconArrowLeft } from "@/lib/icons";
import { type MotionMood } from "@/components/motion/catalog";
import { MotionButton, MotionCheck, MotionScope } from "@/components/motion/Motion";
import { paletteVariables } from "./palette";
import { designPalettes, type DesignPalette } from "./foundations";
import styles from "./primitives.module.css";

export function DesignScope({ children, className = "", palette = designPalettes[0], mood = "quiet", reduced = false }: { children: ReactNode; className?: string; palette?: DesignPalette; mood?: MotionMood; reduced?: boolean }) {
  return <MotionScope mood={mood} reduced={reduced} className={`${styles.scope} ${className}`} style={paletteVariables(palette)}>{children}</MotionScope>;
}

export function ActionButton({ children, variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" }) {
  return <MotionButton {...props} className={`${styles.action} ${variant === "primary" ? styles.primary : styles.quiet} ${className}`}><span>{children}</span><IconArrowLeft className={styles.actionArrow} /></MotionButton>;
}

export function NotebookHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <header className={styles.heading}><p>{eyebrow}</p><h2>{title}</h2>{children && <div className={styles.headingText}>{children}</div>}</header>;
}

export function PaperNote({ children, label = "מחשבה קטנה" }: { children: ReactNode; label?: string }) {
  return <aside className={styles.note}><span className={styles.noteLabel}>{label}</span><p>{children}</p><span className={styles.fold} aria-hidden="true" /></aside>;
}

export type JourneyStep = { id: string; label: string; state: "done" | "current" | "next" };
export function JourneyRail({ steps, label }: { steps: JourneyStep[]; label: string }) {
  return <ol className={styles.journey} aria-label={label}>{steps.map((step, index) => <li key={step.id} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}><span className={styles.stepMark}>{step.state === "done" ? <MotionCheck /> : String(index + 1).padStart(2, "0")}</span><span className={styles.stepLabel}>{step.label}<small>{step.state === "done" ? "הושלם" : step.state === "current" ? "כאן עכשיו" : "בהמשך"}</small></span></li>)}</ol>;
}

export function StatusLine({ state, children }: { state: "ready" | "waiting" | "attention"; children: ReactNode }) {
  return <div className={styles.status} data-state={state} role="status">{state === "ready" ? <MotionCheck /> : state === "attention" ? <span className={styles.statusSymbol} aria-hidden="true">!</span> : <BrandMark className={styles.statusSymbol} />}<span>{children}</span></div>;
}

export function NotebookField({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <div className={styles.field}><label htmlFor={id}>{label}</label><input id={id} value={value} maxLength={60} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(e) => onChange(e.target.value)} />{hint && <p id={`${id}-hint`}>{hint}</p>}</div>;
}

/** A literal place for the business's first photo, rather than a decorative stock icon. */
export function PhotoMoment({ filled, businessName }: { filled: boolean; businessName: string }) {
  return <div className={styles.photoMoment} data-filled={filled}><svg viewBox="0 0 280 180" fill="none" aria-hidden="true"><path d="M39 39c-5 28-5 69 0 99h200c4-35 2-71-2-98z" fill="var(--im-paper)" stroke="currentColor" strokeWidth="1.6" /><path d="M47 48h182v81H47z" stroke="currentColor" strokeWidth="1" opacity=".25" />{filled ? <g className={styles.photoContent}><path d="M67 89h146M79 89l9-22h104l9 22c-5 11-22 11-27 0-5 11-22 11-27 0-5 11-22 11-27 0-5 11-22 11-27 0M85 100v25m110-25v25M108 107h64" stroke="currentColor" strokeWidth="2" /><path d="M126 67a14 14 0 0 1 28 0" fill="var(--im-sun)" stroke="currentColor" strokeWidth="1.5" /></g> : <g opacity=".55"><path d="M119 88h42m-21-21v42" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="m230 28-3 17 14-1" stroke="currentColor" strokeWidth="1.5" /></g>}<path d="M22 151h32m172 0h32" stroke="currentColor" strokeWidth="1" opacity=".25" /></svg><p>{filled ? businessName : "מקום לרגע אמיתי מהעסק"}</p></div>;
}
