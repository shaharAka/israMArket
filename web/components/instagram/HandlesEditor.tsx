"use client";

import { useState, type FormEvent } from "react";
import { HowToFind } from "@/components/help/HowToFind";
import { endpoints } from "@/lib/api";
import { IconPlus } from "@/lib/icons";

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
      <h2 id="handles-heading" className="text-lg font-bold tracking-tight text-[color:var(--ink)]">
        חשבונות להשראה
      </h2>
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3">
        <p className="text-[15px] text-[color:var(--ink-soft)]">עסקים שאתם אוהבים, עד {max}.</p>
        <HowToFind topic="competitor_instagram" label="איך מוצאים שם משתמש?" />
      </div>

      {handles.length ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="החשבונות שנשמרו">
          {handles.map((handle) => (
            <li
              key={handle}
              dir="ltr"
              className={`inline-flex min-h-11 items-center gap-0.5 rounded-full py-1 pl-4 pr-1 text-[14px] font-medium ${
                failures[handle]
                  ? "bg-[var(--danger-soft)] text-[color:var(--danger)] shadow-[inset_0_0_0_1px_var(--danger-rule)]"
                  : "bg-[var(--paper)] text-[color:var(--ink)] shadow-[var(--shadow-card)]"
              }`}
            >
              @{handle}
              {/* An icon, not a typed "×": a glyph is read as a word on every chip. */}
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(handles.filter((item) => item !== handle))}
                aria-label={`להסיר את @${handle}`}
                title={`להסיר את @${handle}`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--ink-muted)] transition-colors hover:bg-[var(--soft)] hover:text-[color:var(--ink)] disabled:opacity-40"
              >
                <IconPlus className="h-4 w-4 rotate-45" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {failed.length ? (
        <ul className="mt-2 space-y-1 text-[13px] leading-6 text-[color:var(--danger)]">
          {failed.map((handle) => (
            <li key={handle}>{failures[handle]}</li>
          ))}
        </ul>
      ) : null}

      {full ? null : (
        <form onSubmit={(event) => void add(event)} className="mt-4 flex gap-2">
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
            className="h-[46px] min-w-0 flex-1 rounded-[10px] border border-[var(--rule-dark)] bg-[var(--paper)] px-3.5 text-[15px] text-[color:var(--ink)] transition-[border-color,box-shadow] duration-200 placeholder:text-[color:var(--ink-faint)] focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_var(--primary-soft)] focus:outline-none aria-[invalid=true]:border-[var(--danger)]"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="h-[46px] shrink-0 rounded-[12px] border border-[var(--rule-dark)] bg-[var(--paper)] px-5 text-[14px] font-semibold text-[color:var(--ink)] shadow-[0_1px_2px_rgba(20,32,58,0.05)] transition-colors hover:bg-[var(--soft)] disabled:opacity-45"
          >
            {busy ? "שומרים…" : "להוסיף"}
          </button>
        </form>
      )}

      {error ? (
        <p id="handle-error" role="alert" className="mt-2 text-[13px] leading-6 text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
