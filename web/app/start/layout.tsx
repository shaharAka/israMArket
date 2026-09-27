import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "בונים יחד את התוכנית · ישראמארקט",
  description: "פגישת היכרות קצרה: נשאל על העסק, נחקור, ונבנה יחד כיוון לחודש הראשון.",
};

export default function StartLayout({ children }: LayoutProps<"/start">) {
  return children;
}
