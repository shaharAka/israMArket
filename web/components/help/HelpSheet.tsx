"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
      <style>
        {"@keyframes im-help-up{from{transform:translateY(32px);opacity:.5}to{transform:none;opacity:1}}" +
          "@keyframes im-help-side{from{transform:translateX(-24px);opacity:.5}to{transform:none;opacity:1}}"}
      </style>
      <button
        type="button"
        tabIndex={-1}
        aria-label="לסגור"
        onClick={() => closeRef.current()}
        className="absolute inset-0 h-full w-full cursor-default bg-black/35"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-sheet-title"
        tabIndex={-1}
        style={{
          animation: desktop
            ? "im-help-side 0.22s cubic-bezier(0.2, 0.7, 0.2, 1)"
            : "im-help-up 0.22s cubic-bezier(0.2, 0.7, 0.2, 1)",
        }}
        className={
          desktop
            ? "absolute inset-y-0 left-0 flex w-[440px] max-w-[92vw] flex-col bg-white shadow-2xl outline-none"
            : "absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl bg-white shadow-2xl outline-none"
        }
      >
        <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-[#eeede8] px-4 pb-2 pt-3 sm:px-5">
          {desktop ? null : (
            <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-[#dedcd4]" />
          )}
          <h2 id="help-sheet-title" className="min-w-0 text-base font-black leading-6 text-[#20211f]">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => closeRef.current()}
            className="min-h-11 shrink-0 px-2 text-sm font-bold text-[#62635f] underline underline-offset-4 hover:text-[#20211f]"
          >
            לסגור
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 sm:px-5">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
