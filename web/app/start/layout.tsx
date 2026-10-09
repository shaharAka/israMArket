import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "בונים יחד את התוכנית · ישראמארקט",
  description: "מכירים את העסק ואת הקהל. אחרי פתיחת החשבון ממשיכים במחקר ובחיבורים ובונים את תוכנית השיווק.",
};

export default function StartLayout({ children }: LayoutProps<"/start">) {
  return children;
}
