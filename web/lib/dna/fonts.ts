/**
 * The DNA type library, self-hosted through next/font.
 *
 * Every family is declared with `preload: false`: next/font then emits only `@font-face`
 * rules (a few hundred bytes each) and no `<link rel="preload">`. A browser fetches a font
 * file only when text on the page is set in that family and needs those glyphs, so a page
 * downloads the families its posts actually use — the business's display and text faces —
 * and none of the other twelve. The Hebrew and Latin subsets are separate files with
 * `unicode-range`, so a Hebrew headline never pulls the Latin file it does not need.
 *
 * Self-hosting (rather than a runtime `<link>` to fonts.googleapis.com) matters for the
 * PNG export: html-to-image inlines the `@font-face` rules of the families used inside the
 * card (see `getWebFontCSS` in html-to-image), and same-origin files can always be read.
 *
 * Static families list their weights; a variable family covers its whole range.
 */

import { Inter, IBM_Plex_Sans_Arabic,
  Amatic_SC,
  Assistant,
  Bellefair,
  David_Libre,
  Frank_Ruhl_Libre,
  Heebo,
  IBM_Plex_Sans_Hebrew,
  Karantina,
  Noto_Serif_Hebrew,
  Playpen_Sans_Hebrew,
  Rubik,
  Secular_One,
  Suez_One,
  Varela_Round,
} from "next/font/google";
import type { FontKey } from "./library";

const frankRuhlLibre = Frank_Ruhl_Libre({ subsets: ["hebrew", "latin"], preload: false, display: "swap" });
const notoSerifHebrew = Noto_Serif_Hebrew({ subsets: ["hebrew", "latin"], preload: false, display: "swap" });
const davidLibre = David_Libre({ subsets: ["hebrew", "latin"], weight: ["400", "500", "700"], preload: false, display: "swap" });
const bellefair = Bellefair({ subsets: ["hebrew", "latin"], weight: "400", preload: false, display: "swap" });
const suezOne = Suez_One({ subsets: ["hebrew", "latin"], weight: "400", preload: false, display: "swap" });
const secularOne = Secular_One({ subsets: ["hebrew", "latin"], weight: "400", preload: false, display: "swap" });
const rubik = Rubik({ subsets: ["hebrew", "latin"], preload: false, display: "swap" });
const assistant = Assistant({ subsets: ["hebrew", "latin"], preload: false, display: "swap" });
const ibmPlexSansHebrew = IBM_Plex_Sans_Hebrew({
  subsets: ["hebrew", "latin"],
  weight: ["200", "300", "400", "500", "600", "700"],
  preload: false,
  display: "swap",
});
const heebo = Heebo({ subsets: ["hebrew", "latin"], preload: false, display: "swap" });
const varelaRound = Varela_Round({ subsets: ["hebrew", "latin"], weight: "400", preload: false, display: "swap" });
const karantina = Karantina({ subsets: ["hebrew", "latin"], weight: ["300", "400", "700"], preload: false, display: "swap" });
const amaticSc = Amatic_SC({ subsets: ["hebrew", "latin"], weight: ["400", "700"], preload: false, display: "swap" });
// next/font has no metrics to build a size-adjusted fallback for this family.
const playpenSansHebrew = Playpen_Sans_Hebrew({ subsets: ["hebrew", "latin"], preload: false, display: "swap", adjustFontFallback: false });

const international = Inter({ subsets: ["latin", "cyrillic"], preload: false, display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], preload: false, display: "swap" });

const LOADED: Record<FontKey, { style: { fontFamily: string } }> = {
  "frank-ruhl-libre": frankRuhlLibre,
  "noto-serif-hebrew": notoSerifHebrew,
  "david-libre": davidLibre,
  bellefair,
  "suez-one": suezOne,
  "secular-one": secularOne,
  rubik,
  assistant,
  "ibm-plex-sans-hebrew": ibmPlexSansHebrew,
  heebo,
  "varela-round": varelaRound,
  karantina,
  "amatic-sc": amaticSc,
  "playpen-sans-hebrew": playpenSansHebrew,
};

/** The CSS `font-family` stack for a library font (its self-hosted face, then a system fallback). */
export function fontStack(key: FontKey, category: "serif" | "sans" = "sans"): string {
  const generic = category === "serif" ? "'Times New Roman', serif" : "Arial, sans-serif";
  return `${LOADED[key].style.fontFamily}, ${international.style.fontFamily}, ${arabic.style.fontFamily}, ${generic}`;
}
