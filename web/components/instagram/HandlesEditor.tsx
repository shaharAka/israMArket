"use client";

import { useState, type FormEvent } from "react";
import { HowToFind } from "@/components/help/HowToFind";
import { endpoints } from "@/lib/api";

/**
 * Up to five Instagram accounts the owner likes — competitors, neighbours, anyone whose
 * posts are worth learning from. Each add and remove saves at once: there is no separate
 * "save" button to forget. The server normalises "@Name" and pasted profile links and
 * answers a bad one with a Hebrew 422, which is shown right under the field.
 */
export function HandlesEditor({
  handles,
  max,
  failures,
  onSaved,
}: {
  handles: string[];
  max: number;
  /** handle → why the last refresh could not read it. */
  failures: Record<string, string>;
  onSaved: (handles: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(next: string[]) {
    setBusy(true);
    setError("");
    try {
      const result = await endpoints.saveInstagramHandles(next);
      onSaved(result.handles);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור. נסו שוב.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    if (await save([...handles, value])) setDraft("");
  }

  const failed = handles.filter((handle) => failures[handle]);
  const full = handles.length >= max;

  return (
    <section aria-labelledby="handles-heading">
      <h2 id="handles-heading" className="text-base font-black text-[var(--ink)]">
        חשבונות להשראה
      </h2>
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3">
        <p className="text-sm text-[var(--ink-soft)]">עסקים שאתם אוהבים, עד {max}.</p>
        <HowToFind topic="competitor_instagram" label="איך מוצאים שם משתמש?" />
      </div>

      {handles.length ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="החשבונות שנשמרו">
          {handles.map((handle) => (
            <li
              key={handle}
              dir="ltr"
              className={`inline-flex min-h-10 items-center gap-1 rounded-full py-1 pl-3 pr-1 text-sm font-bold ${
                failures[handle] ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--rule)] text-[var(--ink)]"
              }`}
            >
              @{handle}
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(handles.filter((item) => item !== handle))}
                aria-label={`להסיר את @${handle}`}
                title={`להסיר את @${handle}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base leading-none text-[var(--ink-soft)] hover:bg-white hover:text-[var(--ink)] disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {failed.length ? (
        <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--danger)]">
          {failed.map((handle) => (
            <li key={handle}>{failures[handle]}</li>
          ))}
        </ul>
      ) : null}

      {full ? null : (
        <form onSubmit={(event) => void add(event)} className="mt-3 flex gap-2">
          <label htmlFor="handle-input" className="sr-only">
            שם משתמש באינסטגרם או קישור לפרופיל
          </label>
          <input
            id="handle-input"
            dir="auto"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError("");
            }}
            placeholder="@שם או קישור לפרופיל"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "handle-error" : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-[var(--rule)] bg-white px-3 text-sm placeholder:text-[var(--ink-muted)] focus:border-[var(--ink)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="min-h-11 shrink-0 rounded-md border border-[var(--rule-dark)] bg-white px-4 text-sm font-bold text-[var(--ink)] hover:bg-[var(--canvas)] disabled:opacity-40"
          >
            {busy ? "שומרים…" : "להוסיף"}
          </button>
        </form>
      )}

      {error ? (
        <p id="handle-error" role="alert" className="mt-2 text-xs leading-5 text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
