import { Frank_Ruhl_Libre, Lora, Rubik } from "next/font/google";

// Public Hebrew UI study; product fonts remain unchanged until the direction is reviewed.
export const siteClean = Rubik({ subsets: ["hebrew", "latin"], variable: "--font-site-clean", display: "swap", preload: false });
// Editorial faces belong to business artwork, not the website's UI.
export const artSerif = Frank_Ruhl_Libre({ subsets: ["hebrew", "latin"], variable: "--font-art-serif", display: "swap", preload: false });
export const siteSerif = Lora({ subsets: ["latin", "cyrillic"], variable: "--font-site-serif", display: "swap", preload: false });
