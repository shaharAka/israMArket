"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import { useEffect, useRef, useState } from "react";
import type { Asset, AssetSource } from "@/lib/api";
import { IconCheck, IconEye, IconImage, IconPen, IconSparkles, IconTrash } from "@/lib/icons";
import ui from "@/components/posts/chrome.module.css";

/** Where each file came from, in the owner's words. */
const SOURCE_LABEL: Record<AssetSource, string> = {
  upload: "העליתם בעצמכם",
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
      className={`pointer-events-none absolute inset-0 m-auto flex ${box} items-center justify-center rounded-full bg-[var(--ink)]/65 text-white shadow-[var(--shadow-pop)] backdrop-blur-sm`}
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
      className="absolute inset-0 bg-[linear-gradient(160deg,var(--primary-soft),var(--rule-dark))]"
    />
  );
}

/** The thumbnail, shared by the grid tile and the sheet's preview. */
function Preview({ asset, mode }: { asset: Asset; mode: "tile" | "sheet" }) {
  const t = useCopy();
  const [broken, setBroken] = useState(false);
  const label = asset.description.trim() || t("{arg_0} בלי תיאור", { arg_0: kindWord(asset) });
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
          <span className="absolute inset-x-0 bottom-3 text-center text-xs text-[var(--ink-soft)]">
            <Copy text="אי אפשר להציג את הסרטון כאן" /></span>
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
    <span className="flex h-full w-full items-center justify-center text-[var(--ink-faint)]" title={t("אין תצוגה מקדימה")}>
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
  const t = useCopy();
  const described = Boolean(asset.description.trim());
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("{arg_0}: {arg_1}. לפתוח את הפרטים", { arg_0: kindWord(asset), arg_1: asset.description.trim() || "בלי תיאור" })}
      title={asset.description.trim() || undefined}
      className="group relative block aspect-square w-full cursor-pointer overflow-hidden rounded-[14px] bg-[var(--soft)] shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(.2,.7,.2,1)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[14px] after:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_8%,transparent)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <Preview asset={asset} mode="tile" />
      {/* The one status worth seeing from the grid: a file the posts cannot use yet. */}
      {described ? null : (
        <span className="absolute right-2 bottom-2 z-[1] inline-flex items-center gap-1.5 rounded-full bg-[var(--paper)]/92 px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-soft)] shadow-[var(--shadow-card)] backdrop-blur-sm">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--sun)]" />
          <Copy text="בלי תיאור" /></span>
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
  const t = useCopy();
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
      setError(err instanceof Error ? err.message : t("לא הצלחנו לעדכן את התיאור"));
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
      setError(err instanceof Error ? err.message : t("לא הצלחנו לשמור"));
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
      setError(err instanceof Error ? err.message : t("לא הצלחנו למחוק"));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const inputClass = `${ui.field} mt-2`;

  return (
    <dialog
      ref={dialogRef}
      aria-label={t("פרטי ה{arg_0}", { arg_0: kindWord(asset) })}
      onClose={onClose}
      onClick={(event) => {
        // The backdrop is the dialog element itself; a tap on the sheet lands on a child.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-[20px] bg-[var(--paper)] p-0 text-right text-[var(--ink)] shadow-[var(--shadow-pop)] backdrop:bg-[var(--ink)]/40 sm:m-auto sm:max-w-lg sm:rounded-[20px]"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--rule)] bg-[var(--paper)]/95 pe-2 ps-5 py-2 backdrop-blur-sm">
        <p className="text-base font-bold tracking-tight text-[var(--ink)]"><Copy text="פרטי ה" />{kindWord(asset)}</p>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={t("לסגור")}
          title={t("לסגור")}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--soft)] hover:text-[var(--ink)]"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="relative h-56 w-full bg-[var(--soft)] sm:h-72">
        <Preview asset={asset} mode="sheet" />
      </div>

      <div className="space-y-4 px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {editing ? (
          <div className="space-y-4">
            <label className="block">
              <span className={ui.groupTitle}><Copy text="תיאור" /></span>
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                rows={3}
                className={`${inputClass} leading-6`}
              />
            </label>
            <label className="block">
              <span className={ui.groupTitle}><Copy text="תגיות" /></span>
              <span className={`${ui.help} block`}><Copy text="הפרידו בפסיק" /></span>
              <input
                value={draftTags}
                onChange={(event) => setDraftTags(event.target.value)}
                placeholder={t("חלות, מחמצת, שישי")}
                className={inputClass}
              />
            </label>
            {tagSuggestions.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className={ui.help}><Copy text="תגיות שכבר יש:" /></span>
                {tagSuggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setDraftTags((prev) => (prev.trim() ? `${prev.replace(/,\s*$/, "")}, ${tag}` : tag))}
                    className={`${ui.chip} min-h-8 px-3 text-xs font-medium`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
              <button
                type="button"
                onClick={() => void runSave()}
                disabled={saving}
                className="drawn-button inline-flex min-h-11 items-center gap-2 bg-[var(--primary)] px-5 text-sm text-white enabled:hover:bg-[var(--primary-dark)]"
              >
                <IconCheck className="h-4 w-4" />
                {saving ? t("שומרים…") : t("לשמור")}
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
                className={`${ui.link} ${ui.linkQuiet}`}
              >
                <Copy text="לבטל" /></button>
            </div>
          </div>
        ) : (
          <>
            {asset.description.trim() ? (
              <p className="text-[15px] leading-7 text-[var(--ink)]">{asset.description}</p>
            ) : (
              <p className="text-[15px] leading-7 text-[var(--ink-muted)]">
                <Copy text="עדיין אין תיאור. לחצו ״לכתוב תיאור מחדש״, ונכתוב תיאור ותגיות לפי מה שרואים בתמונה." /></p>
            )}

            {asset.tags.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {asset.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-medium text-[var(--primary-dark)]"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={ui.help}><Copy text="עדיין אין תגיות." /></p>
            )}

            <p className={`${ui.meta} font-normal`}>
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
                className="-mt-2 block truncate text-xs text-[var(--ink-muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
                title={asset.source_url}
              >
                {asset.source_url}
              </a>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule)] pt-4">
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={busy}
                className={ui.button}
              >
                <IconPen />
                <Copy text="לערוך" /></button>
              <button
                type="button"
                onClick={() => void runDescribe()}
                disabled={busy}
                className={ui.button}
              >
                {describing ? <IconEye /> : <IconSparkles />}
                {describing ? t("כותבים תיאור…") : t("לכתוב תיאור מחדש")}
              </button>
              {confirmingDelete ? (
                <>
                  <button
                    type="button"
                    onClick={() => void runDelete()}
                    disabled={deleting}
                    className={`${ui.button} border-[var(--danger-rule)] bg-[var(--danger-soft)] text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[var(--danger-soft)]`}
                  >
                    {deleting ? t("מוחקים…") : t("כן, למחוק")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className={`${ui.link} ${ui.linkQuiet} px-2`}
                  >
                    <Copy text="לא, להשאיר" /></button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={busy}
                  className={`${ui.link} ms-auto px-2 text-[var(--danger)] hover:text-[var(--danger)]`}
                >
                  <IconTrash />
                  <Copy text="למחוק" /></button>
              )}
            </div>

            {confirmingDelete ? (
              <p className="text-[13px] leading-6 text-[var(--danger)]">
                {asset.kind === "video" ? t("הסרטון יימחק") : t("התמונה תימחק")}<Copy text=", ולא יהיה אפשר לשחזר." /></p>
            ) : null}
          </>
        )}

        {error ? <p className={ui.error}>{error}</p> : null}
      </div>
    </dialog>
  );
}
