"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { HowToFind } from "@/components/help/HowToFind";
import type { HelpTopic } from "@/components/help/guides";
import { endpoints, type SetupItem, type SetupPayload } from "@/lib/api";
import { SECTIONS } from "@/lib/sections";
import { IconArrowLeft, IconCheck, IconChevron } from "@/lib/icons";

/** Session-scoped: a finished checklist should stop talking until the next visit, but
 *  "done" is a claim worth re-checking rather than a setting worth keeping forever. */
const DISMISS_KEY = "isramarket_setup_complete_dismissed";

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
    // Safari in private mode throws on sessionStorage. A row that cannot remember being
    // dismissed is still better than a dashboard that breaks over a dismissal.
    return false;
  }
}

/** The server has no sessionStorage, and guessing "dismissed" there would hide the row
 *  from the HTML and then pop it in after hydration. */
function neverDismissed(): boolean {
  return false;
}

function dismissForSession() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Storage is the memory, not the behaviour: the row still goes away for this render.
  }
  DISMISS_LISTENERS.forEach((listener) => listener());
}

/**
 * The steps that need something from outside the app — a site address, a Google account
 * with access, an Instagram that is a professional account — and the guide for each.
 * Keys from `api/app/routers/setup.py`.
 */
const HELP_FOR: Partial<Record<string, HelpTopic>> = {
  scan: "website",
  google: "google_analytics",
};

function HelpLink({ itemKey, className }: { itemKey: string; className?: string }) {
  const topic = HELP_FOR[itemKey];
  return topic ? <HowToFind topic={topic} className={className} /> : null;
}

/**
 * What the owner still has to set up — folded into one row.
 *
 * The wizard ends and leaves them in an app that is mostly empty, so this answers "what is
 * missing, and what do I do about it". On Today it is guidance, not the page's ask: the one
 * dark button there belongs to the pending post, so the checklist is a single "X things
 * left" row that opens in place. Opened, it leads with the next step and keeps completed
 * steps visible rather than hiding them, because the progress is the reason to continue.
 *
 * It draws no box of its own: the page puts it in the same hairline-divided list as its
 * other quiet rows.
 *
 * Guidance only: a `/setup` that fails renders nothing at all. An error box here would
 * make the dashboard worse than a dashboard without the row, and the rest of the page
 * must not depend on this call succeeding.
 */
export function SetupChecklist() {
  const t = useCopy();
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
        // Handled by the null payload below: no row, no error, no empty frame.
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

  const complete = setup.next === null || (setup.total > 0 && setup.completed >= setup.total);
  const deferred = setup.groups.flatMap(group => group.items).filter(item => item.status === "soon");

  if (complete) {
    if (dismissed) return null;
    return <>
      <CompleteLine onDismiss={dismissForSession} deferred={deferred.length > 0} />
      {deferred.map(item => <p key={item.key} className="pb-3 text-[13px] leading-6 text-[var(--ink-soft)]">{item.why}</p>)}
    </>;
  }

  const items = setup.groups.flatMap((group) => group.items);
  const left = Math.max(0, setup.total - setup.completed);
  const nextWhy = items.find((item) => item.key === setup.next?.key)?.why;
  const accent = SECTIONS.dashboard.accent;
  const percent = setup.total ? Math.round((setup.completed / setup.total) * 100) : 0;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-right"
      >
        <span className="min-w-0 text-[15px] font-semibold text-[var(--ink)]">
          {left === 1 ? t("נשאר עוד דבר אחד להגדיר") : t("נשארו עוד {arg_0} דברים להגדיר", { arg_0: left })}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={setup.total}
            aria-valuenow={setup.completed}
            aria-label={t("הוגדרו {arg_0} מתוך {arg_1}", { arg_0: setup.completed, arg_1: setup.total })}
            className="block h-1.5 w-14 overflow-hidden rounded-full bg-[var(--rule)] sm:w-20"
          >
            <span className="block h-full rounded-full" style={{ width: `${percent}%`, background: accent }} />
          </span>
          <IconChevron
            className={`h-4 w-4 text-[var(--ink-muted)] transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-90" : "-rotate-90"}`}
          />
        </span>
      </button>

      {open ? (
        <div className="space-y-5 pb-5">
          {setup.next ? (
            <div className="rounded-[14px] bg-[var(--soft)] p-4 sm:p-5">
              <p className="text-[13px] font-semibold text-[var(--ink-muted)]"><Copy text="מה עכשיו" /></p>
              <p className="mt-1 text-[15px] font-semibold leading-6 text-[var(--ink)]">{setup.next.title}</p>
              {nextWhy ? <p className="mt-0.5 text-sm leading-6 text-[var(--ink-soft)]">{nextWhy}</p> : null}
              <HelpLink itemKey={setup.next.key} />
              {/* Guidance, not the page's ask: an outline, never the dark button. */}
              <Link
                href={setup.next.action_href}
                className="group mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--rule-dark)] bg-[var(--paper)] px-5 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--ink-faint)] sm:w-auto"
              >
                {setup.next.action_label}
                <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
              </Link>
            </div>
          ) : null}

          {setup.groups.map((group) => (
            <div key={group.key} className="border-t border-[var(--rule)] pt-4">
              <p className="text-[13px] font-semibold text-[var(--ink-muted)]">{group.title}</p>
              <ul className="mt-3 space-y-4">
                {group.items.map((item) => (
                  <ItemRow key={item.key} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** One step in the opened list. Done steps stay in place, muted and checked. */
function ItemRow({ item }: { item: SetupItem }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          item.done ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[1.5px] border-[var(--rule-dark)] bg-[var(--paper)]"
        }`}
      >
        {item.done ? <IconCheck className="h-3 w-3" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] font-medium ${item.done ? "text-[var(--ink-muted)]" : "text-[var(--ink)]"}`}>
          {item.title}
        </p>
        <p className={`mt-0.5 text-[13px] leading-5 ${item.done ? "text-[var(--ink-muted)]" : "text-[var(--ink-soft)]"}`}>
          {item.why}
        </p>
        {item.done || item.status === "soon" ? null : <HelpLink itemKey={item.key} className="-my-1" />}
      </div>
      {item.done ? null : item.status === "soon" ? <span className="text-[13px] text-[var(--ink-muted)]"><Copy text="בהמשך" /></span> : (
        <Link
          href={item.action_href}
          className="-my-2 inline-flex min-h-11 shrink-0 items-center text-[13px] font-semibold text-[var(--primary)] underline-offset-4 hover:underline"
        >
          {item.action_label}
        </Link>
      )}
    </li>
  );
}

/** The finished state: one quiet line, and the option to stop seeing it. */
function CompleteLine({ onDismiss, deferred = false }: { onDismiss: () => void; deferred?: boolean }) {
  const t = useCopy();
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 py-2">
      <p className="flex min-w-0 items-center gap-2.5 text-[15px] font-medium text-[var(--ink-soft)]">
        <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
          <IconCheck className="h-3 w-3" />
        </span>
        <span>{deferred ? t("ההגדרות הזמינות הושלמו") : t("מה שצריך להתחלה מוגדר")}</span>
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="-me-2 min-h-11 shrink-0 rounded-md px-2 text-[13px] font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
      >
        <Copy text="להסתיר" /></button>
    </div>
  );
}

/** A beat of loading, at the row's own height so nothing jumps when it arrives. */
function SetupSkeleton() {
  const t = useCopy();
  return (
    <div role="status" aria-label={t("בודקים מה כבר מוגדר")} className="flex min-h-14 items-center py-3">
      <div aria-hidden className="h-3 w-44 animate-pulse rounded-full bg-[var(--soft)] motion-reduce:animate-none" />
    </div>
  );
}
