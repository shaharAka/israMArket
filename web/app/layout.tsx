import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "ישראמארקט — שיווק לעסקים קטנים",
  description: "אסטרטגיית תוכן מקומית ואופטימיזציית ביצועים לעסקים קטנים בישראל",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full bg-paper text-ink">{children}</body>
    </html>
  );
}
