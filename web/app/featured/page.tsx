"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { SectionHeader } from "@/components/SectionHeader";
import { StepLink } from "@/components/trial/StepLink";
import { ApiError } from "@/lib/api";
import { IconArrowLeft, IconPlus, IconTrash } from "@/lib/icons";
import { foundations, type FeaturedItem, type FeaturedPayload, type FeaturedReason } from "@/lib/trial";
import { toast } from "@/lib/ui";

/**
 * Which products or services to feature, in what order and why (Revision 8, week 2).
 *
 * The owner decides — what is in stock, what earns the most, what is seasonal — and the
 * posts follow the order. The list is the order: the first row is the first to feature.
 * One dark button: saving. Moving a row is two quiet arrows; the reason is one tap of a chip.
 */
export default function FeaturedPage() {
  const [data, setData] = useState<FeaturedPayload | null>(null);
  const [items, setItems] = useState<FeaturedItem[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    foundations
      .featured()
      .then((payload) => {
        setData(payload);
        setItems(payload.items);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return; // AppShell redirects
        setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את הרשימה.");
      });
  }, []);

  function change(next: FeaturedItem[]) {
    setItems(next);
    setDirty(true);
  }

  function add(name: string) {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean || !data || items.length >= data.max || items.some((item) => item.name === clean)) return;
    change([...items, { name: clean, reason: null }]);
    setDraft("");
  }

  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    change(next);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload = await foundations.saveFeatured(items);
      setData(payload);
      setItems(payload.items);
      setDirty(false);
      toast("הרשימה נשמרה");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "לא הצלחנו לשמור. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  const kind = data?.kind_he ?? "מוצרים";
  const full = Boolean(data && items.length >= data.max);
  const enough = Boolean(data && items.length >= data.min);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <SectionHeader
          section="business"
          title={`אילו ${kind} לקדם`}
          subtitle={`${data?.min ?? 3} עד ${data?.max ?? 10}, לפי הסדר. הראשון ברשימה יקבל הכי הרבה פוסטים.`}
        />

        {!data ? (
          error ? (
            <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>
          ) : (
            <LoadingMark label="טוענים…" />
          )
        ) : (
          <div className="space-y-5">
            {items.length ? (
              <ol className="divide-y divide-[var(--primary-soft)] overflow-hidden rounded-lg border border-[var(--rule)] bg-white">
                {items.map((item, index) => (
                  <li key={item.name} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--rule-dark)] text-xs font-bold text-[color:var(--ink-soft)]">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 text-[15px] font-bold text-[color:var(--ink)]">{item.name}</span>
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`להעלות את ${item.name} למעלה`}
                        title="למעלה"
                        className="min-h-11 min-w-11 rounded-md text-[color:var(--ink-soft)] hover:bg-[var(--primary-soft)] disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === items.length - 1}
                        aria-label={`להוריד את ${item.name} למטה`}
                        title="למטה"
                        className="min-h-11 min-w-11 rounded-md text-[color:var(--ink-soft)] hover:bg-[var(--primary-soft)] disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => change(items.filter((_, i) => i !== index))}
                        aria-label={`להסיר את ${item.name}`}
                        title="להסיר"
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-[color:var(--ink-soft)] hover:bg-[var(--primary-soft)]"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                    <div role="group" aria-label={`למה ${item.name}`} className="mt-2 flex flex-wrap gap-1.5 pr-9">
                      {data.reasons.map((reason) => {
                        const on = item.reason === reason.key;
                        return (
                          <button
                            key={reason.key}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              change(
                                items.map((entry, i) =>
                                  i === index ? { ...entry, reason: on ? null : (reason.key as FeaturedReason) } : entry
                                )
                              )
                            }
                            className={`min-h-9 rounded-full border px-3 text-xs font-bold transition-colors ${
                              on
                                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[color:var(--primary)]"
                                : "border-[var(--rule-dark)] bg-white text-[color:var(--ink)] hover:bg-[var(--primary-soft)]"
                            }`}
                          >
                            {reason.label_he}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-lg border border-[var(--rule)] bg-white px-4 py-3 text-sm leading-6 text-[color:var(--ink-soft)]">
                עוד לא בחרתם. כתבו שם של {kind === "שירותים" ? "שירות" : "מוצר"}, או בחרו מההצעות.
              </p>
            )}

            {full ? null : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  add(draft);
                }}
                className="flex gap-2"
              >
                <label htmlFor="featured-new" className="sr-only">
                  {kind === "שירותים" ? "שירות להוסיף" : "מוצר להוסיף"}
                </label>
                <input
                  id="featured-new"
                  value={draft}
                  maxLength={80}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={kind === "שירותים" ? "למשל: טיפול פנים" : "למשל: עוגת דבש"}
                  className="min-h-11 min-w-0 flex-1 rounded-md border border-[var(--rule-dark)] bg-white px-3 text-sm"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-[var(--rule-dark)] bg-white px-4 text-sm font-bold text-[color:var(--ink)] hover:bg-[var(--primary-soft)] disabled:opacity-40"
                >
                  <IconPlus className="h-4 w-4" />
                  להוסיף
                </button>
              </form>
            )}

            {!full && data.suggestions.filter((name) => !items.some((item) => item.name === name)).length ? (
              <div>
                <p className="text-xs font-bold text-[color:var(--ink-muted)]">ממה שכתבתם לנו</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.suggestions
                    .filter((name) => !items.some((item) => item.name === name))
                    .map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => add(name)}
                        className="min-h-9 rounded-full border border-dashed border-[var(--rule-dark)] bg-white px-3 text-xs font-bold text-[color:var(--ink)] hover:bg-[var(--primary-soft)]"
                      >
                        + {name}
                      </button>
                    ))}
                </div>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !dirty}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[var(--primary)] px-6 text-sm font-bold text-white hover:bg-[var(--primary-dark)] disabled:opacity-40 sm:w-auto"
              >
                {saving ? "שומרים…" : "לשמור את הרשימה"}
              </button>
              {!dirty && enough ? (
                <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[color:var(--ink)] underline underline-offset-4">
                  לצעד הבא
                  <IconArrowLeft className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
            {enough ? null : (
              <p className="text-xs text-[color:var(--ink-soft)]">
                צריך לפחות {data.min}. אפשר לשמור גם פחות, ולהשלים אחר כך.
              </p>
            )}
            <StepLink stepKey="featured" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
