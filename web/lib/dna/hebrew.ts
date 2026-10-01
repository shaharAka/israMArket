/**
 * Hebrew typesetting for post artwork.
 *
 * The browser breaks lines; this module makes the text worth breaking: proper geresh and
 * gershayim, no space before punctuation, the shekel sign after the number, and
 * non-breaking spaces where a break would read badly (after a one- or two-letter word,
 * between a number and what it counts, before a short last word). `fitHeadline` picks a
 * size before layout, from the font's measured average letter width, so a preview, a
 * thumbnail and the 1080px export always agree.
 */

import type { FontMeta } from "./library";

const NBSP = "\u00A0";
const HEB = "\u0590-\u05FF";
const HEB_LETTER = new RegExp(`[${HEB}]`);

/** Words of one or two letters that should never end a line in a headline. */
function isShortWord(word: string): boolean {
  const letters = word.replace(/[^\u0590-\u05FFA-Za-z]/g, "");
  return letters.length > 0 && letters.length <= 2;
}

export function typesetHebrew(input: string, { bindLast = true }: { bindLast?: boolean } = {}): string {
  let s = (input || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  // Gershayim and geresh: ש"ח → ש״ח, צ'יפס → צ׳יפס, ג' → ג׳.
  s = s.replace(new RegExp(`([${HEB}])"(?=[${HEB}])`, "g"), "$1״");
  s = s.replace(new RegExp(`([${HEB}])'(?=[${HEB}\\s.,:!?)]|$)`, "g"), "$1׳");
  // No space before closing punctuation; one after.
  s = s.replace(/\s+([,.:;!?)])/g, "$1");
  s = s.replace(/([(])\s+/g, "$1");
  // A spaced hyphen is a dash; a range of numbers or times takes an en dash.
  s = s.replace(/\s-\s/g, " – ");
  s = s.replace(/(\d)\s?-\s?(\d)/g, "$1–$2");
  // The shekel sign follows the number, held to it.
  s = s.replace(/₪\s?(\d[\d,.]*)/g, `$1${NBSP}₪`);
  s = s.replace(/(\d)\s?₪/g, `$1${NBSP}₪`);
  s = s.replace(/(\d)\s?ש״ח/g, `$1${NBSP}ש״ח`);
  const words = s.split(" ");
  const out: string[] = [];
  let chained = false;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const next = words[i + 1];
    // Never more than two words held together: "את זה עם פרחים" bound end to end would be
    // one unbreakable run, wider than a narrow column.
    const glue: boolean =
      next !== undefined &&
      !chained &&
      // A word that ends a sentence or a clause never binds across it.
      !/[.,:;!?]$/.test(word) &&
      // A short word binds to the next one: "של שישי", "את החלות".
      ((isShortWord(word) && HEB_LETTER.test(word)) ||
        // A number binds to what it counts: "100 חלות", "3 דורות".
        /^\d[\d,.:%]*$/.test(word));
    chained = glue;
    out.push(word, next === undefined ? "" : glue ? NBSP : " ");
  }
  s = out.join("");
  // A short last word should not sit alone on its line.
  if (bindLast) {
    const lastSpace = s.lastIndexOf(" ");
    if (lastSpace > 0) {
      const tail = s.slice(lastSpace + 1);
      if (!tail.includes(NBSP) && tail.replace(/[^\u0590-\u05FFA-Za-z0-9]/g, "").length <= 4) {
        s = `${s.slice(0, lastSpace)}${NBSP}${tail}`;
      }
    }
  }
  return s;
}

/**
 * The headline's key phrase — what an accent colour or an underline marks. After a colon
 * or a dash when there is one ("שישי: חלות חמות" → "חלות חמות"), otherwise the last word,
 * or the last two when the last is very short.
 */
export function splitKeyPhrase(text: string): { lead: string; key: string } {
  const s = text.trim();
  const sep = s.search(/[:–—]\s/);
  if (sep > 0) {
    const key = s.slice(sep + 1).trim();
    if (key && key.split(/[\s\u00A0]+/).length <= 4) return { lead: s.slice(0, sep + 1) + " ", key };
  }
  const words = s.split(" ");
  if (words.length < 2) return { lead: s, key: "" };
  const last = words[words.length - 1];
  return { lead: words.slice(0, -1).join(" ") + " ", key: last };
}

/**
 * A headline of two or three short sentences, or a label and its point, split where a
 * designer would break the line ("פתוחים מ-07:00. | התנור כבר חם."). One sentence comes
 * back whole. A part of a single word is never split off.
 */
export function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?:]) +/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return [text];
  if (parts.some((p) => p.split(/[ \u00A0]+/).length < 2)) return [text];
  return parts;
}

/** A price in the copy ("49 ₪", "₪49", "49 ש״ח"), and the copy without it. */
export function findPrice(text?: string): { price: string; rest: string } | null {
  const s = (text || "").trim();
  if (!s) return null;
  const m = s.match(/(\d[\d,.]*)[\s\u00A0]*(?:₪|ש״ח|ש"ח)|₪[\s\u00A0]*(\d[\d,.]*)/);
  if (!m) return null;
  const amount = m[1] || m[2];
  const rest = s.replace(m[0], "").replace(/\s+/g, " ").replace(/^[\s:–—-]+|[\s:–—-]+$/g, "").trim();
  return { price: amount, rest };
}

/** A leading number in a stat ("100 חלות כל שישי" → "100" + "חלות כל שישי"). */
export function splitStat(text: string): { figure: string; label: string } | null {
  const m = text.trim().match(/^(\d[\d,.:]*%?\+?)[\s\u00A0]+(.{2,})$/);
  return m ? { figure: m[1], label: m[2] } : null;
}

/* ------------------------------------------------------------------ */
/* Fit                                                                 */
/* ------------------------------------------------------------------ */

function emWidth(text: string, meta: FontMeta, weight: number): number {
  // Heavier cuts run a little wider; spaces are about a quarter em.
  const heavy = 1 + Math.max(0, weight - 400) / 1000 * 0.18;
  let em = 0;
  for (const ch of text) {
    if (ch === " " || ch === NBSP) em += 0.26;
    else if (/[0-9]/.test(ch)) em += meta.widthEm * 1.05;
    else if (/[.,:;'׳״"!?()–—-]/.test(ch)) em += meta.widthEm * 0.5;
    else em += meta.widthEm;
  }
  return em * heavy;
}

export type Fit = { size: number; lines: number };

/**
 * The largest size at which `text` fits `width` × `height` in at most `maxLines` lines,
 * clamped to [min, max]. The browser does the actual breaking (with `text-wrap: balance`);
 * the estimate keeps a margin so its lines never outnumber ours.
 */
export function fitHeadline(
  text: string,
  meta: FontMeta,
  weight: number,
  { width, height, max, min = 30, maxLines = 4, leading = meta.leading }: { width: number; height: number; max: number; min?: number; maxLines?: number; leading?: number },
): Fit {
  const s = text.trim();
  if (!s) return { size: min, lines: 1 };
  const total = emWidth(s, meta, weight);
  // A run held together by non-breaking spaces breaks as one word.
  const longest = Math.max(...s.split(/ +/).map((w) => emWidth(w, meta, weight)), 0.5);
  let best: Fit = { size: min, lines: maxLines };
  for (let lines = 1; lines <= maxLines; lines += 1) {
    // Line breaks never fall exactly at the width; a balanced setting loses ~12% a line.
    const byWidth = (width * lines * (lines === 1 ? 0.97 : 0.86)) / total;
    const byHeight = height / (lines * leading + 0.08);
    const byWord = (width * 0.96) / longest;
    const size = Math.min(max, byWidth, byHeight, byWord);
    if (size > best.size + 0.5) best = { size, lines };
  }
  return { size: Math.max(min, Math.floor(best.size)), lines: best.lines };
}
