"use client";
import { useEffect } from "react";
import Link from "next/link";
export function MetaReturn({ result }: { result: string }) {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: "isramarket-meta-return", result }, window.location.origin);
      window.close();
    }
  }, [result]);
  return <main dir="rtl" className="mx-auto max-w-lg px-6 py-16">
    <h1 className="text-2xl font-bold">{result === "success" ? "האישור התקבל" : "לחזור לחיבור העסק"}</h1>
    <p className="my-5 leading-7">אפשר לחזור לחלון של IsraMarket ולהמשיך לבחור את החשבונות. אם הוא נסגר, המשיכו מכאן.</p>
    <Link href={`/integrations?meta_result=${encodeURIComponent(result)}`} className="font-semibold text-[var(--primary)] underline">להמשיך ב־IsraMarket ←</Link>
  </main>;
}
