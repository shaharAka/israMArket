import { Frank_Ruhl_Libre, Lora } from "next/font/google";

// Editorial faces for business artwork and the explicit hero comparison. UI uses the root language fonts.
export const artSerif = Frank_Ruhl_Libre({ subsets: ["hebrew", "latin"], variable: "--font-art-serif", display: "swap", preload: false });
export const siteSerif = Lora({ subsets: ["latin", "cyrillic"], variable: "--font-site-serif", display: "swap", preload: false });
