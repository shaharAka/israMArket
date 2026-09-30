"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { IconChart, IconImage, IconRoute } from "@/lib/icons";
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
        <ul className="space-y-3">
          <Row icon={<IconRoute className="h-5 w-5" />} title="התוכנית" text="מה עושים ב-3 החודשים הקרובים, ואיך נמדוד." />
          <Row icon={<IconImage className="h-5 w-5" />} title="הפוסטים" text="כתובים ומעוצבים לכל החודש. מחכים לאישור שלכם." />
          <Row icon={<IconChart className="h-5 w-5" />} title="התוצאות והמחקר" text="מה הצליח, ומה למדנו השבוע על המתחרים והחיפושים." />
        </ul>
      ),
    },
    {
      title: "מה קורה החודש",
      body: (
        <ol className="space-y-2 text-sm leading-6 text-[#3c3e3a]">
          <li><b className="text-[#20211f]">שבוע 1, מדידה:</b> מחברים את מה שמודד, ורושמים איפה העסק היום.</li>
          <li><b className="text-[#20211f]">שבוע 2, חומרי גלם:</b> תמונות, אילו מוצרים לקדם, ובדיקה שהסגנון נשמע כמוכם.</li>
          <li><b className="text-[#20211f]">שבוע 3, תוכן ראשון:</b> רק עכשיו כותבים את הפוסטים. מאשרים ומפרסמים.</li>
          <li><b className="text-[#20211f]">שבוע 4, מודדים ומתאימים:</b> התוצאות מול נקודת הפתיחה, החודש השני, ומחליטים אם להמשיך.</li>
          <li className="pt-1 text-[#62635f]">
            {trial.days_total} יום חינם{NO_CARD_AT_SIGNUP ? ", בלי כרטיס אשראי" : ""}.
          </li>
        </ol>
      ),
    },
    {
      title: "מה צריך מכם",
      body: (
        <div className="space-y-3 text-sm leading-6 text-[#3c3e3a]">
          <p>כמה דקות ביום, ובעיקר החלטות. את הכתיבה, העיצוב והמחקר אנחנו עושים.</p>
          {asks.length ? (
            <ul className="space-y-1.5">
              {asks.map((ask) => (
                <li key={ask} className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#374b3d]" />
                  {ask}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-[#62635f]">בעמוד ״השבוע״ תמיד יחכה לכם הצעד הבא.</p>
        </div>
      ),
    },
  ];
}

function Row({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f6f1] text-[#374b3d]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-[#20211f]">{title}</span>
        <span className="block text-sm leading-6 text-[#3c3e3a]">{text}</span>
      </span>
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

  const open = Boolean(payload && !payload.ended && !dismissed && (tour || !payload.welcomed_at));

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
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
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" dir="rtl">
      <div aria-hidden className="absolute inset-0 bg-black/35" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-t-2xl bg-white px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none sm:rounded-2xl sm:p-6"
        style={{ animation: "rise 0.35s cubic-bezier(0.2, 0.7, 0.2, 1) both" }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-[#374b3d]">ברוכים הבאים · {index + 1} מתוך {all.length}</p>
          <button
            type="button"
            onClick={() => close(false)}
            className="min-h-11 px-2 text-sm font-bold text-[#62635f] underline-offset-4 hover:text-[#20211f] hover:underline"
          >
            לדלג
          </button>
        </div>
        <h2 id="welcome-title" className="mt-1 text-xl font-black text-[#20211f]">
          {card.title}
        </h2>
        <div key={index} className="rise mt-4 min-h-44">
          {card.body}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div aria-hidden className="flex flex-1 gap-1.5">
            {all.map((item, dot) => (
              <span
                key={item.title}
                className={`h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
                  dot === index ? "w-6 bg-[#20211f]" : "w-1.5 bg-[#d6d4cc]"
                }`}
              />
            ))}
          </div>
          {index > 0 ? (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              className="min-h-12 px-3 text-sm font-bold text-[#62635f] hover:text-[#20211f]"
            >
              הקודם
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => (last ? close(true) : setIndex(index + 1))}
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#20211f] px-6 text-sm font-bold text-white transition-colors hover:bg-[#343632]"
          >
            {last ? "לראות את הצעד הראשון" : "הבא"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
