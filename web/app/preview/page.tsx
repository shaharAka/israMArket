"use client";

import { Copy } from "@/components/language/LanguageProvider";

import { IdentityMark } from "@/components/landing-v2/IdentityMark";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { endpoints } from "@/lib/api";
import { IconArrowLeft } from "@/lib/icons";

const screens = [
  { href: "/dashboard", name: "השבוע", detail: "הכיוון בתוכנית, המדד וההחלטה שצריך מכם." },
  { href: "/strategy", name: "התוכנית", detail: "האסטרטגיה, הצעדים הקרובים ומה נבדוק כדי להתקדם." },
  { href: "/posts", name: "הפוסטים", detail: "לבדוק, לערוך ולאשר את הפוסטים שנבנו מהתוכנית." },
  { href: "/calendar", name: "לוח התוכנית", detail: "פוסטים, משימות ותאריכים מהתוכנית, לפי יום." },
  { href: "/performance", name: "תוצאות", detail: "מה נמדד, מה למדנו ומה כדאי לשנות בהמשך." },
  { href: "/integrations", name: "חיבורים", detail: "מקורות המידע והשלב הבא בכל חיבור." },
  { href: "/brand", name: "המותג", detail: "הלוגו, צבעי העסק וסגנון הכתיבה שלו." },
  { href: "/business", name: "העסק", detail: "ההחלטות, החיבורים והתמונות, בשפה עיצובית אחת." },
];

export default function PreviewPage() {
  const router = useRouter();
  async function openDemo(href: string) {
    await endpoints.enterDemo();
    router.push(href);
  }
  return (
    <main className="app-blue mx-auto min-h-dvh max-w-4xl px-5 py-7 sm:px-10 sm:py-12">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <Link href="/design" className="flex items-center gap-2 text-[var(--primary)]"><span className="product-wordmark text-[var(--ink)]" dir="ltr"><IdentityMark direction="open" /><span className="sr-only">isramarket</span></span></Link>
        <span className="text-xs text-[var(--ink-soft)]"><Copy text="תצוגת המוצר" /></span>
      </header>
      <div className="flex items-center justify-between gap-4 py-8 sm:py-12">
        <div>
          <h1 className="text-3xl font-medium leading-tight sm:text-5xl"><Copy text="מהיכרות עם העסק, לקמפיין שעובד בשבילו." /></h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-[var(--ink-soft)]"><Copy text="התוכנית, הפוסטים והתוצאות. בחרו מסך כדי לעבור לתוכו." /></p>
        </div>
      </div>
      <button onClick={() => void openDemo("/campaign")} className="drawn-button inline-flex min-h-12 items-center gap-3 bg-[var(--primary)] px-6 font-bold text-white"><Copy text="לפתוח את הקמפיין" /><IconArrowLeft /></button>
      <div className="mt-8 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
        <Link href="/start?mock=1" className="group flex min-h-20 items-center justify-between gap-4 py-4">
          <div><h2 className="font-medium"><Copy text="ההיכרות הראשונה" /></h2><p className="mt-1 text-sm text-[var(--ink-soft)]"><Copy text="השאלות, כרטיס העסק והתוכנית." /></p></div>
          <IconArrowLeft className="h-5 w-5 shrink-0 text-[var(--primary)]" />
        </Link>
        {screens.map((screen) => <button key={screen.href} onClick={() => void openDemo(screen.href)} className="group flex min-h-20 w-full cursor-pointer items-center justify-between gap-4 py-4 text-right hover:text-[var(--primary)]">
          <span><span className="block font-medium"><Copy text={screen.name}/></span><span className="mt-1 block text-sm text-[var(--ink-soft)]"><Copy text={screen.detail}/></span></span>
          <IconArrowLeft className="h-5 w-5 shrink-0 text-[var(--primary)]" />
        </button>)}
      </div>

    </main>
  );
}
