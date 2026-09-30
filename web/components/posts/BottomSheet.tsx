"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
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
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]" dir="rtl">
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
        style={{ animation: "im-sheet-up 0.22s cubic-bezier(0.2, 0.7, 0.2, 1)" }}
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl bg-white shadow-2xl outline-none"
      >
        <style>{"@keyframes im-sheet-up{from{transform:translateY(32px);opacity:.5}to{transform:none;opacity:1}}"}</style>
        <div className="flex shrink-0 items-center justify-between border-b border-[#eeede8] px-4 pb-2 pt-3">
          <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-[#dedcd4]" />
          <h2 className="text-base font-black text-[#20211f]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-2 text-sm font-bold text-[#62635f] underline underline-offset-4"
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
