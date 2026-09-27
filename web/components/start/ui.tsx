"use client";

import { useEffect, useRef } from "react";
import { HowToFind } from "@/components/help/HowToFind";
import type { HelpTopic } from "@/components/help/guides";
import { BrandMark } from "@/lib/icons";
import type { LinkKey } from "@/lib/draft";
import styles from "./start.module.css";

/**
 * Building blocks shared by the /start screens.
 *
 * One dark button per screen: `PrimaryButton` is the only dark fill in this folder.
 * Everything selectable (chips, tiles, directions) is an outline when selected.
 */

export function PrimaryButton({
  children,
  disabled,
  type = "submit",
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="drawn-button inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 bg-[#20211f] px-5 text-base font-bold text-white transition-colors hover:bg-[#343632] disabled:cursor-not-allowed disabled:bg-[#8d8f88]"
    >
      {children}
    </button>
  );
}

export function QuietLink({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 cursor-pointer items-center px-1 text-sm text-[#5e6159] underline underline-offset-4 hover:text-[#191b18] ${className}`}
    >
      {children}
    </button>
  );
}

/** The consultant saying back what they heard. Proves we listened; one line. */
export function Reflection({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className={`flex items-start gap-2.5 ${styles.rise}`} aria-live="polite">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#191b18]">
        <BrandMark className="h-4 w-4 text-white" />
      </span>
      <p className="rounded-2xl rounded-tr-sm bg-[#efece3] px-3.5 py-2 text-sm leading-6 text-[#2b2d28]">{text}</p>
    </div>
  );
}

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
  primaryDisabled,
  onPrimary,
  skip,
  onSkip,
  focus,
  direction,
  stickyAction = false,
}: {
  title: string;
  why: string;
  reflection?: string | null;
  notice?: React.ReactNode;
  children: React.ReactNode;
  primary: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  skip?: string;
  onSkip?: () => void;
  focus: boolean;
  direction: "fwd" | "back";
  stickyAction?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!focus) return;
    heading.current?.focus({ preventScroll: true });
  }, [focus]);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!primaryDisabled) onPrimary();
      }}
      className={`space-y-4 ${direction === "fwd" ? styles.stepFwd : styles.stepBack}`}
    >
      <Reflection text={reflection ?? null} />
      {notice}
      <div>
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-[1.6rem] font-black leading-tight tracking-tight text-[#191b18] outline-none sm:text-3xl"
        >
          {title}
        </h1>
        <p className="mt-1 text-sm leading-6 text-[#5e6159]">{why}</p>
      </div>
      {children}
      <div
        className={
          stickyAction
            ? "sticky bottom-0 z-10 -mx-4 space-y-1 bg-gradient-to-t from-[#f8f7f4] from-70% to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 lg:static lg:mx-0 lg:bg-none lg:p-0"
            : "space-y-1 pt-1"
        }
      >
        <PrimaryButton disabled={primaryDisabled}>{primary}</PrimaryButton>
        {skip && onSkip ? (
          <div className="flex justify-center">
            <QuietLink onClick={onSkip}>{skip}</QuietLink>
          </div>
        ) : null}
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
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-[#191b18] bg-[#f1efe8] text-[#191b18] ring-1 ring-[#191b18]"
          : "border-[#dedcd4] bg-white text-[#2b2d28] hover:border-[#b9b7ad]"
      } ${className}`}
    >
      {selected ? <CheckMark /> : null}
      <span>{label}</span>
      {hint ? <span className="text-xs font-normal text-[#6b6e65]">{hint}</span> : null}
    </button>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
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
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-bold text-[#191b18]">
          {label}
        </label>
        {helpTopic ? <HowToFind topic={helpTopic} /> : null}
      </div>
      <div className="flex min-h-12 items-center rounded-lg border border-[#dedcd4] bg-white focus-within:border-[#191b18] focus-within:ring-1 focus-within:ring-[#191b18]">
        {prefix ? (
          <span dir="ltr" className="pl-3 text-base text-[#8a8c84]">
            {prefix}
          </span>
        ) : null}
        {/* 16px on phones: iOS zooms into any field smaller than that. */}
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
          className={`min-h-12 w-full min-w-0 rounded-lg bg-transparent text-base text-[#191b18] outline-none placeholder:text-[#a3a59c] ${
            prefix ? "pl-3 pr-1" : "px-3.5"
          } ${dir === "ltr" ? "text-left placeholder:text-left" : ""}`}
        />
      </div>
      {note ? <div className="mt-1 text-xs leading-5 text-[#5e6159]">{note}</div> : null}
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
      className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#5e6159] hover:bg-[#f1efe8] hover:text-[#191b18]"
    >
      {children}
    </button>
  );
}

/** "ל" joins a Hebrew name directly (למשפחות) and takes a maqaf before a Latin one (ל־Tom's). */
export function withLamed(name: string): string {
  return /^[֐-׿]/.test(name) ? `ל${name}` : `ל־${name}`;
}

/** Dark text on a light colour, white on a dark one. */
export function inkOn(hex: string): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "#191b18";
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? "#191b18" : "#ffffff";
}
