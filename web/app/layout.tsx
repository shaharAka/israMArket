import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "ישראמארקט — שיווק לעסקים קטנים",
  description:
    "תוכנית שיווק אישית לעסקים קטנים בישראל: כל שבוע הצעד הבא ופוסטים מוכנים בסגנון שלכם, ואחר כך בודקים מה הצליח ומעדכנים את התוכנית.",
};

/** `cover` lets the shell's safe-area insets reach under the iPhone notch and home bar. */
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the landing page marks <html> before the first paint
    // (data-lv2) so its animated start states never flash. Only affects this element.
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-paper text-ink">{children}</body>
    </html>
  );
}
