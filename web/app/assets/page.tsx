"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AssetSheet, AssetTile } from "@/components/AssetCard";
import { LoadingMark } from "@/components/Doodles";
import { SectionHeader } from "@/components/SectionHeader";
import { StepLink } from "@/components/trial/StepLink";
import { endpoints, isDemo, type Asset } from "@/lib/api";
import ui from "@/components/posts/chrome.module.css";
import { IconArrowLeft, IconCheck, IconChevron, IconEye, IconImage, IconLink } from "@/lib/icons";
import { toast } from "@/lib/ui";

/**
 * The demo flag lives in localStorage, so it may only be read on the client — a server
 * render would disagree and hydration would warn. `useSyncExternalStore` is the sanctioned
 * way to read a client-only value during render: the server snapshot is `false`, the
 * client snapshot is the real flag, and React reconciles the two after hydration.
 * Nothing writes it while the page is open, so the subscription is a no-op that still
 * keeps the value live if another tab flips it.
 */
function subscribeDemo(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function demoSnapshot() {
  return isDemo();
}
function demoServerSnapshot() {
  return false;
}

/** Hebrew needs the verb to agree with the count, and "1 תמונות" reads as broken. */
function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function message(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Newest first, replacing anything we already hold with the server's version. */
function mergeAssets(current: Asset[], incoming: Asset[]) {
  const byId = new Map<number, Asset>();
  current.forEach((asset) => byId.set(asset.id, asset));
  incoming.forEach((asset) => byId.set(asset.id, asset));
  return Array.from(byId.values()).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
}

/**
 * התמונות שלי — the business's own photos and clips.
 *
 * It was called "הנכסים שלי" (my assets), which is the trade's word, not the owner's. On a
 * phone it is now a two-across grid of thumbnails; a tap opens one file's description,
 * tags and actions in a sheet, so four photos fit on one screen instead of two and a half.
 *
 * Businesses could generate post images but had nowhere to put their own — every post was
 * written around whatever the model invented. This screen is the supply side: upload from
 * the phone, pull a picture from a link, or let the deep scan walk their own website, and
 * the AI pass writes the description and tags that the post editor then works from.
 *
 * The page has ONE ask: the deep site scan. It is the only one of the three ways in that
 * the owner cannot do anywhere else in the app — and it is the only one that fills the
 * whole library at once, from their own site, without them hunting for files. So it is the
 * dark button in the header, on an empty library as much as a full one.
 *
 * Uploading and importing a link stay fully available, but they are the *other* ways in,
 * not a second ask: both live behind the one `להעלות מהטלפון או מקישור` disclosure. Nothing is
 * hidden from the audit — the page simply opens on the library instead of on a toolbar.
 */
export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [fileError, setFileError] = useState("");
  const [pending, setPending] = useState<Record<string, "uploading" | "done" | "error">>({});
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const demo = useSyncExternalStore(subscribeDemo, demoSnapshot, demoServerSnapshot);

  useEffect(() => {
    // Only the async result is state — nothing is set synchronously in the effect, so a
    // first run does not cascade a second render before the request even starts.
    let active = true;
    async function firstLoad() {
      try {
        const res = await endpoints.assets();
        if (!active) return;
        setAssets(mergeAssets([], res.assets));
        setLoadError("");
      } catch (err) {
        if (active) setLoadError(message(err, "לא הצלחנו לטעון את התמונות"));
      } finally {
        if (active) setLoading(false);
      }
    }
    void firstLoad();
    return () => {
      active = false;
    };
  }, []);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Reset immediately so picking the same file twice still fires a change event.
    event.target.value = "";
    if (!files.length) return;

    setFileError("");
    setPending(Object.fromEntries(files.map((file) => [file.name, "uploading" as const])));
    const added: Asset[] = [];
    const failures: string[] = [];

    for (const file of files) {
      try {
        const res = await endpoints.uploadAsset(file);
        added.push(res.asset);
        setPending((prev) => ({ ...prev, [file.name]: "done" }));
      } catch (err) {
        failures.push(`${file.name}: ${message(err, "לא הצלחנו להעלות")}`);
        setPending((prev) => ({ ...prev, [file.name]: "error" }));
      }
    }

    if (added.length) {
      setAssets((prev) => mergeAssets(prev, added));
      toast(countLabel(added.length, "קובץ נוסף לתמונות שלכם", "קבצים נוספו לתמונות שלכם"));
    }
    if (failures.length) {
      setFileError(failures.join(" · "));
    } else {
      // Keep a failed file's row on screen so its "נכשל" label stays next to the reason.
      setPending({});
      // Everything landed: fold the disclosure away and give the library back its page.
      setAddOpen(false);
    }
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setImporting(true);
    setLoadError("");
    setNotice("");
    try {
      const res = await endpoints.importAssetsFromUrl(trimmed);
      if (res.assets.length) setAssets((prev) => mergeAssets(prev, res.assets));
      setNotice(
        res.skipped
          ? `הוספנו ${countLabel(res.assets.length, "קובץ", "קבצים")} מהקישור. ${res.skipped} לא נוספו, כי כבר היו כאן או שאי אפשר להשתמש בהם.`
          : `הוספנו ${countLabel(res.assets.length, "קובץ", "קבצים")} מהקישור.`
      );
      if (res.assets.length) {
        setUrl("");
        setAddOpen(false);
      }
    } catch (err) {
      setLoadError(message(err, "לא הצלחנו להביא את הקובץ מהקישור"));
    } finally {
      setImporting(false);
    }
  }

  async function handleScan() {
    setScanning(true);
    setScanResult("");
    setLoadError("");
    try {
      const res = await endpoints.scanSiteForAssets();
      if (res.assets.length) setAssets((prev) => mergeAssets(prev, res.assets));
      setScanResult(
        res.assets.length
          ? `מצאנו באתר ${countLabel(res.assets.length, "תמונה חדשה", "תמונות חדשות")}.${
              res.skipped ? ` ${countLabel(res.skipped, "תמונה כבר הייתה כאן", "תמונות כבר היו כאן")}, ולא הוספנו אותן שוב.` : ""
            }`
          : res.skipped
            ? `לא מצאנו תמונות חדשות. ${countLabel(res.skipped, "תמונה כבר הייתה כאן", "תמונות כבר היו כאן")}.`
            : "לא מצאנו תמונות באתר."
      );
      toast("סיימנו לעבור על האתר");
    } catch (err) {
      setLoadError(message(err, "לא הצלחנו לעבור על האתר"));
    } finally {
      setScanning(false);
    }
  }

  async function handleSave(id: number, patch: { description: string; tags: string[] }) {
    const res = await endpoints.updateAsset(id, patch);
    setAssets((prev) => mergeAssets(prev, [res.asset]));
    toast("השינויים נשמרו");
  }

  async function handleDescribe(id: number) {
    const res = await endpoints.describeAsset(id);
    setAssets((prev) => mergeAssets(prev, [res.asset]));
    toast("התיאור והתגיות עודכנו");
  }

  async function handleDelete(id: number) {
    await endpoints.deleteAsset(id);
    setAssets((prev) => prev.filter((asset) => asset.id !== id));
    toast("נמחק");
  }

  const imageCount = assets.filter((asset) => asset.kind === "image").length;
  const busy = importing || scanning || Object.values(pending).includes("uploading");
  // Tags already in the library, offered as one-tap suggestions while editing. Built once
  // for the whole set rather than once per card.
  const libraryTags = useMemo(
    () => Array.from(new Set(assets.flatMap((asset) => asset.tags))).sort((a, b) => a.localeCompare(b, "he")),
    [assets]
  );
  const uploadLabel = Object.values(pending).includes("uploading") ? "מעלים…" : "להעלות קבצים";

  const openAsset = openId === null ? null : assets.find((asset) => asset.id === openId) ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <SectionHeader
          section="business"
          title="התמונות שלי"
          subtitle="אנחנו כותבים תיאור ותגיות לכל תמונה, ולפיהם בונים את הפוסטים."
          action={
            <button
              type="button"
              onClick={() => void handleScan()}
              disabled={scanning || busy}
              className="drawn-button inline-flex min-h-12 w-full items-center justify-center gap-2.5 bg-[var(--primary)] px-5 text-[15px] text-white enabled:hover:bg-[var(--primary-dark)] sm:w-auto"
            >
              <IconEye className="h-[18px] w-[18px]" />
              {scanning ? "אוספים מהאתר…" : "לאסוף את התמונות מהאתר"}
            </button>
          }
        />

        {demo ? (
          <p className={`${ui.meta} -mt-3 mb-4 font-normal`}>
            דמו: אלה תמונות לדוגמה.
          </p>
        ) : null}

        {/* One disclosure holds the two other ways in. Closed by default, so the page opens
            on the pictures rather than on a toolbar; open by one tap for anyone who came
            here to upload or to paste a link. */}
        <section className={`${ui.card} overflow-hidden`}>
          <button
            type="button"
            onClick={() => setAddOpen((prev) => !prev)}
            aria-expanded={addOpen}
            className="group flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-5 text-[15px] font-semibold text-[var(--ink)] transition-colors duration-200 hover:bg-[var(--soft)]"
          >
            <span className="flex items-center gap-3">
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--primary-soft)] text-[var(--primary)]">
                <IconImage className="h-[18px] w-[18px]" />
              </span>
              להעלות מהטלפון או מקישור
            </span>
            <IconChevron
              className={`h-4 w-4 shrink-0 text-[var(--ink-muted)] transition-transform duration-200 ${addOpen ? "rotate-90" : "-rotate-90"}`}
            />
          </button>

          {addOpen ? (
            <div className="space-y-5 border-t border-[var(--rule)] px-5 py-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={(event) => void handleFiles(event)}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                  className={ui.button}
                >
                  <IconImage />
                  {uploadLabel}
                </button>
                <span className={ui.help}>אפשר לבחור כמה קבצים בבת אחת</span>
              </div>

              <form onSubmit={(event) => void handleImport(event)} className="flex flex-wrap items-center gap-2 border-t border-[var(--rule)] pt-5">
                <label className="sr-only" htmlFor="asset-import-url">
                  קישור לתמונה
                </label>
                <input
                  id="asset-import-url"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://..."
                  dir="ltr"
                  className={`${ui.field} w-72 max-w-full text-left text-sm`}
                />
                <button
                  type="submit"
                  disabled={importing || busy || !url.trim()}
                  className={`${ui.button} ${ui.matchField}`}
                >
                  <IconLink />
                  {importing ? "מביאים…" : "להוסיף מקישור"}
                </button>
                <span className={`${ui.help} basis-full`}>קישור לתמונה אחת ברשת.</span>
              </form>
            </div>
          ) : null}
        </section>

        {/* Everything the scan and the import have to say, in one place under the button
            that starts them. */}
        {scanning ? (
          <p className="mt-5 flex items-center gap-2.5 text-sm leading-6 text-[color:var(--ink-soft)]">
            <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--primary)] motion-reduce:animate-none" />
            עוברים על דפי האתר ומחפשים תמונות. זה יכול לקחת כמה דקות, השאירו את החלון פתוח.
          </p>
        ) : null}
        {scanResult ? <p className="mt-5 text-[15px] leading-7 text-[color:var(--ink)]">{scanResult}</p> : null}
        {notice ? <p className="mt-4 text-[15px] leading-7 text-[color:var(--ink)]">{notice}</p> : null}
        {loadError ? <p className={`${ui.error} mt-4`}>{loadError}</p> : null}

        {Object.keys(pending).length ? (
          <ul className="mt-5 space-y-2">
            {Object.entries(pending).map(([name, state]) => (
              <li key={name} className="flex items-center gap-2.5 text-[13px] text-[var(--ink-soft)]">
                {state === "uploading" ? (
                  <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--primary)] motion-reduce:animate-none" />
                ) : state === "done" ? (
                  <IconCheck className="h-3.5 w-3.5 shrink-0 text-[var(--good)]" />
                ) : (
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--danger)]" />
                )}
                <span className="truncate">{name}</span>
                <span className="text-[var(--ink-muted)]">
                  {state === "uploading" ? "מעלים ובודקים…" : state === "done" ? "נוסף" : "נכשל"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {fileError ? <p className={`${ui.error} mt-4`}>{fileError}</p> : null}

        {loading ? (
          <LoadingMark label="טוענים את התמונות…" />
        ) : assets.length ? (
          <>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-x-4">
              {/* Both counts, always — including a zero. The split is real information
                  about what is in the library; the total is the two added up. */}
              <p className={ui.meta}>
                {countLabel(imageCount, "תמונה", "תמונות")} ·{" "}
                {countLabel(assets.length - imageCount, "סרטון", "סרטונים")}
              </p>
              <Link href="/posts" className={ui.link}>
                לפוסטים שבנינו מהן
                <IconArrowLeft data-forward="" />
              </Link>
            </div>

            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <AssetTile asset={asset} onOpen={() => setOpenId(asset.id)} />
                </li>
              ))}
            </ul>

            {openAsset ? (
              <AssetSheet
                key={openAsset.id}
                asset={openAsset}
                libraryTags={libraryTags}
                onClose={() => setOpenId(null)}
                onSave={handleSave}
                onDelete={handleDelete}
                onRedescribe={handleDescribe}
              />
            ) : null}
          </>
        ) : loadError ? null : (
          // The empty state asks for the one thing the page asks for everywhere else and
          // stops. Upload and link import are one tap up, in the disclosure.
          <section className={`${ui.card} mt-8 px-6 py-12 text-center`}>
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--primary-soft)] text-[var(--primary)]">
              <IconImage className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-bold tracking-tight text-[var(--ink)]">עוד אין כאן תמונות</h2>
            <p className="mx-auto mt-2 max-w-xl text-[15px] leading-7 text-[var(--ink-soft)]">
              לחצו על ״לאסוף את התמונות מהאתר״, ונביא לכאן את התמונות והסרטונים של העסק.
            </p>
            <StepLink stepKey="photos" className="mt-2" />
          </section>
        )}
      </div>
    </AppShell>
  );
}
