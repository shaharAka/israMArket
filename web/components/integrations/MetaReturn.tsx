"use client";

import { ProductWordmark } from "@/components/landing-v2/ProductWordmark";
import { useEffect } from "react";
import Link from "next/link";
import { IconArrowLeft } from "@/lib/icons";
export function MetaReturn({ result }: { result: string }) {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: "isramarket-meta-return", result }, window.location.origin);
      window.close();
    }
  }, [result]);
  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-16">
      <section className="w-full max-w-md rounded-[20px] bg-[var(--paper)] p-8 text-center shadow-[var(--shadow-pop)]">
        <ProductWordmark />
        <h1 className="mt-5 text-[26px] font-bold tracking-tight text-[var(--ink)]">
          {result === "success" ? "האישור התקבל" : "לחזור לחיבור העסק"}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)]">
          אפשר לחזור לחלון של ישראמארקט ולהמשיך לבחור את החשבונות. אם הוא נסגר, המשיכו מכאן.
        </p>
        <Link
          href={`/integrations?meta_result=${encodeURIComponent(result)}`}
          className="drawn-button mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[var(--primary)] px-6 text-[15px] text-white hover:bg-[var(--primary-dark)]"
        >
          להמשיך לחיבורים
          <IconArrowLeft className="h-4 w-4" />
        </Link>
      </section>
    </main>
  );
}
