"use client";

import { useCopy } from "@/components/language/LanguageProvider";

import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True at the `md` breakpoint and up — the same 768px line the app shell switches its
 * navigation on. The server has no viewport, so it renders the phone layout; the browser
 * corrects it right after hydration.
 */
export function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/**
 * A phone bottom sheet.
 *
 * Portalled to `document.body` for a concrete reason: the app's `<main>` runs the `rise`
 * animation with `fill-mode: both`, which leaves a transform on it, and a transformed
 * ancestor turns `position: fixed` into "fixed to that ancestor" — the sheet would scroll
 * away with the page. Outside `<main>` it is also, correctly, not counted in the page's word
 * budget: it is detail on demand (UI-RULES rule 2 and 7).
 */
export function BottomSheet({
  open,
  title,
  onClose,
  children,
  style,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  const t = useCopy();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previousFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]):not([hidden]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]') ?? []).filter(node => node.getClientRects().length > 0);
        const first = nodes[0], last = nodes.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]" style={style}>
      <button
        type="button"
        aria-label={t("לסגור")}
        onClick={onClose}
        className="im-editor-backdrop absolute inset-0 h-full w-full cursor-default bg-[var(--ink)]/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}

        className="im-editor-sheet absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[20px] bg-[var(--paper)] text-[color:var(--ink)] shadow-[var(--shadow-pop)] outline-none"
      >
        <style>{"@keyframes im-sheet-up{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}@keyframes im-sheet-fade{from{opacity:0}to{opacity:1}}.im-editor-sheet{animation:im-sheet-up .24s cubic-bezier(.2,.7,.2,1)}.im-editor-backdrop{animation:im-sheet-fade .2s ease-out}@media(prefers-reduced-motion:reduce){.im-editor-sheet,.im-editor-backdrop{animation:none}}"}</style>
        <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule)] pe-2 ps-5 pb-2 pt-4">
          <span aria-hidden className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-[var(--rule-dark)]" />
          <h2 className="text-[17px] font-bold tracking-tight text-[color:var(--ink)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("לסגור")}
            title={t("לסגור")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--ink-muted)] transition-colors hover:bg-[var(--soft)] hover:text-[color:var(--ink)]"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-5">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
