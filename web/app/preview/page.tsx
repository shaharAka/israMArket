"use client";

import { IdentityMark } from "@/components/landing-v2/IdentityMark";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { endpoints } from "@/lib/api";
import { IconArrowLeft } from "@/lib/icons";
import { PalettePicker } from "@/components/design/PalettePicker";
import { productPaletteVariables, useDesignPalette } from "@/components/design/palette";
import { SunProgress } from "@/components/brand/SunProgress";

const screens = [
  { href: "/dashboard", name: "השבוע", detail: "הכיוון בתוכנית, המדד וההחלטה שצריך מכם." },
  { href: "/strategy", name: "התוכנית", detail: "האסטרטגיה, הצעדים הקרובים ומה נבדוק כדי להתקדם." },
  { href: "/posts", name: "הפוסטים", detail: "לבדוק, לערוך ולאשר את הפוסטים שנבנו מהתוכנית." },
  { href: "/calendar", name: "לוח התוכנית", detail: "פוסטים, משימות ותאריכים מהתוכנית, לפי יום." },
  { href: "/brand", name: "המותג", detail: "הלוגו, צבעי העסק וסגנון הכתיבה שלו." },
  { href: "/business", name: "העסק", detail: "ההחלטות, החיבורים והתמונות, בשפה עיצובית אחת." },
];

export default function PreviewPage() {
  const { palette } = useDesignPalette();
  const router = useRouter();
  async function openDemo(href: string) {
    await endpoints.enterDemo();
    router.push(href);
  }
  return (
    <main style={productPaletteVariables(palette)} className="app-blue mx-auto min-h-dvh max-w-4xl px-5 py-7 sm:px-10 sm:py-12">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <Link href="/design" className="flex items-center gap-2 text-[var(--primary)]"><span className="product-wordmark text-[var(--ink)]" dir="ltr"><IdentityMark direction="open" /><span className="sr-only">isramarket</span></span></Link>
        <span className="text-xs text-[var(--ink-soft)]">{palette.name} · תצוגה</span>
      </header>
      <div className="flex items-center justify-between gap-4 py-8 sm:py-12">
        <div>
          <p className="mb-2 text-sm font-bold text-[var(--primary)]">מהתוכנית לצעד הבא.</p>
          <h1 className="text-3xl font-medium leading-tight sm:text-5xl">תוכנית לעסק.<br />ליווי לאורך הדרך.</h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-[var(--ink-soft)]">התוכנית, הפוסטים והתוצאות. בחרו מסך כדי לעבור לתוכו.</p>
        </div>
        <SunProgress value={1} total={1} label="התקדמות בתוכנית" className="sm:!w-48" />
      </div>
      <PalettePicker />
      <button onClick={() => void openDemo("/strategy")} className="drawn-button inline-flex min-h-12 items-center gap-3 bg-[var(--primary)] px-6 font-bold text-white">לראות את התוכנית <IconArrowLeft /></button>
      <div className="mt-8 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
        <Link href="/start?mock=1" className="group flex min-h-20 items-center justify-between gap-4 py-4">
          <div><h2 className="font-medium">ההיכרות הראשונה</h2><p className="mt-1 text-sm text-[var(--ink-soft)]">השאלות, כרטיס העסק והתוכנית.</p></div>
          <IconArrowLeft className="h-5 w-5 shrink-0 text-[var(--primary)]" />
        </Link>
        {screens.map((screen) => <button key={screen.href} onClick={() => void openDemo(screen.href)} className="group flex min-h-20 w-full cursor-pointer items-center justify-between gap-4 py-4 text-right hover:text-[var(--primary)]">
          <span><span className="block font-medium">{screen.name}</span><span className="mt-1 block text-sm text-[var(--ink-soft)]">{screen.detail}</span></span>
          <IconArrowLeft className="h-5 w-5 shrink-0 text-[var(--primary)]" />
        </button>)}
      </div>
      <p className="mt-6 text-xs leading-6 text-[var(--ink-soft)]">צבעי העסק נשארים בפוסטים עצמם. בחירת הצבעים כאן משנה רק את הממשק בדמו.</p>
    </main>
  );
}
