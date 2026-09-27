"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { BrandMark, IconCheck } from "@/lib/icons";
import { endpoints } from "@/lib/api";
import {
  fetchSitePreview,
  looksLikeWebsite,
  normalizeWebsite,
  savePreview,
  type SitePreview,
} from "@/components/onboarding/preview";
import { BrandCard, SamplePostCard } from "@/components/onboarding/SitePreviewView";

/** What the wait is spent on, in the order it happens. Rotated while the scan runs. */
const READING_STEPS = ["קוראים את האתר…", "מזהים את הצבעים והסגנון…", "כותבים פוסט לדוגמה…"];

export default function Home() {
  const router = useRouter();
  const [website, setWebsite] = useState("");
  const [preview, setPreview] = useState<SitePreview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [readingStep, setReadingStep] = useState(0);
  const [openingDemo, setOpeningDemo] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(
      () => setReadingStep((current) => Math.min(current + 1, READING_STEPS.length - 1)),
      6000,
    );
    return () => window.clearInterval(timer);
  }, [pending]);

  /** Straight into the demo. It used to link to /login, where the demo was a second click. */
  async function openDemo() {
    setOpeningDemo(true);
    await endpoints.enterDemo();
    router.push("/dashboard");
  }

  async function onScan(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!looksLikeWebsite(website)) {
      setError("הזינו את כתובת האתר, למשל myshop.co.il");
      return;
    }
    const url = normalizeWebsite(website);
    setWebsite(url);
    setReadingStep(0);
    setPending(true);
    try {
      const result = await fetchSitePreview(url);
      setPreview(result);
      savePreview(result, url);
      window.requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: "start" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לקרוא את האתר");
    } finally {
      setPending(false);
    }
  }

  function startOver() {
    setPreview(null);
    setError("");
  }

  const site = preview?.url || website;
  const signupHref = `/signup?site=${encodeURIComponent(site)}`;

  return (
    <div className="min-h-screen bg-[#f9f8f6] text-[#191b18]">
      <header className="border-b border-[#e6e4dc] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-8 sm:py-4">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9 text-[#191b18]" />
            <div>
              <span className="block text-lg font-black tracking-tight">ישראמארקט</span>
              <span className="-mt-1 block text-[11px] text-[#5e6159]">שיווק לעסקים קטנים</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-[#191b18] underline-offset-4 hover:underline"
            >
              כניסה
            </Link>
            <button
              type="button"
              onClick={() => void openDemo()}
              disabled={openingDemo}
              className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-[#5e6159] underline-offset-4 hover:underline disabled:opacity-60"
            >
              דמו
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-8 sm:py-14">
        {preview ? (
          <div ref={resultRef} className="grid items-start gap-6 lg:grid-cols-[1fr_1fr] lg:gap-12">
            <section className="max-w-xl space-y-4">
              <BrandCard brand={preview} />
              {preview.offerings.length ? (
                <p className="hidden text-sm leading-6 text-[#4f524b] sm:block">
                  <span className="font-bold text-[#191b18]">מה אתם מוכרים: </span>
                  {preview.offerings.slice(0, 4).join(" · ")}
                </p>
              ) : null}

              {/* On a phone the card comes before the ask; on desktop it sits beside it. */}
              <div className="mx-auto w-full max-w-[260px] lg:hidden">
                {preview.sample_post ? (
                  <SamplePostCard preview={preview} />
                ) : (
                  <NoSamplePost />
                )}
              </div>

              <div className="space-y-2 pt-1">
                <Link
                  href={signupHref}
                  className="drawn-button inline-flex min-h-12 w-full items-center justify-center bg-[#191b18] px-6 py-3 text-base font-bold text-white hover:bg-[#2c2f29] sm:w-auto"
                >
                  לבנות את החודש שלי
                </Link>
                <p className="text-center text-xs text-[#5e6159] sm:text-right">
                  הרשמה בחינם ושלוש שאלות קצרות.{" "}
                  <button
                    type="button"
                    onClick={startOver}
                    className="inline-flex min-h-11 items-center font-bold text-[#191b18] underline underline-offset-4"
                  >
                    לנסות אתר אחר
                  </button>
                </p>
              </div>
            </section>

            <section className="hidden lg:block">
              <div className="mx-auto max-w-[380px]">
                {preview.sample_post ? (
                  <>
                    <p className="mb-2 text-xs font-bold text-[#5e6159]">פוסט לדוגמה, בצבעים ובסגנון שלכם</p>
                    <SamplePostCard preview={preview} />
                  </>
                ) : (
                  <NoSamplePost />
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
            <section className="max-w-xl">
              <p className="mb-4 text-xs font-bold tracking-wider text-[#2d3f32]">תוכנית שיווק לכל חודש, בלי ללמוד שיווק</p>
              <h1 className="text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl">
                הכניסו את האתר.
                <br />
                נכתוב את הפוסט הראשון.
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-[#5e6159]">
                נקרא את האתר, נלמד את הצבעים והסגנון של העסק ונכתוב לכם פוסט לדוגמה, עוד לפני שנרשמתם.
              </p>

              <form onSubmit={onScan} className="mt-8 space-y-3">
                <label htmlFor="website" className="block text-sm font-bold text-[#191b18]">
                  כתובת האתר של העסק
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {/* `text`, not `url`: the browser's own url check rejects `myshop.co.il`
                      before our code can add the https:// for them. */}
                  <input
                    id="website"
                    type="text"
                    inputMode="url"
                    autoComplete="url"
                    autoCapitalize="none"
                    spellCheck={false}
                    dir="ltr"
                    value={website}
                    disabled={pending}
                    onChange={(event) => setWebsite(event.target.value)}
                    placeholder="myshop.co.il"
                    className="min-h-12 flex-1 rounded-md border border-[#dedcd4] bg-white px-3 py-3 text-base disabled:opacity-60 sm:text-sm"
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className="drawn-button inline-flex min-h-12 items-center justify-center bg-[#191b18] px-5 py-3 text-sm font-bold text-white hover:bg-[#2c2f29] disabled:opacity-60"
                  >
                    {pending ? "קוראים את האתר…" : "לקרוא את האתר"}
                  </button>
                </div>
                {pending ? (
                  <p role="status" className="text-sm font-bold text-[#2d3f32]">
                    {READING_STEPS[readingStep]} <span className="font-normal text-[#5e6159]">זה לוקח עד חצי דקה.</span>
                  </p>
                ) : null}
                {error ? <p role="alert" className="text-sm text-[#7c4036]">{error}</p> : null}
              </form>

              <p className="mt-3 flex flex-wrap items-center gap-x-1 text-sm text-[#5e6159]">
                רוצים רק להסתכל?
                <button
                  type="button"
                  onClick={() => void openDemo()}
                  disabled={openingDemo}
                  className="inline-flex min-h-11 items-center font-bold text-[#191b18] underline underline-offset-4 disabled:opacity-60"
                >
                  {openingDemo ? "פותחים את הדמו…" : "לראות את הדמו של מאפיית לחם תום"}
                </button>
              </p>
            </section>

            <section className="overflow-hidden rounded-lg border border-[#e6e4dc] bg-white">
              {pending ? (
                <ReadingSkeleton step={readingStep} />
              ) : (
                <div className="p-6 sm:p-8">
                  <p className="text-xs font-bold text-[#5e6159]">מה תקבלו תוך חצי דקה</p>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-[#5e6159]">
                    <PreviewRow text="הצבעים והסגנון של העסק, כמו באתר" />
                    <PreviewRow text="פוסט לדוגמה, בסגנון שלכם" />
                    <PreviewRow text="אחרי ההרשמה: חודש שלם של פוסטים, מוכנים לאישור" />
                  </ul>
                  <p className="mt-6 text-xs leading-5 text-[#62635f]">לא נמציא לכם מספרים. נתונים על פניות ומכירות יופיעו רק אחרי שתחברו את נתוני האתר.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function NoSamplePost() {
  return (
    <p className="rounded-lg border border-[#e6e4dc] bg-white p-4 text-sm leading-6 text-[#5e6159]">
      את הצבעים והסגנון כבר קראנו, אבל הפעם לא הצלחנו לכתוב פוסט לדוגמה. את החודש המלא נכתוב אחרי ההרשמה.
    </p>
  );
}

/** Shown in place of the explainer while the scan runs, so the wait has a shape. */
function ReadingSkeleton({ step }: { step: number }) {
  return (
    <div className="p-6 sm:p-8" aria-hidden>
      <ul className="space-y-3 text-sm">
        {READING_STEPS.map((label, index) => (
          <li
            key={label}
            className={`flex items-center gap-2.5 ${index <= step ? "font-bold text-[#191b18]" : "text-[#9a9c93]"}`}
          >
            {index < step ? (
              <IconCheck className="h-4 w-4 shrink-0" />
            ) : (
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${index === step ? "animate-pulse bg-[#191b18]" : "bg-[#d8d6ce]"}`}
              />
            )}
            {label}
          </li>
        ))}
      </ul>
      <div className="mx-auto mt-6 hidden aspect-[4/5] w-full max-w-[280px] animate-pulse rounded-lg bg-[#eceae4] lg:block" />
    </div>
  );
}

function PreviewRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <IconCheck className="mt-1 h-4 w-4 shrink-0 text-[#191b18]" />
      <span>{text}</span>
    </li>
  );
}
