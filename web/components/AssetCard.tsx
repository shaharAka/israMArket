"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Asset, AssetSource } from "@/lib/api";
import { IconCheck, IconEye, IconImage, IconPen, IconSparkles } from "@/lib/icons";
import { SECTIONS } from "@/lib/sections";

const identity = SECTIONS.assets;

/** Where each file came from, in the owner's words. */
const SOURCE_LABEL: Record<AssetSource, string> = {
  upload: "הועלה מהמכשיר",
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

function kindWord(asset: Asset) {
  return asset.kind === "video" ? "סרטון" : "תמונה";
}

/**
 * The play mark every clip wears. Drawn here rather than borrowed from the icon set because
 * it is a thumbnail overlay, not a control: a filled triangle in a translucent disc, legible
 * on a photo and on the empty placeholder alike.
 */
function PlayMark({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14" : "h-10 w-10";
  const glyph = size === "lg" ? "h-6 w-6" : "h-4 w-4";
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 m-auto flex ${box} items-center justify-center rounded-full bg-[#20211f]/70 text-white shadow-sm`}
    >
      <svg viewBox="0 0 24 24" className={`${glyph} translate-x-[-1px]`} fill="currentColor">
        {/* Pointing right in an RTL page too: a play symbol is not text, it does not mirror. */}
        <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5Z" />
      </svg>
    </span>
  );
}

/**
 * What sits under a clip before — or instead of — its first frame.
 *
 * A `<video preload="metadata">` paints nothing on iOS until it plays, and a clip whose file
 * cannot be read paints nothing anywhere, so a video tile used to be a blank grey square.
 * The placeholder is always underneath: the frame covers it when there is one, and when
 * there is not the owner still sees a tinted poster with a play mark rather than a hole.
 */
function VideoPoster() {
  return (
    <span
      aria-hidden
      className="absolute inset-0"
      style={{ background: `linear-gradient(160deg, ${identity.surface}, ${identity.border})` }}
    />
  );
}

/** The thumbnail, shared by the grid tile and the sheet's preview. */
function Preview({ asset, mode }: { asset: Asset; mode: "tile" | "sheet" }) {
  const [broken, setBroken] = useState(false);
  const label = asset.description.trim() || `${kindWord(asset)} ללא תיאור`;
  const fit = mode === "tile" ? "object-cover" : "object-contain";

  if (asset.kind === "video") {
    return (
      <>
        <VideoPoster />
        {asset.url && !broken ? (
          <video
            src={asset.url}
            muted
            playsInline
            controls={mode === "sheet"}
            preload="metadata"
            onError={() => setBroken(true)}
            className={`relative h-full w-full ${fit}`}
            // Some browsers only paint a metadata-loaded frame once told to seek.
            onLoadedMetadata={(event) => {
              event.currentTarget.currentTime = 0.1;
            }}
          />
        ) : null}
        {/* The sheet's own player draws its controls; the play mark is for the tile, and
            for a clip that cannot be played at all. */}
        {mode === "tile" || broken || !asset.url ? <PlayMark size={mode === "sheet" ? "lg" : "md"} /> : null}
        {mode === "sheet" && (broken || !asset.url) ? (
          <span className="absolute inset-x-0 bottom-3 text-center text-xs text-[#5e6159]">
            אי אפשר להציג את הסרטון כאן
          </span>
        ) : null}
      </>
    );
  }

  return asset.url && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element -- same-origin proxy path, not an optimizable remote URL
    <img
      src={asset.url}
      alt={mode === "sheet" ? label : ""}
      loading="lazy"
      onError={() => setBroken(true)}
      className={`h-full w-full ${fit}`}
    />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-[#b3b0a5]" title="אין תצוגה מקדימה">
      <IconImage className="h-8 w-8" />
    </span>
  );
}

/**
 * One asset in the grid: a thumbnail and nothing else.
 *
 * The library used to be one full-width card per file — thumbnail, description, tags and
 * an actions row — so four photos cost more than two screens on a phone. A photo library
 * is scanned by eye, so the face is now the pictures, two across on a phone, and a tap
 * opens everything about one of them in a sheet (`AssetSheet`).
 */
export function AssetTile({ asset, onOpen }: { asset: Asset; onOpen: () => void }) {
  const described = Boolean(asset.description.trim());
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${kindWord(asset)}: ${asset.description.trim() || "ללא תיאור"}. לפרטים ולפעולות`}
      title={asset.description.trim() || undefined}
      className="group relative block aspect-square w-full cursor-pointer overflow-hidden rounded-lg border bg-[#f4f3ee] transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#20211f]"
      style={{ borderColor: identity.border }}
    >
      <Preview asset={asset} mode="tile" />
      {/* The one status worth seeing from the grid: a file the posts cannot use yet. */}
      {described ? null : (
        <span className="absolute right-1.5 bottom-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-[#5e6159]">
          בלי תיאור
        </span>
      )}
    </button>
  );
}

/**
 * Everything about one asset, in a sheet over the grid.
 *
 * A native `<dialog>` opened modally: it brings its own focus trap, Escape and top layer
 * (so it sits above the bottom tab bar), and a tap on the backdrop closes it. On a phone it
 * docks to the bottom edge as a sheet; from `sm` up it is a centred panel.
 *
 * The sheet owns its edit/confirm/busy state because those states belong to a single file.
 * Delete is deliberately two-step: the first tap replaces the button with a confirmation,
 * so a stray tap can never destroy a file the owner uploaded.
 */
export function AssetSheet({
  asset,
  libraryTags,
  onClose,
  onSave,
  onDelete,
  onRedescribe,
}: {
  asset: Asset;
  /** Every tag already used anywhere in the library, for one-tap suggestions. */
  libraryTags: string[];
  onClose: () => void;
  onSave: (id: number, patch: { description: string; tags: string[] }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onRedescribe: (id: number) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const [draftDescription, setDraftDescription] = useState(asset.description);
  const [draftTags, setDraftTags] = useState(asset.tags.join(", "));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dimensions = formatDimensions(asset.width, asset.height);
  const tagSuggestions = libraryTags.filter((tag) => !splitTags(draftTags).includes(tag)).slice(0, 6);

  // Opened once on mount. There is deliberately no cleanup that closes it: closing fires
  // the dialog's `close` event, which is `onClose`, which unmounts the sheet — so under
  // React's development double-run of effects a cleanup `close()` would dismiss the sheet
  // the instant it opened. Unmounting removes the element, and an open dialog goes with it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "המחיקה נכשלה");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const buttonClass =
    "inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition-colors disabled:cursor-default disabled:opacity-50";
  const quietButton: CSSProperties = { borderColor: "#dedcd4", background: "#fff", color: "#3c3e3a" };
  const inputClass =
    "mt-1 w-full rounded-md border border-[#dedcd4] bg-white px-2.5 py-2 text-sm text-[#20211f] outline-none focus:border-[#20211f]";

  return (
    <dialog
      ref={dialogRef}
      aria-label={`פרטי ה${kindWord(asset)}`}
      onClose={onClose}
      onClick={(event) => {
        // The backdrop is the dialog element itself; a tap on the sheet lands on a child.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-white p-0 text-right backdrop:bg-[#20211f]/45 sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#efeee9] bg-white px-4 py-2.5">
        <p className="text-sm font-black text-[#20211f]">פרטי ה{kindWord(asset)}</p>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="סגירה"
          title="סגירה"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-[#5e6159] hover:bg-[#f4f3ee] hover:text-[#20211f]"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="relative h-56 w-full bg-[#f4f3ee] sm:h-72">
        <Preview asset={asset} mode="sheet" />
      </div>

      <div className="space-y-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {editing ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-[#20211f]">תיאור</span>
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                rows={3}
                className={`${inputClass} leading-6`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-[#20211f]">תגיות</span>
              <span className="mt-0.5 block text-[11px] text-[#8b8e84]">מופרדות בפסיק</span>
              <input
                value={draftTags}
                onChange={(event) => setDraftTags(event.target.value)}
                placeholder="חלות, מחמצת, שישי"
                className={inputClass}
              />
            </label>
            {tagSuggestions.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[#8b8e84]">תגיות שכבר יש:</span>
                {tagSuggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setDraftTags((prev) => (prev.trim() ? `${prev.replace(/,\s*$/, "")}, ${tag}` : tag))}
                    className="rounded-full border border-[#dedcd4] bg-[#f8f7f4] px-2 py-0.5 text-[11px] text-[#5e6159] hover:border-[#8b8e84]"
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
            {asset.description.trim() ? (
              <p className="text-sm leading-6 text-[#3c3e3a]">{asset.description}</p>
            ) : (
              <p className="text-sm leading-6 text-[#8b8e84]">
                אין עדיין תיאור. ״ניתוח מחדש״ יכתוב תיאור ותגיות מהתמונה עצמה.
              </p>
            )}

            {asset.tags.length ? (
              <ul className="flex flex-wrap gap-1.5">
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
              <p className="text-[11px] text-[#8b8e84]">אין תגיות עדיין.</p>
            )}

            <p className="text-[11px] text-[#8b8e84]">
              {SOURCE_LABEL[asset.source]}
              {formatDate(asset.created_at) ? ` · ${formatDate(asset.created_at)}` : ""}
              {dimensions ? (
                <>
                  {" · "}
                  {/* width×height reads left to right; unisolated, RTL shows it swapped. */}
                  <bdi dir="ltr">{dimensions}</bdi>
                </>
              ) : null}
            </p>
            {asset.source_url ? (
              <a
                href={asset.source_url}
                target="_blank"
                rel="noreferrer"
                dir="ltr"
                className="block truncate text-[11px] text-[#8b8e84] underline underline-offset-4 hover:text-[#20211f]"
                title={asset.source_url}
              >
                {asset.source_url}
              </a>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-[#efeee9] pt-3">
              <button
                type="button"
                onClick={() => setEditing(true)}
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
                  className={`${buttonClass} ms-auto`}
                  style={{ ...quietButton, color: "#9f4330" }}
                >
                  מחיקה
                </button>
              )}
            </div>

            {confirmingDelete ? (
              <p className="text-[11px] leading-5 text-[#9f4330]">
                המחיקה תסיר את ה{kindWord(asset)} מהספרייה. אין דרך חזרה.
              </p>
            ) : null}
          </>
        )}

        {error ? <p className="text-[11px] leading-5 text-[#9f4330]">{error}</p> : null}
      </div>
    </dialog>
  );
}
