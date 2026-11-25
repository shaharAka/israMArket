"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Copy, useLanguage } from "@/components/language/LanguageProvider";
import { signInUrl } from "@/lib/authNavigation";

export default function FeedbackScreenshot() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLanguage();
  const [image, setImage] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "signin" | "missing">("loading");
  useEffect(() => {
    const request = new AbortController();
    let url = "";
    fetch(`/backend/support/${encodeURIComponent(id)}/screenshot`, {
      credentials: "include", signal: request.signal, cache: "no-store",
    }).then(async response => {
      if (response.status === 401) {
        setState("signin");
        return;
      }
      if (!response.ok) {
        setState("missing");
        return;
      }
      const blob = await response.blob();
      if (request.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setImage(url);
      setState("ready");
    }).catch(() => { if (!request.signal.aborted) setState("missing"); });
    return () => {
      request.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return <main className="app-blue mx-auto min-h-screen max-w-4xl space-y-5 p-5 sm:p-8">
    <h1 className="text-2xl font-semibold"><Copy text="צילום המסך מהדיווח" /></h1>
    {state === "loading" ? <p role="status"><Copy text="טוענים…" /></p> : null}
    {state === "signin" ? <Link className="inline-flex min-h-11 items-center underline" href={signInUrl(`/support/screenshot/${id}`, locale)}>
      <Copy text="להיכנס כדי לראות את צילום המסך" />
    </Link> : null}
    {state === "missing" ? <p role="status"><Copy text="צילום המסך לא זמין בחשבון הזה." /></p> : null}
    {state === "ready" ? <Image unoptimized src={image} alt={t("צילום המסך מהדיווח")} width={1440} height={900}
      className="h-auto w-full rounded-lg border border-[var(--rule)]" /> : null}
  </main>;
}
