"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Asset, AssetSource } from "@/lib/api";
import { IconCheck, IconEye, IconImage, IconPen, IconSparkles } from "@/lib/icons";
import { SECTIONS } from "@/lib/sections";

const identity = SECTIONS.assets;

/** Where each file came from, in the owner's words. */
const SOURCE_LABEL: Record<AssetSource, string> = {
  upload: "הועלה",
  url: "מקישור",
  site: "מהאתר",
};

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatDimensions(width: number, height: number) {
  return width > 0 && height > 0 ? `${width}×${height}` : "";
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * One asset in the library.
 *
 * The card owns its own edit/confirm/busy state because those states belong to a single
 * file — putting them on the screen would make every card flip into edit mode at once.
 * Delete is deliberately two-step: the first click replaces the row with a confirmation,
 * so a stray click can never destroy a file the owner uploaded.
 *
 * Edit, re-describe and delete used to sit on every card as three permanently visible
 * buttons — twelve standing controls for a four-asset library, all of them the same
 * weight as the library's real ask. They now live behind one labelled control in the
 * card's own row, so the card reads as a thumbnail and a description until the owner
 * asks for more. Nothing was removed: the two-step delete and its warning still work
 * exactly as before, one click deeper.
 */
export function AssetCard({
  asset,
  libraryTags,
  onSave,
  onDelete,
  onRedescribe,
}: {
  asset: Asset;
  /** Every tag already used anywhere in the library, for one-tap suggestions. */
  libraryTags: string[];
  onSave: (id: number, patch: { description: string; tags: string[] }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onRedescribe: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftDescription, setDraftDescription] = useState(asset.description);
  const [draftTags, setDraftTags] = useState(asset.tags.join(", "));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thumbBroken, setThumbBroken] = useState(false);
  const [error, setError] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsToggle = useRef<HTMLButtonElement>(null);

  const label = asset.description.trim() || "נכס ללא תיאור";
  const dimensions = formatDimensions(asset.width, asset.height);
  const tagSuggestions = libraryTags.filter((tag) => !splitTags(draftTags).includes(tag)).slice(0, 6);

  // An open popover has to close the way the owner expects: a click anywhere else, or
  // Escape — which also hands focus back to the control that opened it.
  useEffect(() => {
    if (!actionsOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActionsOpen(false);
        actionsToggle.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [actionsOpen]);

  async function runDescribe() {
    setDescribing(true);
    setBusy(true);
    setError("");
    try {
      await onRedescribe(asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "התיאור לא התעדכן");
    } finally {
      setDescribing(false);
      setBusy(false);
    }
  }

  async function runSave() {
    const tags = splitTags(draftTags);
    setSaving(true);
    setBusy(true);
    setError("");
    try {
      await onSave(asset.id, { description: draftDescription.trim(), tags });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    } finally {
      setSaving(false);
      setBusy(false);
    }
  }

  async function runDelete() {
    setDeleting(true);
    setError("");
    try {
      await onDelete(asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "המחיקה נכשלה");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const buttonClass =
    "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition-colors disabled:cursor-default disabled:opacity-50";
  const quietButton: CSSProperties = { borderColor: "#dedcd4", background: "#fff", color: "#3c3e3a" };

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border bg-white sm:flex-row" style={{ borderColor: identity.border }}>
      <div className="relative h-44 w-full shrink-0 bg-[#f4f3ee] sm:h-auto sm:w-40">
        {asset.url && !thumbBroken ? (
          asset.kind === "video" ? (
            // The owner's own clip, muted and metadata-only: this is a thumbnail, not a player.
            <video
              src={asset.url}
              muted
              playsInline
              preload="metadata"
              onError={() => setThumbBroken(true)}
              className="h-full w-full object-cover"
              // Some browsers only paint metadata-loaded video once told to seek.
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = 0.1;
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- same-origin proxy path, not an optimizable remote URL
            <img
              src={asset.url}
              alt={label}
              loading="lazy"
              onError={() => setThumbBroken(true)}
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[#b3b0a5]" title="אין תצוגה מקדימה">
            <IconImage className="h-8 w-8" />
          </span>
        )}
        {asset.kind === "video" ? (
          <span
            className="absolute top-2 right-2 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
            style={{ background: "#20211fcc" }}
          >
            וידאו
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 p-4">
        {editing ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-[#20211f]">תיאור</span>
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-[#dedcd4] bg-white px-2.5 py-2 text-sm leading-6 text-[#20211f] outline-none focus:border-[#7d4436]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-[#20211f]">תגיות</span>
              <span className="mt-0.5 block text-[11px] text-[#8b8e84]">מופרדות בפסיק</span>
              <input
                value={draftTags}
                onChange={(event) => setDraftTags(event.target.value)}
                placeholder="חלות, מחמצת, שישי"
                className="mt-1 w-full rounded-md border border-[#dedcd4] bg-white px-2.5 py-2 text-sm text-[#20211f] outline-none focus:border-[#7d4436]"
              />
            </label>
            {tagSuggestions.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[#8b8e84]">תגיות שכבר יש במאגר:</span>
                {tagSuggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setDraftTags((prev) => (prev.trim() ? `${prev.replace(/,\s*$/, "")}, ${tag}` : tag))}
                    className="rounded-full border border-[#dedcd4] bg-[#f8f7f4] px-2 py-0.5 text-[11px] text-[#5e6159] hover:border-[#7d4436]"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void runSave()}
                disabled={saving}
                className={buttonClass}
                style={{ borderColor: identity.accent, background: identity.accent, color: "#fff" }}
              >
                <IconCheck className="h-3.5 w-3.5" />
                {saving ? "שומר…" : "שמירה"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraftDescription(asset.description);
                  setDraftTags(asset.tags.join(", "));
                  setError("");
                }}
                disabled={saving}
                className={buttonClass}
                style={quietButton}
              >
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: identity.surface, color: identity.accent }}
              >
                {SOURCE_LABEL[asset.source]}
              </span>
              <span className="text-[11px] text-[#8b8e84]">{formatDate(asset.created_at)}</span>
              {dimensions ? <span className="text-[11px] text-[#8b8e84]">{dimensions}</span> : null}

              <div ref={actionsRef} className="relative ms-auto">
                <button
                  ref={actionsToggle}
                  type="button"
                  onClick={() => setActionsOpen((prev) => !prev)}
                  disabled={busy}
                  aria-expanded={actionsOpen}
                  title="עריכה, ניתוח מחדש ומחיקה של הנכס"
                  className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md border border-transparent px-2 text-[11px] font-bold text-[#8b8e84] transition-colors hover:border-[#dedcd4] hover:bg-white hover:text-[#20211f] disabled:cursor-default disabled:opacity-60"
                >
                  פעולות
                  <span aria-hidden>{actionsOpen ? "▲" : "▼"}</span>
                </button>
              </div>
            </div>

            <p className="mt-2.5 text-sm leading-6 text-[#3c3e3a]">{asset.description || "אין עדיין תיאור לנכס הזה."}</p>

            {asset.tags.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {asset.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border px-2 py-0.5 text-[11px] font-bold"
                    style={{ borderColor: identity.border, background: identity.surface, color: identity.accent }}
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11px] text-[#8b8e84]">אין תגיות עדיין.</p>
            )}

            {asset.source_url ? (
              <a
                href={asset.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block truncate text-[11px] text-[#8b8e84] underline underline-offset-4 hover:text-[#20211f]"
                title={asset.source_url}
              >
                {asset.source_url}
              </a>
            ) : null}

            {actionsOpen ? (
              <div className="mt-3 border-t border-[#efeee9] pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(true);
                      setActionsOpen(false);
                    }}
                    disabled={busy}
                    className={buttonClass}
                    style={quietButton}
                  >
                    <IconPen className="h-3.5 w-3.5" />
                    עריכה
                  </button>
                  <button
                    type="button"
                    onClick={() => void runDescribe()}
                    disabled={busy}
                    className={buttonClass}
                    style={{ borderColor: identity.border, background: identity.surface, color: identity.accent }}
                  >
                    {describing ? <IconEye className="h-3.5 w-3.5" /> : <IconSparkles className="h-3.5 w-3.5" />}
                    {describing ? "מנתח מחדש…" : "ניתוח מחדש"}
                  </button>
                  {confirmingDelete ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void runDelete()}
                        disabled={deleting}
                        className={buttonClass}
                        style={{ borderColor: "#eed1c9", background: "#fbf2ef", color: "#9f4330" }}
                      >
                        {deleting ? "מוחק…" : "כן, למחוק"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        disabled={deleting}
                        className={buttonClass}
                        style={quietButton}
                      >
                        ביטול
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      disabled={busy}
                      className={buttonClass}
                      style={{ ...quietButton, color: "#8b6a5e" }}
                    >
                      מחיקה
                    </button>
                  )}
                </div>

                {confirmingDelete ? (
                  <p className="mt-2 text-[11px] leading-5 text-[#9f4330]">
                    המחיקה תסיר את הנכס מהספרייה. אין דרך חזרה.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {error ? <p className="mt-3 text-[11px] leading-5 text-[#9f4330]">{error}</p> : null}
      </div>
    </article>
  );
}
