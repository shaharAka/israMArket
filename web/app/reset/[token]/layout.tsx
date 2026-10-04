import type { Metadata } from "next";

/**
 * A one-time reset link (api/app/services/password_reset.py). The token is in this page's
 * path, so the page is never indexed and sends no referrer: a link it shows, or a font it
 * loads, must not carry the token anywhere.
 */
export const metadata: Metadata = {
  title: "סיסמה חדשה · ישראמארקט",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default function ResetLayout({ children }: LayoutProps<"/reset/[token]">) {
  return children;
}
