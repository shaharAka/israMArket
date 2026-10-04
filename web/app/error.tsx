"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PUBLIC_NOTICE_LINK, PUBLIC_NOTICE_PRIMARY, PublicNotice } from "@/components/landing/PublicNotice";

/**
 * Any page that fails while loading or rendering: say so in Hebrew and offer to try again,
 * instead of the framework's English error screen. Pages that handle their own errors
 * (a failed save, a refused request) keep doing so; this is only the last resort.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PublicNotice
      title="לא הצלחנו לטעון את העמוד"
      lead="כנראה תקלה רגעית. נסו שוב בעוד רגע."
      actions={
        <>
          <button type="button" onClick={() => retry()} className={PUBLIC_NOTICE_PRIMARY}>
            לנסות שוב
          </button>
          <Link href="/" className={PUBLIC_NOTICE_LINK}>
            לעמוד הראשי
          </Link>
        </>
      }
    />
  );
}
