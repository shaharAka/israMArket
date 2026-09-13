"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AssetCard } from "@/components/AssetCard";
import { LoadingMark } from "@/components/Doodles";
import { SectionHeader } from "@/components/SectionHeader";
import { endpoints, isDemo, type Asset } from "@/lib/api";
import { IconArrowLeft, IconEye, IconImage, IconLink, IconSparkles } from "@/lib/icons";
import { SECTIONS } from "@/lib/sections";
import { toast } from "@/lib/ui";

const identity = SECTIONS.assets;

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

/** Hebrew needs the verb to agree with the count, and "1 נכסים" reads as broken. */
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
 * The asset library.
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
 * not a second ask: both live behind the one `הוספה בדרך אחרת` disclosure. Nothing is
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
        if (active) setLoadError(message(err, "טעינת הנכסים נכשלה"));
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
        failures.push(`${file.name}: ${message(err, "ההעלאה נכשלה")}`);
        setPending((prev) => ({ ...prev, [file.name]: "error" }));
      }
    }

    if (added.length) {
      setAssets((prev) => mergeAssets(prev, added));
      toast(countLabel(added.length, "נכס נוסף לספרייה", "נכסים נוספו לספרייה"));
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
          ? `${countLabel(res.assets.length, "נכס יובא", "נכסים יובאו")} מהקישור, ו-${res.skipped} דולגו (כבר קיימים או לא נתמכים).`
          : `${countLabel(res.assets.length, "נכס יובא", "נכסים יובאו")} מהקישור.`
      );
      if (res.assets.length) {
        setUrl("");
        setAddOpen(false);
      }
    } catch (err) {
      setLoadError(message(err, "הייבוא מהקישור נכשל"));
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
          ? `הסריקה מצאה ${countLabel(res.assets.length, "תמונה חדשה", "תמונות חדשות")} באתר.${
              res.skipped ? ` ${countLabel(res.skipped, "תמונה דולגה", "תמונות דולגו")} — כבר היו בספרייה.` : ""
            }`
          : res.skipped
            ? `לא נמצאו תמונות חדשות. ${countLabel(res.skipped, "תמונה שכבר יש", "תמונות שכבר יש")} בספרייה.`
            : "לא נמצאו תמונות באתר."
      );
      toast("הסריקה הסתיימה");
    } catch (err) {
      setLoadError(message(err, "סריקת האתר נכשלה"));
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
    toast("הנכס נמחק");
  }

  const imageCount = assets.filter((asset) => asset.kind === "image").length;
  const busy = importing || scanning || Object.values(pending).includes("uploading");
  // Tags already in the library, offered as one-tap suggestions while editing. Built once
  // for the whole set rather than once per card.
  const libraryTags = useMemo(
    () => Array.from(new Set(assets.flatMap((asset) => asset.tags))).sort((a, b) => a.localeCompare(b, "he")),
    [assets]
  );
  const uploadLabel = Object.values(pending).includes("uploading") ? "מעלה…" : "העלאת קובץ מהמכשיר";

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <SectionHeader
          section="assets"
          title="הנכסים שלי"
          subtitle="התמונות והסרטונים שלכם. על כל נכס אנחנו כותבים תיאור ותגיות, ומשם הפוסטים נבנים."
          action={
            <button
              type="button"
              onClick={() => void handleScan()}
              disabled={scanning || busy}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#20211f] px-4 text-sm font-bold text-white transition-colors hover:bg-[#343632] disabled:cursor-default disabled:opacity-60"
            >
              <IconEye className="h-4 w-4" />
              {scanning ? "סורק את האתר…" : "סריקה מעמיקה של האתר"}
            </button>
          }
        />

        {demo ? (
          <p className="mb-5 text-xs" style={{ color: identity.accent }}>
            מצב הדגמה — הספרייה לדוגמה.
          </p>
        ) : null}

        {/* One disclosure holds the two other ways in. Closed by default, so the page opens
            on the library rather than on a toolbar; open by one click for anyone who came
            here to upload or to paste a link. */}
        <section className="rounded-lg border border-[#e6e4dc] bg-white">
          <button
            type="button"
            onClick={() => setAddOpen((prev) => !prev)}
            aria-expanded={addOpen}
            className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-5 text-sm font-bold text-[#5e6159] transition-colors hover:text-[#20211f]"
          >
            <span className="flex items-center gap-2">
              <IconImage className="h-4 w-4" />
              הוספה בדרך אחרת
            </span>
            <span aria-hidden className="text-xs text-[#8b8e84]">
              {addOpen ? "▲" : "▼"}
            </span>
          </button>

          {addOpen ? (
            <div className="space-y-4 border-t border-[#e6e4dc] px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
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
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-bold transition-colors disabled:cursor-default disabled:opacity-50"
                  style={{ borderColor: identity.border, background: identity.surface, color: identity.accent }}
                >
                  <IconImage className="h-4 w-4" />
                  {uploadLabel}
                </button>
                <span className="text-xs text-[#8b8e84]">אפשר לבחור כמה קבצים בבת אחת</span>
              </div>

              <form onSubmit={(event) => void handleImport(event)} className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="asset-import-url">
                  כתובת הקישור לייבוא
                </label>
                <input
                  id="asset-import-url"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://..."
                  dir="ltr"
                  className="min-h-11 w-64 rounded-md border border-[#dedcd4] bg-white px-3 text-sm text-[#20211f] outline-none focus:border-[#7d4436]"
                />
                <button
                  type="submit"
                  disabled={importing || busy || !url.trim()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-bold transition-colors disabled:cursor-default disabled:opacity-50"
                  style={{ borderColor: "#dedcd4", background: "#fff", color: "#3c3e3a" }}
                >
                  <IconLink className="h-4 w-4" />
                  {importing ? "מייבא…" : "ייבוא מקישור"}
                </button>
                <span className="text-xs text-[#8b8e84]">קישור לתמונה בודדת מהרשת.</span>
              </form>
            </div>
          ) : null}
        </section>

        {/* Everything the scan and the import have to say, in one place under the button
            that starts them. */}
        {scanning ? (
          <p className="mt-4 text-xs leading-5" style={{ color: identity.accent }}>
            הסריקה עוברת על דפי האתר ומאתרת תמונות. היא יכולה לקחת כמה דקות — אפשר להשאיר את החלון פתוח.
          </p>
        ) : null}
        {scanResult ? <p className="mt-4 text-sm leading-6 text-[#3c3e3a]">{scanResult}</p> : null}
        {notice ? <p className="mt-3 text-sm leading-6 text-[#3c3e3a]">{notice}</p> : null}
        {loadError ? <p className="mt-3 text-sm leading-6 text-[#9f4330]">{loadError}</p> : null}

        {Object.keys(pending).length ? (
          <ul className="mt-4 space-y-1.5">
            {Object.entries(pending).map(([name, state]) => (
              <li key={name} className="flex items-center gap-2 text-xs text-[#5e6159]">
                {state === "uploading" ? (
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: identity.accent }} />
                ) : (
                  <IconSparkles className="h-3.5 w-3.5" />
                )}
                <span className="truncate">{name}</span>
                <span className="text-[#8b8e84]">
                  {state === "uploading" ? "מעלה ומנתח…" : state === "done" ? "נוסף" : "נכשל"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {fileError ? <p className="mt-3 text-sm leading-6 text-[#9f4330]">{fileError}</p> : null}

        {loading ? (
          <LoadingMark label="טוען את הנכסים…" />
        ) : assets.length ? (
          <>
            <div className="mt-7 flex flex-wrap items-center justify-between gap-2">
              {/* All three counts, always — including a zero. The split is real
                  information about what is in the library, and hiding the zero was the
                  first draft's mistake, not a saving. */}
              <p className="text-xs text-[#8b8e84]">
                {countLabel(assets.length, "נכס", "נכסים")} ·{" "}
                {countLabel(imageCount, "תמונה", "תמונות")} ·{" "}
                {countLabel(assets.length - imageCount, "סרטון", "סרטונים")}
              </p>
              <Link href="/posts" className="inline-flex items-center gap-2 text-sm font-bold text-[#20211f] underline underline-offset-4">
                <IconArrowLeft className="h-4 w-4" />
                לפוסטים שנבנים מהנכסים
              </Link>
            </div>

            <ul className="mt-4 space-y-4">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <AssetCard
                    asset={asset}
                    libraryTags={libraryTags}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onRedescribe={handleDescribe}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : loadError ? null : (
          // The empty state asks for the one thing the page asks for everywhere else and
          // stops. It used to explain the whole feature — what an asset is, what happens
          // after analysis, what a post does with it — which is the subtitle's job, and
          // was most of the words on an empty screen. Upload and link import are already
          // one click up in `הוספה בדרך אחרת`.
          <section className="mt-7 rounded-lg border border-[#e6e4dc] bg-white p-8 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full" style={{ background: identity.surface, color: identity.accent }}>
              <IconImage className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-black text-[#20211f]">הספרייה עוד ריקה</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#5e6159]">
              סריקה מעמיקה של האתר תאסוף מכאן את התמונות והסרטונים של העסק.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
