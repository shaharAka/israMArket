"use client";

import { useState, type FormEvent } from "react";
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
      <h2 id="handles-heading" className="text-base font-black text-[#20211f]">
        חשבונות להשראה
      </h2>
      <p className="mt-0.5 text-sm text-[#62635f]">עסקים שאתם אוהבים, עד {max}.</p>

      {handles.length ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="החשבונות שנשמרו">
          {handles.map((handle) => (
            <li
              key={handle}
              dir="ltr"
              className={`inline-flex min-h-10 items-center gap-1 rounded-full py-1 pl-3 pr-1 text-sm font-bold ${
                failures[handle] ? "bg-[#fbf2ef] text-[#9f4330]" : "bg-[#eeede8] text-[#20211f]"
              }`}
            >
              @{handle}
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(handles.filter((item) => item !== handle))}
                aria-label={`להסיר את @${handle}`}
                title={`להסיר את @${handle}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base leading-none text-[#62635f] hover:bg-white hover:text-[#20211f] disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {failed.length ? (
        <ul className="mt-2 space-y-1 text-xs leading-5 text-[#9f4330]">
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
            className="min-h-11 min-w-0 flex-1 rounded-md border border-[#dedcd4] bg-white px-3 text-sm placeholder:text-[#9a9b95] focus:border-[#20211f] focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="min-h-11 shrink-0 rounded-md border border-[#cecdc7] bg-white px-4 text-sm font-bold text-[#20211f] hover:bg-[#f4f3ee] disabled:opacity-40"
          >
            {busy ? "שומרים…" : "להוסיף"}
          </button>
        </form>
      )}

      {error ? (
        <p id="handle-error" role="alert" className="mt-2 text-xs leading-5 text-[#9f4330]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
