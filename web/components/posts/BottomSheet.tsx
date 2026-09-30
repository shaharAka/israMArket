"use client";

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
    <div className="fixed inset-0 z-[60]" dir="rtl" style={style}>
      <button
        type="button"
        aria-label="לסגור"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/35"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}

        className="im-editor-sheet absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-lg border-t-[3px] border-t-[var(--primary)] bg-white shadow-2xl outline-none"
      >
        <style>{"@keyframes im-sheet-up{from{transform:translateY(20px);opacity:.5}to{transform:none;opacity:1}}.im-editor-sheet{animation:im-sheet-up .22s cubic-bezier(.2,.7,.2,1)}@media(prefers-reduced-motion:reduce){.im-editor-sheet{animation:none}}"}</style>
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--primary-soft)] px-4 pb-2 pt-3">
          <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-[var(--rule-dark)]" />
          <h2 className="text-base font-black text-[color:var(--ink)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-2 text-sm font-bold text-[color:var(--ink-soft)] underline underline-offset-4"
          >
            לסגור
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
