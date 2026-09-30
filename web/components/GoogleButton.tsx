"use client";

import { continueWithGoogle, googleStartUrl } from "@/lib/googleAuth";

/**
 * "להמשיך עם Google", drawn to Google's sign-in branding rules rather than our own button
 * tones: the unmodified four-colour "G" on white, a #747775 hairline, #1F1F1F medium-weight
 * text, and the word "Google" in Latin letters as Google requires. The label stays in the
 * app's Hebrew font: Roboto has no Hebrew, and a label in two fonts reads worse. The mark
 * sits at the start of the line (the right, in RTL), as Google's own Hebrew button does.
 * Sized to the email button next to it, which the rules allow.
 * https://developers.google.com/identity/branding-guidelines
 *
 * A real link, so it also works before hydration; the click handler only clears the demo
 * flag on the way out.
 */
export function GoogleButton({
  next,
  back,
  disabled = false,
  label = "להמשיך עם Google",
  className = "",
}: {
  /** Where the owner lands signed in. A path on this site. */
  next: string;
  /** The page that shows an error if Google says no. A path on this site. */
  back: string;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={googleStartUrl(next, back)}
      onClick={(event) => {
        event.preventDefault();
        if (disabled) return;
        continueWithGoogle(next, back);
      }}
      aria-disabled={disabled || undefined}
      className={`flex min-h-12 w-full items-center justify-center gap-2.5 rounded-md border border-[#747775] bg-white px-3 text-sm font-medium text-[#1f1f1f] no-underline transition-colors hover:bg-[#f2f2f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f1f1f] active:bg-[#e8e8e8] ${
        disabled ? "pointer-events-none opacity-40" : ""
      } ${className}`}
    >
      <GoogleMark />
      <span>{label}</span>
    </a>
  );
}

/** Google's "G", as published in the branding kit. Decorative: the text names the action. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48" className="h-5 w-5 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** The quiet "או" line between the Google button and the email form. */
export function OrDivider({ label = "או עם אימייל" }: { label?: string }) {
  return (
    <div className="relative flex items-center py-1" role="separator" aria-label={label}>
      <div className="flex-grow border-t border-[var(--rule)]" />
      <span aria-hidden="true" className="mx-4 flex-shrink text-xs text-[var(--ink-muted)]">
        {label}
      </span>
      <div className="flex-grow border-t border-[var(--rule)]" />
    </div>
  );
}
