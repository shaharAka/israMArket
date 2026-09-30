import type { ReactNode } from "react";

type Tone = "info" | "success" | "attention" | "error";

const SURFACE: Record<Tone, string> = {
  info: "bg-[var(--primary-soft)]",
  success: "bg-[var(--good-soft)]",
  attention: "bg-[var(--sand)]",
  error: "bg-[var(--danger-soft)]",
};

const DOT: Record<Tone, string> = {
  info: "bg-[var(--primary)]",
  success: "bg-[var(--good)]",
  attention: "bg-[var(--sun)]",
  error: "bg-[var(--danger)]",
};

const TITLE: Record<Tone, string> = {
  info: "text-[color:var(--ink)]",
  success: "text-[color:var(--good)]",
  attention: "text-[color:var(--ink)]",
  error: "text-[color:var(--danger)]",
};

/**
 * A notice on the account and billing pages: a soft fill and a small dot instead of the
 * coloured side stripe (DESIGN-STANDARD.md §3). Same roles as `InlineNotice`: an error is an
 * alert, everything else a status.
 */
export function SetupNotice({ tone = "info", title, children }: { tone?: Tone; title: string; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-xl px-4 py-3.5 ${SURFACE[tone]}`}>
      <span aria-hidden className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`} />
      <div className="min-w-0">
        <strong className={`block text-[14px] font-semibold leading-6 ${TITLE[tone]}`}>{title}</strong>
        {children ? <p className="mt-0.5 text-[13px] leading-6 text-[color:var(--ink-soft)]">{children}</p> : null}
      </div>
    </div>
  );
}
