"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./help-sheet.module.css";
import { useIsDesktop } from "@/components/posts/BottomSheet";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The help sheet: a bottom sheet on the phone, a side panel on the computer.
 *
 * Not `posts/BottomSheet`, for two reasons that matter here: help is read on the computer
 * too, where a sheet rising from the bottom of a 1440px screen is a strange place to read
 * steps, and a help panel is exactly the dialog a keyboard user tabs through, so it traps
 * focus and hands it back to the link that opened it. It borrows that sheet's breakpoint
 * (`useIsDesktop`) and its portal, for the same reason: `<main>` carries a transform, and
 * outside `<main>` the sheet is not counted in the page's word budget (UI-RULES rule 7).
 *
 * The panel opens on the left, the end side in RTL, so it never covers the app's own
 * navigation on the right.
 */
export function HelpSheet({
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
  const desktop = useIsDesktop();
  // The parent usually passes an inline arrow. Keeping it in a ref stops every parent
  // render from re-running the effect, which would yank focus back to the panel.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.getClientRects().length > 0,
      );
      if (!nodes.length) {
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]" dir="rtl">
      <button
        type="button"
        tabIndex={-1}
        aria-label="לסגור"
        onClick={() => closeRef.current()}
        className={`${styles.backdrop} absolute inset-0 h-full w-full cursor-default`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-sheet-title"
        tabIndex={-1}
        data-side={desktop}
        className={
          `${styles.panel} ${desktop
            ? "absolute inset-y-0 left-0 flex w-[460px] max-w-[92vw] flex-col bg-[var(--paper)] shadow-[var(--shadow-pop)] outline-none"
            : "absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[20px] bg-[var(--paper)] shadow-[var(--shadow-pop)] outline-none"}`
        }
      >
        <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule)] px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
          {desktop ? null : (
            <span aria-hidden className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-[var(--rule-dark)]" />
          )}
          <h2 id="help-sheet-title" className="min-w-0 text-[17px] font-bold leading-7 tracking-[-0.01em] text-[color:var(--ink)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => closeRef.current()}
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-[14px] font-semibold text-[color:var(--ink-soft)] transition-colors hover:bg-[var(--soft)] hover:text-[color:var(--ink)]"
          >
            לסגור
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-5 sm:px-6">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
