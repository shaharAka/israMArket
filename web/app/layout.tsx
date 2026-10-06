import type { Metadata, Viewport } from "next";
import { Heebo, Noto_Sans, Noto_Sans_Arabic } from "next/font/google";
import { LanguageProvider } from "@/components/language/LanguageProvider";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});
const noto = Noto_Sans({ variable: "--font-noto", subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const arabic = Noto_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], display: "swap", preload: false });

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
    <html lang="he" dir="rtl" className={`${heebo.variable} ${noto.variable} ${arabic.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-paper text-ink"><LanguageProvider><ProductUtilities />{children}</LanguageProvider></body>
    </html>
  );
}
