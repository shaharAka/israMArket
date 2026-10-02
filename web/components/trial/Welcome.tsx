"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Storefront } from "@/components/brand/Storefront";
import styles from "./welcome.module.css";
import { NO_CARD_AT_SIGNUP } from "@/lib/pricing";
import { markWelcomed, useTrial, type TrialPayload } from "@/lib/trial";

/** `?tour=1` reopens the welcome (the "לסייר שוב" link on /account). */
function subscribeLocation(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}
function tourRequested() {
  return new URLSearchParams(window.location.search).get("tour") === "1";
}

type Card = { title: string; body: React.ReactNode };

function cards(trial: TrialPayload): Card[] {
  // What we need from the owner, from the journey itself: the first week's open steps.
  const asks = trial.steps
    .filter((step) => step.week === 1 && step.status !== "done" && step.status !== "soon")
    .slice(0, 3)
    .map((step) => step.title_he);
  return [
    {
      title: "מה יש כאן",
      body: (
        <ul className={styles.overview}>
          <Row primary title="התוכנית" text="האסטרטגיה, הצעדים הקרובים ומה נבדוק כדי להתקדם." />
          <Row title="הפוסטים" text="נכתבים אחרי שתבחרו מה לקדם ותוסיפו חומרי גלם, ומחכים לאישור שלכם." />
          <Row title="התוצאות והמחקר" text="מה הצליח, ומה למדנו השבוע על המתחרים והחיפושים." />
        </ul>
      ),
    },
    {
      title: "מה קורה החודש",
      body: (
        <ol className={styles.month}>
          {/* Each week's name is its own line now, so it carries no colon. */}
          <li><b>מחברים מדידה</b> רק את המקורות שהתוכנית צריכה. הנתונים שכבר נתתם נשמרים.</li>
          <li><b>מכינים תוכן</b> בוחרים מה לקדם, מוסיפים חומר אמיתי ובודקים את הסגנון.</li>
          <li><b>מאשרים ומפרסמים</b> אפשר להתחיל ברגע שהחומרים מוכנים, גם ביום הראשון.</li>
          <li><b>מודדים ומתאימים</b> מה קרה בעקבות הפעולות, ומה כדאי לנסות בהמשך.</li>
          <li>
            {trial.days_total} יום חינם{NO_CARD_AT_SIGNUP ? ", בלי כרטיס אשראי" : ""}.
          </li>
        </ol>
      ),
    },
    {
      title: "מה צריך מכם",
      body: (
        <div className="space-y-4 text-[15px] leading-relaxed text-[color:var(--ink)]">
          <p>כמה דקות ביום, ובעיקר החלטות. את הכתיבה, העיצוב והמחקר אנחנו עושים.</p>
          {asks.length ? (
            <ul className="divide-y divide-[var(--rule)] rounded-[14px] bg-[var(--soft)] px-4">
              {asks.map((ask) => (
                <li key={ask} className="flex min-h-12 items-center gap-3 py-2.5 font-medium">
                  <span aria-hidden className="block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                  {ask}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-sm text-[color:var(--ink-soft)]">בעמוד ״השבוע״ תמיד יחכה לכם הצעד הבא.</p>
        </div>
      ),
    },
  ];
}

function Row({ primary = false, title, text }: { primary?: boolean; title: string; text: string }) {
  return (
    <li data-primary={primary}>
      <span className="block text-[15px] font-semibold text-[color:var(--ink)]">{title}</span>
      <span className="mt-0.5 block text-sm leading-6 text-[color:var(--ink-soft)]">{text}</span>
    </li>
  );
}

/**
 * The first-entry welcome: three short cards, skippable, shown once.
 *
 * "Once" is the server's `welcomed_at`, not this browser's storage, so a phone and a
 * computer do not both greet the owner. It is portalled out of `<main>`, so it is not part
 * of the page it sits on — nor of that page's word budget.
 */
export function TrialWelcome() {
  const { payload } = useTrial();
  const pathname = usePathname();
  const router = useRouter();
  const tour = useSyncExternalStore(subscribeLocation, tourRequested, () => false);
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // A saved plan is the first-entry experience. The optional tour remains available
  // from the account menu, rather than interrupting it with three more screens.
  const open = Boolean(payload && !payload.ended && !dismissed && tour);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      opener?.focus();
    };
  }, [open]);

  function close(goToday: boolean) {
    setDismissed(true);
    if (!payload?.welcomed_at) markWelcomed();
    if (tour) window.history.replaceState(null, "", pathname);
    if (goToday && pathname !== "/dashboard") router.push("/dashboard");
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close(false);
      if (event.key === "Tab") {
        const panel = panelRef.current;
        const nodes = Array.from(panel?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]') || []).filter(node => node.getClientRects().length > 0);
        const first = nodes[0], last = nodes.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `close` reads current state; re-binding per render is what keeps it fresh.
  });

  if (!open || !payload || typeof document === "undefined") return null;
  const all = cards(payload);
  const card = all[index];
  const last = index === all.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" dir="rtl">
      <div aria-hidden className={`${styles.scrim} absolute inset-0 bg-[var(--ink)]/40`} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        className={`${styles.panel} relative max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[20px] bg-[var(--paper)] px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)] outline-none sm:rounded-[20px] sm:px-8 sm:pt-6 sm:pb-8`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-[color:var(--primary)]">
            ברוכים הבאים <span className="font-medium tabular-nums text-[color:var(--ink-muted)]">· {index + 1} מתוך {all.length}</span>
          </p>
          <button
            type="button"
            onClick={() => close(false)}
            className="-me-2 min-h-11 rounded-md px-2 text-sm font-medium text-[color:var(--ink-soft)] underline-offset-4 transition-colors hover:text-[color:var(--ink)] hover:underline"
          >
            לדלג
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between gap-4">
          <h2 id="welcome-title" className="text-[26px] font-bold leading-tight tracking-tight text-[color:var(--ink)]">{card.title}</h2>
          <Storefront className="h-16 w-20 shrink-0" phase={.5} />
        </div>
        <div key={index} className={`${styles.content} mt-5 min-h-44`}>
          {card.body}
        </div>

        <div className="mt-7 flex items-center gap-3">
          <div aria-hidden className="flex flex-1 items-center gap-1.5">
            {all.map((item, dot) => (
              <span
                key={item.title}
                className={`h-1.5 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none ${
                  dot === index ? "w-6 bg-[var(--primary)]" : "w-1.5 bg-[var(--rule-dark)]"
                }`}
              />
            ))}
          </div>
          {index > 0 ? (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              className="min-h-12 rounded-md px-3 text-[15px] font-medium text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)]"
            >
              הקודם
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => (last ? close(true) : setIndex(index + 1))}
            className="drawn-button inline-flex min-h-12 items-center justify-center whitespace-nowrap bg-[var(--primary)] px-6 text-[15px] font-semibold text-white hover:bg-[var(--primary-dark)] sm:px-7"
          >
            {last ? "לראות את הצעד הראשון" : "הבא"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
