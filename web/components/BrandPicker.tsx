"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { endpoints, type Asset, type BrandLanguage, type BrandSwatch, type Business } from "@/lib/api";
import { IconArrowLeft, IconImage } from "@/lib/icons";
import { toast } from "@/lib/ui";

/**
 * The brand panel, opened from the palette dots at the top of the app.
 *
 * The owner's colours and voice could only be edited inside the onboarding wizard, and
 * the media library was a separate nav page — one thing (the brand) spread over three
 * places. This panel puts them back together, one click from every screen.
 *
 * It renders its own trigger *and* its own panel, so the shell only has to place
 * `<BrandPicker variant="sidebar" />` in the desktop sidebar header and
 * `<BrandPicker variant="mobile" />` in the mobile top bar.
 */

/** The same mapping onboarding uses: the roles come from the API, the words from us. */
const ROLE_LABELS: Record<string, string> = {
  primary: "צבע ראשי",
  accent: "צבע הדגשה",
  background: "רקע",
  ink: "טקסט",
  secondary: "משני",
};

/** The dots are a hint, so a palette that has not loaded yet keeps the row's shape. */
const PLACEHOLDER_DOTS = ["#e6e4dc", "#dedcd4", "#e6e4dc", "#dedcd4", "#e6e4dc"];
const MAX_DOTS = 5;
const MAX_THUMBS = 6;
/** A native colour input fires on every frame of a drag; one save after the owner stops. */
const SAVE_DELAY_MS = 500;

function message(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** "1 נכסים" reads as broken Hebrew, so the noun agrees with the count. */
function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** A colour input only accepts a full 6-digit hex; anything else must not throw. */
function safeHex(hex: string) {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
}

/**
 * The two variants are mounted at the same moment (the shell hides one with CSS), so both
 * would fire the same read on every screen. Only the request *in flight* is shared: once
 * it settles the next reader starts fresh, which keeps a saved palette from being served
 * back out of a stale cache. A failed read is never kept.
 */
let inFlightBusiness: Promise<Business | null> | null = null;

function loadBusiness() {
  if (!inFlightBusiness) {
    inFlightBusiness = endpoints
      .business()
      .then((res) => res.business ?? null)
      .finally(() => {
        inFlightBusiness = null;
      });
  }
  return inFlightBusiness;
}

/** One tile of the media preview. */
function Thumb({ asset }: { asset: Asset }) {
  const className = "h-full w-full object-cover";
  if (!asset.url) {
    return (
      <span className="flex h-full w-full items-center justify-center text-[#b3b0a5]" title="אין תצוגה מקדימה">
        <IconImage className="h-5 w-5" />
      </span>
    );
  }
  if (asset.kind === "video") {
    // A clip needs a real <video> to paint a frame; an <img> pointed at an mp4 is broken.
    return (
      <video
        src={asset.url}
        muted
        playsInline
        preload="metadata"
        className={className}
        // Some browsers only paint a metadata-loaded video once told to seek.
        onLoadedMetadata={(event) => {
          event.currentTarget.currentTime = 0.1;
        }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- same-origin proxy path, not an optimizable remote URL
    <img src={asset.url} alt={asset.description || "נכס מהספרייה"} loading="lazy" className={className} />
  );
}

export function BrandPicker({ variant }: { variant: "sidebar" | "mobile" }) {
  const [open, setOpen] = useState(false);
  const [business, setBusiness] = useState<Business | null>(null);
  const [brand, setBrand] = useState<BrandLanguage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  /** Bumped by "נסו שוב" to re-run the brand read. */
  const [attempt, setAttempt] = useState(0);
  const [paletteNote, setPaletteNote] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [assetsError, setAssetsError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const wrapper = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | null>(null);
  const pendingPalette = useRef<BrandSwatch[] | null>(null);
  const saving = useRef(false);
  const panelId = useId();

  useEffect(() => {
    // Only the async result is state — nothing is set synchronously in the effect, so a
    // first run does not cascade a second render before the request even starts.
    let active = true;
    async function firstLoad() {
      try {
        const found = await loadBusiness();
        if (!active) return;
        setBusiness(found);
        setBrand(found?.brand_language ?? null);
        setState("ready");
      } catch (err) {
        if (!active) return;
        setLoadError(message(err, "קריאת המותג נכשלה"));
        setState("error");
      }
    }
    void firstLoad();
    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => {
    // The library is only worth a request once the owner opens the panel, and only the
    // first time — a panel closed mid-flight leaves `assetsLoaded` false and retries.
    if (!open || assetsLoaded) return;
    let active = true;
    async function load() {
      try {
        const res = await endpoints.assets();
        if (!active) return;
        setAssets(res.assets ?? []);
        setAssetsError("");
        setAssetsLoaded(true);
      } catch (err) {
        if (!active) return;
        setAssetsError(message(err, "הספרייה לא נטענה"));
        setAssetsLoaded(true);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [open, assetsLoaded]);

  /** Upload straight from the panel. Sending the owner to another screen to add the
   *  first photo is the friction this panel exists to remove. */
  async function uploadFiles(files: FileList | null) {
    if (!files?.length || uploading) return;
    setUploadError("");
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await endpoints.uploadAsset(file);
      }
      const res = await endpoints.assets();
      setAssets(res.assets ?? []);
      setAssetsLoaded(true);
      toast(files.length === 1 ? "הקובץ נוסף למדיה" : `${files.length} קבצים נוספו למדיה`);
    } catch (err) {
      setUploadError(message(err, "העלאה נכשלה"));
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      // The panel lives inside the wrapper, so a click inside it is contained here too.
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  function reloadBrand() {
    setState("loading");
    setLoadError("");
    setAttempt((count) => count + 1);
  }

  /**
   * The edit is optimistic — the dots move with the picker — and the save is debounced,
   * because dragging in a native colour input fires a change per frame and the endpoint
   * takes the whole palette anyway. The panel closes on the save that lands.
   */
  function updateSwatch(index: number, hex: string) {
    if (!brand) return;
    const next = brand.palette.map((swatch, i) => (i === index ? { ...swatch, hex } : swatch));
    setBrand({ ...brand, palette: next });
    setPaletteNote("");
    pendingPalette.current = next;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persistPalette(), SAVE_DELAY_MS);
  }

  async function persistPalette() {
    const palette = pendingPalette.current;
    if (!palette) return;
    if (saving.current) {
      // Another save is in flight; come back for the newest palette instead of racing it.
      saveTimer.current = window.setTimeout(() => void persistPalette(), SAVE_DELAY_MS);
      return;
    }
    pendingPalette.current = null;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    saving.current = true;
    setPaletteNote("שומרים…");
    try {
      const res = await endpoints.savePalette(palette);
      if (res.business) {
        setBusiness(res.business);
        if (res.business.brand_language) setBrand(res.business.brand_language);
      }
      setPaletteNote("");
      toast("הצבעים נשמרו ✓");
      close();
    } catch (err) {
      // The colour stays on screen so the owner can try again; the note says it did not stick.
      setPaletteNote(`שמירת הצבע נכשלה: ${message(err, "נסו שוב")}`);
    } finally {
      saving.current = false;
    }
  }

  const palette = brand?.palette ?? [];
  const dots = palette.length
    ? palette.slice(0, MAX_DOTS).map((swatch) => safeHex(swatch.hex))
    : PLACEHOLDER_DOTS;
  const dotSize = variant === "mobile" ? "h-2.5 w-2.5" : "h-3 w-3";
  const doSay = brand?.do_say ?? [];
  const dontSay = brand?.dont_say ?? [];
  const offers = brand?.offers_seen ?? [];
  const headerName = brand?.business_name || business?.name || "המותג שלי";
  const hasIdentity = Boolean(brand?.business_name || brand?.voice || doSay.length || dontSay.length || offers.length);

  return (
    <div ref={wrapper} className={variant === "sidebar" ? "relative" : undefined}>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "סגירת פאנל המותג" : "פתיחת פאנל המותג"}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        title="המותג: צבעים, קול ומדיה"
        className={`inline-flex cursor-pointer items-center rounded-md border border-[#dedcd4] bg-white transition-colors hover:bg-[#f8f7f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#20211f] ${
          variant === "mobile" ? "gap-1 px-2 py-1.5" : "w-full justify-between gap-2 px-2.5 py-2"
        }`}
      >
        <span aria-hidden className={variant === "mobile" ? "flex items-center gap-0.5" : "flex items-center gap-1.5"}>
          {dots.map((hex, index) => (
            <span
              key={`${hex}-${index}`}
              className={`${dotSize} shrink-0 rounded-full border border-[#dedcd4]`}
              style={{ background: hex }}
            />
          ))}
        </span>
        {variant === "sidebar" ? (
          <span className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-[#191b18]">המותג</span>
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-3.5 w-3.5 shrink-0 text-[#8b8e84] transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path d="M5.5 9L12 15.5L18.5 9" />
            </svg>
          </span>
        ) : (
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-3 w-3 shrink-0 text-[#8b8e84] transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M5.5 9L12 15.5L18.5 9" />
          </svg>
        )}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="פאנל המותג"
          className={
            variant === "sidebar"
              ? // Anchored to the trigger's container, under the button, opening over the
                // content: the sidebar is 16rem and the panel needs more room than that.
                "absolute top-full right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-[#dedcd4] bg-white shadow-xl"
              : // The mobile variant's wrapper is not positioned, so this resolves against
                // the sticky top bar itself: a full-width sheet hanging under the bar.
                "absolute inset-x-0 top-full z-50 overflow-hidden border-b border-[#dedcd4] bg-white shadow-xl"
          }
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#e6e4dc] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[#191b18]">{headerName}</p>
              <p className="mt-0.5 text-[11px] text-[#747570]">הצבעים, הקול והמדיה של העסק</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="סגירה"
              className="-mt-1 shrink-0 cursor-pointer rounded-md p-1 text-[#747570] transition-colors hover:bg-[#f4f3ee] hover:text-[#191b18] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#20211f]"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                className="h-4 w-4"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="max-h-[70vh] space-y-3 overflow-y-auto px-3 py-3 text-right">
            {state === "loading" ? (
              <p className="py-6 text-center text-xs text-[#8b8e84]">טוענים את המותג…</p>
            ) : state === "error" ? (
              <div className="rounded-lg border border-[#eed1c9] bg-[#fbf2ef] p-3">
                <p className="text-xs leading-5 text-[#9f4330]">{loadError}</p>
                <button
                  type="button"
                  onClick={reloadBrand}
                  className="mt-1.5 cursor-pointer text-[11px] font-bold text-[#9f4330] underline underline-offset-4"
                >
                  נסו שוב
                </button>
              </div>
            ) : !business ? (
              <section className="rounded-lg border border-[#e6e4dc] bg-[#faf8f5] p-4">
                <h3 className="text-xs font-bold text-[#191b18]">עוד אין עסק בחשבון</h3>
                <p className="mt-1.5 text-sm leading-6 text-[#5e6159]">
                  הצבעים, הקול והמדיה נבנים מהעסק עצמו. אפשר להתחיל את ההרשמה — בסופה כל מה שנלמד יופיע כאן.
                </p>
                <Link
                  href="/onboarding"
                  onClick={close}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#191b18] underline underline-offset-4"
                >
                  <IconArrowLeft className="h-3.5 w-3.5" />
                  להתחלת ההרשמה
                </Link>
              </section>
            ) : (
              <>
                {/* 1. הצבעים — what the owner came for, so they come first. */}
                {palette.length ? (
                  <section className="rounded-lg border border-[#e6e4dc] bg-[#faf8f5] p-3">
                    <h3 className="text-xs font-bold text-[#191b18]">צבעי המותג</h3>
                    <p className="mt-1 mb-2 text-[11px] leading-5 text-[#747570]">
                      לחיצה על עיגול פותחת את בורר הצבע. השינוי נשמר לבד.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {palette.map((swatch, index) => (
                        <label
                          key={`${swatch.role}-${index}`}
                          className="flex items-center gap-2 rounded-md border border-[#e6e4dc] bg-white px-2 py-1.5"
                        >
                          <input
                            type="color"
                            value={safeHex(swatch.hex)}
                            onChange={(event) => updateSwatch(index, event.target.value)}
                            className="h-7 w-7 shrink-0 cursor-pointer rounded-full border border-[#c7c4b8] bg-transparent p-0"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-bold text-[#191b18]">
                              {ROLE_LABELS[swatch.role] || swatch.role}
                            </span>
                            <span dir="ltr" className="block text-[11px] text-[#8b8e84]">
                              {safeHex(swatch.hex).toUpperCase()}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {paletteNote ? <p className="mt-2 text-[11px] font-bold text-[#5e6159]">{paletteNote}</p> : null}
                  </section>
                ) : (
                  <section className="rounded-lg border border-[#e6e4dc] bg-[#faf8f5] p-3">
                    <h3 className="text-xs font-bold text-[#191b18]">צבעי המותג</h3>
                    <p className="mt-1.5 text-xs leading-5 text-[#5e6159]">
                      לא נמצאו צבעים באתר. אפשר להריץ סריקה מחדש בהרשמה כדי שנלמד את הפלטה מחדש.
                    </p>
                  </section>
                )}

                {/* 2. הזהות — the name, the voice, and the words the extraction produced. */}
                {brand && hasIdentity ? (
                  <section className="rounded-lg border border-[#e6e4dc] bg-[#faf8f5] p-3">
                    <h3 className="text-xs font-bold text-[#191b18]">זהות המותג</h3>
                    <p className="mt-1.5 text-sm font-bold leading-6 text-[#191b18]">{headerName}</p>
                    {brand.voice ? (
                      <p className="mt-1 text-sm leading-6 text-[#3c3e3a]">
                        <span className="text-xs font-bold text-[#747570]">טון: </span>
                        {brand.voice}
                      </p>
                    ) : null}

                    {doSay.length ? (
                      <div className="mt-2">
                        <p className="text-[11px] font-bold text-[#374b3d]">מילים שכן</p>
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {doSay.map((word, index) => (
                            <li
                              key={`${word}-${index}`}
                              className="rounded border border-[#c7d6c2] bg-[#eaf0e6] px-1.5 py-0.5 text-[11px] font-bold text-[#374b3d]"
                            >
                              {word}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {dontSay.length ? (
                      <div className="mt-2">
                        <p className="text-[11px] font-bold text-[#9f4330]">מילים שלא</p>
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {dontSay.map((word, index) => (
                            <li
                              key={`${word}-${index}`}
                              className="rounded border border-[#eed1c9] bg-[#fbf2ef] px-1.5 py-0.5 text-[11px] font-bold text-[#9f4330]"
                            >
                              {word}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {offers.length ? (
                      <p className="mt-2 text-[11px] leading-5 text-[#8b8e84]">זוהה באתר: {offers.join(" · ")}</p>
                    ) : null}
                  </section>
                ) : (
                  <section className="rounded-lg border border-[#e6e4dc] bg-[#faf8f5] p-4">
                    <h3 className="text-xs font-bold text-[#191b18]">זהות המותג</h3>
                    <p className="mt-1.5 text-sm leading-6 text-[#5e6159]">
                      שפת המותג עוד לא נלמדה — אין כאן עדיין שם, טון או מילים. אפשר לסרוק את האתר בהרשמה, ומשם
                      הצבעים, הקול והמילים יופיעו כאן לבד.
                    </p>
                    <Link
                      href="/onboarding"
                      onClick={close}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#191b18] underline underline-offset-4"
                    >
                      <IconArrowLeft className="h-3.5 w-3.5" />
                      ללימוד שפת המותג
                    </Link>
                  </section>
                )}

                {/* 3. המדיה — a preview of the library, never a second library to manage. */}
                <section className="rounded-lg border border-[#e6e4dc] bg-[#faf8f5] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-[#191b18]">המדיה</h3>
                    <div className="flex items-center gap-2">
                      {assetsLoaded && !assetsError && assets.length ? (
                        <span className="text-[11px] text-[#8b8e84]">{countLabel(assets.length, "נכס", "נכסים")}</span>
                      ) : null}
                      {/* Adding a file belongs here, not one screen away. */}
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        disabled={uploading}
                        className="cursor-pointer rounded-md border border-[#dedcd4] bg-white px-2 py-1 text-[11px] font-bold text-[#191b18] hover:bg-[#f8f7f4] disabled:opacity-50"
                      >
                        {uploading ? "מעלים…" : "הוספת קובץ"}
                      </button>
                      <input
                        ref={fileInput}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          void uploadFiles(event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </div>
                  </div>

                  {uploadError ? (
                    <p className="mt-1.5 text-xs leading-5 text-[#9f4330]">{uploadError}</p>
                  ) : null}

                  {!assetsLoaded ? (
                    <p className="mt-1.5 text-xs text-[#8b8e84]">טוענים את הספרייה…</p>
                  ) : assetsError ? (
                    // A library that will not load must not take the rest of the panel with it.
                    <div className="mt-1.5">
                      <p className="text-xs leading-5 text-[#9f4330]">{assetsError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setAssetsError("");
                          setAssetsLoaded(false);
                        }}
                        className="mt-1 cursor-pointer text-[11px] font-bold text-[#9f4330] underline underline-offset-4"
                      >
                        נסו שוב
                      </button>
                    </div>
                  ) : assets.length ? (
                    <>
                      <ul className="mt-2 grid grid-cols-3 gap-2">
                        {assets.slice(0, MAX_THUMBS).map((asset) => (
                          <li
                            key={asset.id}
                            title={asset.description}
                            className="relative aspect-square overflow-hidden rounded-md border border-[#e6e4dc] bg-[#f4f3ee]"
                          >
                            <Thumb asset={asset} />
                            {asset.kind === "video" ? (
                              <span
                                className="absolute right-1 bottom-1 rounded px-1 py-0.5 text-[9px] font-bold text-white"
                                style={{ background: "#20211fcc" }}
                              >
                                וידאו
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <Link
                        href="/assets"
                        onClick={close}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#191b18] underline underline-offset-4"
                      >
                        <IconArrowLeft className="h-3.5 w-3.5" />
                        לכל המדיה
                      </Link>
                    </>
                  ) : (
                    <>
                      <p className="mt-1.5 text-xs leading-5 text-[#5e6159]">
                        הספרייה עוד ריקה. אפשר להוסיף קובץ מכאן, או לעבור לספרייה כדי לייבא מקישור
                        ולסרוק את האתר.
                      </p>
                      <Link
                        href="/assets"
                        onClick={close}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#191b18] underline underline-offset-4"
                      >
                        <IconArrowLeft className="h-3.5 w-3.5" />
                        לספרייה המלאה
                      </Link>
                    </>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
