"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
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
  const fileInput = useRef<HTMLInputElement>(null);

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
      if (res.assets.length) setUrl("");
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
  // Same client-side demo read the plan screen does: it only ever changes the note above
  // the grid, never which data the screen is allowed to show.
  const demo = isDemo();

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <SectionHeader
          section="assets"
          title="הנכסים שלי"
          subtitle="התמונות והסרטונים שלכם — מהטלפון, מקישור או ישר מהאתר. על כל נכס אנחנו כותבים תיאור ותגיות, ומשם הפוסטים נבנים."
        />

        {demo ? (
          <p className="mb-5 rounded-md border px-4 py-2 text-xs" style={{ borderColor: identity.border, background: identity.surface, color: identity.accent }}>
            מצב הדגמה — הספרייה לדוגמה, והניתוח מדומה.
          </p>
        ) : null}

        {loadError ? (
          <p className="mb-5 rounded-md border border-[#eed1c9] bg-[#fbf2ef] px-4 py-3 text-sm text-[#9f4330]">{loadError}</p>
        ) : null}

        <section className="rounded-lg border border-[#e6e4dc] bg-white p-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex flex-wrap items-center gap-2">
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
                className="inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-bold text-white transition-colors disabled:cursor-default disabled:opacity-60"
                style={{ background: identity.accent }}
              >
                <IconImage className="h-4 w-4" />
                {Object.values(pending).includes("uploading") ? "מעלה…" : "העלאת תמונות או סרטונים"}
              </button>
              <span className="text-xs text-[#8b8e84]">אפשר לבחור כמה קבצים בבת אחת</span>
            </div>

            <span aria-hidden className="hidden h-8 w-px bg-[#e6e4dc] sm:block" />

            <form onSubmit={(event) => void handleImport(event)} className="flex flex-wrap items-center gap-2">
              <input
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
                style={{ borderColor: identity.border, background: identity.surface, color: identity.accent }}
              >
                <IconLink className="h-4 w-4" />
                {importing ? "מייבא…" : "ייבוא מקישור"}
              </button>
            </form>

            <span aria-hidden className="hidden h-8 w-px bg-[#e6e4dc] sm:block" />

            <button
              type="button"
              onClick={() => void handleScan()}
              disabled={scanning || busy}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#dedcd4] bg-white px-4 text-sm font-bold text-[#20211f] transition-colors hover:bg-[#f8f7f4] disabled:cursor-default disabled:opacity-50"
            >
              <IconEye className="h-4 w-4" />
              {scanning ? "סורק את האתר…" : "סריקה מעמיקה של האתר"}
            </button>
          </div>

          {scanning ? (
            <p className="mt-4 rounded-md border px-3 py-2 text-xs leading-5" style={{ borderColor: identity.border, background: identity.surface, color: identity.accent }}>
              הסריקה עוברת על דפי האתר ומאתרת תמונות. היא יכולה לקחת כמה דקות — אפשר להשאיר את החלון פתוח.
            </p>
          ) : null}

          {scanResult ? <p className="mt-4 text-sm leading-6 text-[#3c3e3a]">{scanResult}</p> : null}
          {notice ? <p className="mt-3 text-sm leading-6 text-[#3c3e3a]">{notice}</p> : null}

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
        </section>

        {loading ? (
          <LoadingMark label="טוען את הנכסים…" />
        ) : assets.length ? (
          <>
            <div className="mt-7 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[#8b8e84]">
                {countLabel(assets.length, "נכס", "נכסים")} בספרייה · {countLabel(imageCount, "תמונה", "תמונות")} ·{" "}
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
          <section className="mt-7 rounded-lg border border-[#e6e4dc] bg-white p-8 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full" style={{ background: identity.surface, color: identity.accent }}>
              <IconImage className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-lg font-black text-[#20211f]">הספרייה עוד ריקה</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#5e6159]">
              כאן חיים התמונות והסרטונים של העסק. ברגע שנכס נמצא בספרייה, אנחנו מנתחים אותו וכותבים תיאור ותגיות — וכל
              פוסט יכול להיבנות סביב התמונה האמיתית שלכם במקום תמונה כללית.
            </p>
            <ul className="mx-auto mt-4 max-w-xl space-y-1.5 text-right text-sm leading-6 text-[#3c3e3a]">
              <li>· העלו תמונות וסרטונים מהטלפון או מהמחשב</li>
              <li>· ייבאו תמונה מקישור אחד בודד</li>
              <li>· או הריצו סריקה מעמיקה שתאסוף תמונות מהאתר שלכם</li>
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
