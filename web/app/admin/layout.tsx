import type { Metadata } from "next";

/** The owner's backoffice: never indexed, never followed, and no referrer leaves it. */
export const metadata: Metadata = {
  title: "ניהול · ישראמארקט",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
