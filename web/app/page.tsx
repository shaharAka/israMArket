"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BrandMark, IconCheck } from "@/lib/icons";
import { endpoints, type BrandLanguage } from "@/lib/api";

export default function Home() {
  const [website, setWebsite] = useState("");
  const [brand, setBrand] = useState<BrandLanguage | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onScan(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!/^https?:\/\/.+/i.test(website.trim())) {
      setError("הזינו כתובת אתר מלאה, כולל https://");
      return;
    }
    setPending(true);
    try {
      const result = await endpoints.previewScan(website.trim());
      setBrand(result.scan.brand_language);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לקרוא את האתר");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f9f8f6] text-[#191b18]">
      <header className="border-b border-[#e6e4dc] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9 text-[#191b18]" />
            <div>
              <span className="block text-lg font-black tracking-tight">ישראמארקט</span>
              <span className="-mt-1 block text-[11px] text-[#5e6159]">שיווק שעובד בישראל</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-bold text-[#191b18] underline-offset-4 hover:underline">
              כניסה
            </Link>
            <Link href="/login" className="text-sm font-bold text-[#5e6159] underline-offset-4 hover:underline">
              דמו
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
          <section className="max-w-xl">
            <p className="mb-4 text-xs font-bold tracking-wider text-[#2d3f32]">תוכנית אחת לחודש. בלי ללמוד שיווק.</p>
            <h1 className="text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl">
              תנו לנו את האתר.
              <br />
              נראה איך העסק שלכם נשמע.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-[#5e6159]">
              קוראים את האתר, לומדים את הצבעים והטון, ובונים חודש של פוסטים לאישור. בלי מדדים מומצאים ובלי לוח בקרה עמוס.
            </p>

            <form onSubmit={onScan} className="mt-8 space-y-3">
              <label className="block text-xs font-bold text-[#191b18]">כתובת האתר של העסק</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="https://myshop.co.il"
                  className="flex-1 rounded-md border border-[#dedcd4] bg-white px-3 py-3 text-sm"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="drawn-button inline-flex items-center justify-center bg-[#191b18] px-5 py-3 text-sm font-bold text-white hover:bg-[#2c2f29] disabled:opacity-50"
                >
                  {pending ? "קוראים את האתר…" : "הציגו את המותג"}
                </button>
              </div>
              {error ? <p className="text-sm text-[#7c4036]">{error}</p> : null}
            </form>

            <p className="mt-4 text-xs text-[#8b8e84]">
              רוצים רק להסתכל?{" "}
              <Link href="/login" className="font-bold text-[#191b18] underline underline-offset-4">
                פתחו את הדמו של מאפיית לחם תום
              </Link>
            </p>
          </section>

          <section className="overflow-hidden rounded-lg border border-[#e6e4dc] bg-white">
            {brand ? (
              <div>
                <div className="border-b border-[#e6e4dc] px-5 py-4">
                  <p className="text-xs font-bold text-[#2d3f32]">נלמד מהאתר שלכם</p>
                  <h2 className="mt-1 text-xl font-black">{brand.business_name}</h2>
                </div>
                <div className="space-y-5 p-5">
                  <div>
                    <p className="mb-2 text-xs font-bold text-[#5e6159]">פלטת צבעים</p>
                    <div className="flex gap-2">
                      {brand.palette.map((swatch) => (
                        <div key={swatch.hex} className="text-center">
                          <span
                            className="block h-10 w-10 rounded-full border border-[#dedcd4]"
                            style={{ backgroundColor: swatch.hex }}
                          />
                          <span className="mt-1 block text-[10px] text-[#8b8e84]">{swatch.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-[#5e6159]">
                    <span className="font-bold text-[#191b18]">טון הדיבור: </span>
                    {brand.voice}
                  </p>
                  {brand.offers_seen?.length ? (
                    <p className="text-sm leading-6 text-[#5e6159]">
                      <span className="font-bold text-[#191b18]">מה ראינו באתר: </span>
                      {brand.offers_seen.slice(0, 4).join(" · ")}
                    </p>
                  ) : null}
                  <Link
                    href={`/signup?website=${encodeURIComponent(website.trim())}`}
                    className="drawn-button inline-flex bg-[#191b18] px-5 py-3 text-sm font-bold text-white hover:bg-[#2c2f29]"
                  >
                    פתחו חשבון לעסק הזה
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-6 sm:p-8">
                <p className="text-xs font-bold text-[#5e6159]">מה קורה אחרי הסריקה</p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-[#5e6159]">
                  <PreviewRow text="לומדים צבעים, טון ומוצרים מהאתר האמיתי" />
                  <PreviewRow text="מציעים שלושה כיוונים לחודש — אתם בוחרים אחד" />
                  <PreviewRow text="מכינים פוסטים ותמונות. אתם רק מאשרים" />
                </ul>
                <p className="mt-6 text-xs text-[#8b8e84]">אין כאן אחוזי פניות מומצאים. מספרים יופיעו רק אחרי חיבור אנליטיקס.</p>
              </div>
            )}
          </section>
        </div>
      </main>
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
