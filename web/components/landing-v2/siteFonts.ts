import { Assistant, Frank_Ruhl_Libre, Lora } from "next/font/google";

// A public-site typography study. The signed-in product keeps its existing fonts.
export const siteSans = Assistant({ subsets: ["hebrew", "latin"], variable: "--font-site-hebrew", display: "swap" });
export const artSerif = Frank_Ruhl_Libre({ subsets: ["hebrew", "latin"], variable: "--font-art-serif", display: "swap", preload: false });
export const siteSerif = Lora({ subsets: ["latin", "cyrillic"], variable: "--font-site-serif", display: "swap", preload: false });
