"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { endpoints, type SetupItem, type SetupPayload } from "@/lib/api";
import { SECTIONS } from "@/lib/sections";
import { IconArrowLeft, IconCheck } from "@/lib/icons";

/** Session-scoped: a finished checklist should stop talking until the next visit, but
 *  "done" is a claim worth re-checking rather than a setting worth keeping forever. */
const DISMISS_KEY = "isramarket_setup_complete_dismissed";

/** How many of the remaining steps the collapsed view names before it stops counting.
 *  The point of the short list is the shape of what is left, not an inventory. */
const QUIET_LIST_LIMIT = 4;

/**
 * The dismissal flag, read as the external store it is.
 *
 * `sessionStorage` is outside React, so it is read through `useSyncExternalStore` rather
 * than copied into state by an effect: the server snapshot is "not dismissed", and React
 * reconciles the real value after hydration instead of rendering HTML that disagrees with
 * what the browser then draws. Writing it notifies the subscribers ourselves, because
 * sessionStorage only raises events for *other* tabs.
 */
const DISMISS_LISTENERS = new Set<() => void>();

function subscribeDismiss(listener: () => void) {
  DISMISS_LISTENERS.add(listener);
  return () => {
    DISMISS_LISTENERS.delete(listener);
  };
}

function dismissedSnapshot(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // Safari in private mode throws on sessionStorage. A card that cannot remember being
    // dismissed is still better than a dashboard that breaks over a dismissal.
    return false;
  }
}

/** The server has no sessionStorage, and guessing "dismissed" there would hide the card
 *  from the HTML and then pop it in after hydration. */
function neverDismissed(): boolean {
  return false;
}

function dismissForSession() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Storage is the memory, not the behaviour: the card still goes away for this render.
  }
  DISMISS_LISTENERS.forEach((listener) => listener());
}

/**
 * What the owner still has to set up.
 *
 * The wizard ends and leaves them in an app that is mostly empty, so this card answers
 * "what is missing, and what do I do about it". It leads with one action because a list
 * of eleven things is not guidance, and it keeps the completed steps visible rather than
 * hiding them, because the progress is the reason to continue.
 *
 * Guidance only: a `/setup` that fails renders nothing at all. An error box here would
 * make the dashboard worse than a dashboard without the card, and the rest of the page
 * must not depend on this call succeeding.
 */
export function SetupChecklist() {
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const dismissed = useSyncExternalStore(subscribeDismiss, dismissedSnapshot, neverDismissed);

  useEffect(() => {
    let alive = true;
    endpoints
      .setup()
      .then((payload) => {
        if (alive) setSetup(payload);
      })
      .catch(() => {
        // Handled by the null payload below: no card, no error, no empty frame.
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return dismissed ? null : <SetupSkeleton />;
  if (!setup) return null;

  const items = setup.groups.flatMap((group) => group.items);
  const complete = setup.next === null || (setup.total > 0 && setup.completed >= setup.total);

  if (complete) {
    if (dismissed) return null;
    return <CompleteLine onDismiss={dismissForSession} />;
  }

  const remaining = items.filter((item) => !item.done);
  // The next step is already the button, so the quiet list starts after it.
  const others = remaining.filter((item) => item.key !== setup.next?.key);
  const hidden = Math.max(0, others.length - QUIET_LIST_LIMIT);
  const nextWhy = items.find((item) => item.key === setup.next?.key)?.why;
  const accent = SECTIONS.dashboard.accent;
  const percent = setup.total ? Math.round((setup.completed / setup.total) * 100) : 0;

  return (
    <section className="rounded-lg border border-[#e6e4dc] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-black text-[#20211f]">כדי שהתוכנית תהיה מדויקת</h2>
        <span className="text-[11px] font-bold text-[#747570]">
          {setup.completed} מתוך {setup.total} הוגדרו
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={setup.total}
        aria-valuenow={setup.completed}
        aria-label="התקדמות בהגדרת העסק"
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e1e0db]"
      >
        <span
          className="block h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${percent}%`, background: accent }}
        />
      </div>

      {setup.next ? (
        <div className="mt-5">
          <p className="text-xs font-bold text-[#747570]">הדבר הבא</p>
          <p className="mt-1 text-sm font-bold leading-6 text-[#20211f]">{setup.next.title}</p>
          {nextWhy ? <p className="mt-0.5 text-sm leading-6 text-[#62635f]">{nextWhy}</p> : null}
          <Link
            href={setup.next.action_href}
            className="group mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#20211f] px-5 text-sm font-bold text-white transition-colors hover:bg-[#343632] sm:w-auto"
          >
            {setup.next.action_label}
            <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
          </Link>
        </div>
      ) : null}

      {open ? (
        <div className="mt-5 space-y-5 border-t border-[#e9e8e3] pt-5">
          {setup.groups.map((group) => (
            <div key={group.key}>
              <p className="text-xs font-bold text-[#747570]">{group.title}</p>
              <ul className="mt-3 space-y-3.5">
                {group.items.map((item) => (
                  <ItemRow key={item.key} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : others.length ? (
        <ul className="mt-5 space-y-1.5 border-t border-[#e9e8e3] pt-4">
          {others.slice(0, QUIET_LIST_LIMIT).map((item) => (
            <li key={item.key}>
              <Link
                href={item.action_href}
                className="flex items-center gap-2.5 text-sm text-[#62635f] transition-colors hover:text-[#20211f]"
              >
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#d5d2c8]" />
                <span className="min-w-0 truncate">{item.title}</span>
              </Link>
            </li>
          ))}
          {hidden ? (
            <li className="pr-4 text-xs text-[#8b8e84]">
              {hidden === 1 ? "ועוד שלב אחד" : `ועוד ${hidden} שלבים`}
            </li>
          ) : null}
        </ul>
      ) : null}

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="mt-4 text-[11px] font-bold text-[#747570] transition-colors hover:text-[#20211f]"
      >
        {open ? "סגירה" : "הצגת כל השלבים"}
      </button>
    </section>
  );
}

/** One step in the expanded list. Done steps stay in place, muted and checked. */
function ItemRow({ item }: { item: SetupItem }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          item.done ? "bg-[#343632] text-white" : "border border-[#dedcd4]"
        }`}
      >
        {item.done ? <IconCheck className="h-3 w-3" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${item.done ? "text-[#8b8e84]" : "text-[#20211f]"}`}>
          {item.title}
        </p>
        <p className={`mt-0.5 text-xs leading-5 ${item.done ? "text-[#a3a29b]" : "text-[#747570]"}`}>
          {item.why}
        </p>
      </div>
      {item.done ? null : (
        <Link
          href={item.action_href}
          className="shrink-0 pt-0.5 text-[11px] font-bold text-[#20211f] hover:underline"
        >
          {item.action_label}
        </Link>
      )}
    </li>
  );
}

/** The finished state: one quiet line, and the option to stop seeing it. */
function CompleteLine({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#e6e4dc] bg-white px-4 py-3">
      <p className="flex min-w-0 items-center gap-2.5 text-xs font-bold text-[#62635f]">
        <IconCheck className="h-4 w-4 shrink-0 text-[#343632]" />
        <span>הכול מוגדר — התוכנית עובדת עם כל מה שהיא צריכה מכם.</span>
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-[11px] font-bold text-[#8b8e84] transition-colors hover:text-[#62635f]"
      >
        הסתרה
      </button>
    </div>
  );
}

/** A beat of loading, at the card's own weight rather than a full-page mark. */
function SetupSkeleton() {
  return (
    <section
      role="status"
      aria-label="בודקים מה כבר מוגדר"
      className="rounded-lg border border-[#e6e4dc] bg-white p-5 sm:p-6"
    >
      <div aria-hidden className="animate-pulse space-y-3">
        <div className="h-3 w-40 rounded-full bg-[#eeede8]" />
        <div className="h-1.5 w-full rounded-full bg-[#f0efeb]" />
        <div className="h-5 w-56 rounded-full bg-[#f0efeb]" />
        <div className="h-12 w-full rounded-md bg-[#f4f3ee] sm:w-44" />
      </div>
    </section>
  );
}
