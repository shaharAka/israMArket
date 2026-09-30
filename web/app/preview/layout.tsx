import type { Metadata } from "next";
export const metadata: Metadata = { title: "ישראמארקט · תצוגת כחול ושמש", robots: { index: false, follow: false } };
export default function PreviewLayout({ children }: { children: React.ReactNode }) { return children; }
