"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { SectionHeader } from "@/components/SectionHeader";
import { StepLink } from "@/components/trial/StepLink";
import { ApiError } from "@/lib/api";
import ui from "@/components/posts/chrome.module.css";
import { IconArrowLeft, IconChevron, IconPlus, IconTrash } from "@/lib/icons";
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
            <p role="alert" className={ui.error}>{error}</p>
          ) : (
            <LoadingMark label="טוענים…" />
          )
        ) : (
          <div>
            {items.length ? (
              <ol className={`${ui.card} divide-y divide-[var(--rule)] overflow-hidden`}>
                {items.map((item, index) => (
                  <li key={item.name} className="px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--soft)] text-[13px] font-semibold tabular-nums text-[color:var(--ink-soft)]">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 text-base font-semibold text-[color:var(--ink)]">{item.name}</span>
                      <span className="-me-2 flex shrink-0 items-center">
                        <button
                          type="button"
                          onClick={() => move(index, -1)}
                          disabled={index === 0}
                          aria-label={`להעלות את ${item.name} למעלה`}
                          title="למעלה"
                          className={ui.iconButton}
                        >
                          <IconChevron className="rotate-90" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, 1)}
                          disabled={index === items.length - 1}
                          aria-label={`להוריד את ${item.name} למטה`}
                          title="למטה"
                          className={ui.iconButton}
                        >
                          <IconChevron className="-rotate-90" />
                        </button>
                        <button
                          type="button"
                          onClick={() => change(items.filter((_, i) => i !== index))}
                          aria-label={`להסיר את ${item.name}`}
                          title="להסיר"
                          className={`${ui.iconButton} hover:text-[var(--danger)]`}
                        >
                          <IconTrash />
                        </button>
                      </span>
                    </div>
                    <div role="group" aria-label={`למה ${item.name}`} className="mt-3 flex flex-wrap gap-2 pr-10">
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
                            className={ui.chip}
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
              <p className={`${ui.inset} px-5 py-4 text-[15px] leading-7 text-[color:var(--ink-soft)]`}>
                עוד לא בחרתם. כתבו שם של {kind === "שירותים" ? "שירות" : "מוצר"}, או בחרו מההצעות.
              </p>
            )}

            {full ? null : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  add(draft);
                }}
                className="mt-6 flex gap-2"
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
                  className={`${ui.field} min-w-0 flex-1`}
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className={`${ui.button} ${ui.matchField} shrink-0`}
                >
                  <IconPlus />
                  להוסיף
                </button>
              </form>
            )}

            {!full && data.suggestions.filter((name) => !items.some((item) => item.name === name)).length ? (
              <div className="mt-6">
                <p className="text-[13px] font-semibold text-[color:var(--ink-muted)]">ממה שכתבתם לנו</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.suggestions
                    .filter((name) => !items.some((item) => item.name === name))
                    .map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => add(name)}
                        className={`${ui.chip} border-dashed ps-3 text-[color:var(--ink)]`}
                      >
                        <IconPlus className="text-[color:var(--ink-muted)]" />
                        {name}
                      </button>
                    ))}
                </div>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className={`${ui.error} mt-6`}>
                {error}
              </p>
            ) : null}

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !dirty}
                className="drawn-button inline-flex min-h-12 w-full items-center justify-center bg-[var(--primary)] px-6 text-[15px] text-white enabled:hover:bg-[var(--primary-dark)] sm:w-auto"
              >
                {saving ? "שומרים…" : "לשמור את הרשימה"}
              </button>
              {!dirty && enough ? (
                <Link href="/dashboard" className={ui.link}>
                  לצעד הבא
                  <IconArrowLeft data-forward="" />
                </Link>
              ) : null}
            </div>
            {enough ? null : (
              <p className={`${ui.help} mt-3`}>
                צריך לפחות {data.min}. אפשר לשמור גם פחות, ולהשלים אחר כך.
              </p>
            )}
            <StepLink stepKey="featured" className="mt-2" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
