"use client";

import { useEffect, useRef } from "react";
import { HowToFind } from "@/components/help/HowToFind";
import type { HelpTopic } from "@/components/help/guides";
import { IconArrowLeft } from "@/lib/icons";
import type { LinkKey } from "@/lib/draft";
import styles from "./start.module.css";
import form from "./form.module.css";
import { UIAction } from "@/components/design/Controls";

/**
 * Building blocks shared by the /start screens.
 *
 * One filled button per screen: `PrimaryButton` is the only filled control in this folder.
 * Everything selectable (chips, tiles, directions) takes a soft blue fill when selected.
 * The look lives in form.module.css, shared with /onboarding and the account screens.
 */

export function PrimaryButton({
  children,
  disabled,
  type = "submit",
  onClick,
  forward = false,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
  /** Moves the conversation on: an arrow that points the RTL way. */
  forward?: boolean;
}) {
  return (
    <UIAction
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${styles.primary} !min-h-[50px] w-full !px-7 !text-base sm:w-auto sm:min-w-[240px]`}
    >
      {children}
      {forward ? <IconArrowLeft className="h-4 w-4 shrink-0" /> : null}
    </UIAction>
  );
}

export function QuietLink({
  children,
  onClick,
  className = "",
  tone = "quiet",
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  /** "action": a text action in blue (DESIGN-STANDARD §4). "quiet": a way past, in grey. */
  tone?: "quiet" | "action";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 cursor-pointer items-center px-1 text-sm transition-colors ${
        tone === "action"
          ? "font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-[5px]"
          : "text-[color:var(--ink-soft)] underline decoration-[var(--rule-dark)] underline-offset-[5px] hover:text-[color:var(--ink)] hover:decoration-current"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** The consultant saying back what they heard. Proves we listened; one line. */
export function Reflection({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className={`${styles.reflection} ${styles.rise}`} aria-live="polite">
      <span aria-hidden className={styles.sunDot} />
      <span>
        <BidiText text={text} />
      </span>
    </p>
  );
}

/** The reassurance on the judgement screens. One wording everywhere. */
export const CHANGE_LATER = "אפשר לשנות הכול אחר כך.";

/**
 * One screen of the conversation: reflection, question, why we ask, the input, one
 * primary button and (when the question is optional) a quiet way past it.
 * Enter submits, and the question takes focus when the screen changes.
 */
export function StepShell({
  title,
  why,
  reflection,
  notice,
  children,
  primary,
  nextLabel,
  primaryDisabled,
  onPrimary,
  skip,
  onSkip,
  focus,
  direction,
  stickyAction = false,
  stickyDesktop = false,
  reassure,
  actionNote,
}: {
  title: string;
  why: string;
  /**
   * One quiet line under the actions on screens that ask for judgement: the answer is
   * not final. Only where it is true — each of these answers is editable in /decisions.
   */
  reassure?: string;
  reflection?: string | null;
  notice?: React.ReactNode;
  children: React.ReactNode;
  primary: string;
  /** Destination supplied by the actual route, including skipped questions. */
  nextLabel?: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  skip?: string;
  onSkip?: () => void;
  focus: boolean;
  direction: "fwd" | "back";
  stickyAction?: boolean;
  /** Keep the action sticky on desktop too (the long plan page). */
  stickyDesktop?: boolean;
  /** A short live line right above the primary button (e.g. "מה השתנה"). */
  actionNote?: React.ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!focus) return;
    heading.current?.focus({ preventScroll: true });
  }, [focus]);

  const label = nextLabel && primary.startsWith("להמשיך") ? nextLabel : primary;
  const forward = !primaryDisabled && (label === nextLabel || /^(לעבור|להמשיך)/.test(label));

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!primaryDisabled) onPrimary();
      }}
      className={`${styles.step} ${direction === "fwd" ? styles.stepFwd : styles.stepBack}`}
    >
      <Reflection text={reflection ?? null} />
      {notice}
      <div className={styles.question}>
        <h1 ref={heading} tabIndex={-1} className={styles.title}>
          {title}
        </h1>
        <p className={styles.why}>{why}</p>
      </div>
      <div className={styles.answer}>{children}</div>
      <div
        className={`${styles.actions} ${stickyAction ? styles.sticky : ""} ${stickyAction && stickyDesktop ? styles.stickyDesktop : ""}`}
      >
        {actionNote}
        <div className={styles.actionRow}>
          <PrimaryButton disabled={primaryDisabled} forward={forward}>
            {label}
          </PrimaryButton>
          {skip && onSkip ? <QuietLink onClick={onSkip}>{skip}</QuietLink> : null}
        </div>
        {reassure ? <p className={styles.reassure}>{reassure}</p> : null}
      </div>
    </form>
  );
}

export function Chip({
  label,
  selected,
  onClick,
  hint,
  disabled,
  className = "",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      className={`${form.chip} ${className}`}
    >
      {selected ? <CheckMark /> : null}
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </button>
  );
}

export function CheckMark({ className = "h-3.5 w-3.5 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  dir,
  inputMode,
  autoComplete,
  note,
  maxLength = 200,
  prefix,
  helpTopic,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  dir?: "ltr" | "rtl";
  inputMode?: "url" | "text" | "email";
  autoComplete?: string;
  note?: React.ReactNode;
  maxLength?: number;
  prefix?: string;
  /** Adds an "איך מוצאים את זה?" link that opens the matching guide. */
  helpTopic?: HelpTopic;
}) {
  return (
    <div data-help-topic={helpTopic}>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className={form.label}>
          {label}
        </label>
        {helpTopic ? (
          <span className="-my-2.5">
            <HowToFind topic={helpTopic} />
          </span>
        ) : null}
      </div>
      <div className={form.inputBox}>
        {prefix ? (
          <span dir="ltr" className="ps-3.5 text-base text-[color:var(--ink-muted)]">
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          dir={dir}
          inputMode={inputMode}
          autoComplete={autoComplete}
          autoCapitalize={dir === "ltr" ? "none" : undefined}
          spellCheck={dir === "ltr" ? false : undefined}
          maxLength={maxLength}
          className={dir === "ltr" ? "text-left placeholder:text-left" : ""}
        />
      </div>
      {note ? <div className={form.note}>{note}</div> : null}
    </div>
  );
}

/** Small network marks for the card and the links step. Generic glyphs, not logos. */
export function NetworkIcon({ network, className = "h-4 w-4" }: { network: LinkKey; className?: string }) {
  const common = { viewBox: "0 0 24 24", className, fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true } as const;
  if (network === "website") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.4 5.8 12 3z" />
      </svg>
    );
  }
  if (network === "instagram") {
    return (
      <svg {...common}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (network === "facebook") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M13.2 20.5v-7h2.4l.4-2.8h-2.8V9c0-.8.3-1.4 1.4-1.4H16V5.2c-.3 0-1.2-.1-2.2-.1-2.2 0-3.5 1.3-3.5 3.7v1.9H8v2.8h2.3v7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M14 3.5v11.2a3.8 3.8 0 1 1-3.8-3.8" />
      <path d="M14 3.5c.4 2.6 2.2 4.4 5 4.6" />
    </svg>
  );
}

export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-[color:var(--ink-muted)] transition-colors hover:bg-[var(--soft)] hover:text-[color:var(--ink)]"
    >
      {children}
    </button>
  );
}

/** "ל" joins a Hebrew name directly (למשפחות) and takes a maqaf before a Latin one (ל־Tom's). */
export function withLamed(name: string): string {
  return /^[֐-׿]/.test(name) ? `ל${name}` : `ל־${name}`;
}

/**
 * "3–4" with an en dash reads "4–3" in a Hebrew line (the dash is bidi-neutral, so the
 * digits split into two runs). A hyphen keeps the range one left-to-right number run.
 */
export function rangeSafe(text: string): string {
  return text.replace(/(\d)\s?[–—]\s?(\d)/g, "$1-$2");
}

/**
 * A sentence with numbers in it, safe in a Hebrew line: every number run ("+9", "444-1,666",
 * "+23%-63%", "1.2-4.5") is its own left-to-right island that never breaks across lines.
 * Without it, "(+23%-63%)" reads "(63%-23%+)" and a range splits at its hyphen.
 */
const NUMBER_RUN = /(?<![\d.,])\+?\d[\d,.]*%?(?:-\+?\d[\d,.]*%?)*/g;

export function BidiText({ text }: { text: string }) {
  const clean = rangeSafe(text ?? "");
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of clean.matchAll(NUMBER_RUN)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(clean.slice(last, at));
    parts.push(
      <bdi key={at} dir="ltr" className="whitespace-nowrap">
        {match[0]}
      </bdi>,
    );
    last = at + match[0].length;
  }
  if (last < clean.length) parts.push(clean.slice(last));
  return <>{parts}</>;
}

/** Dark text on a light colour, white on a dark one. */
export function inkOn(hex: string): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "var(--ink)";
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? "var(--ink)" : "#ffffff";
}
