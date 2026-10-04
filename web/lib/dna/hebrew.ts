/**
 * Hebrew typesetting for post artwork.
 *
 * The browser breaks lines; this module makes the text worth breaking: proper geresh and
 * gershayim, no space before punctuation, the shekel sign after the number, and
 * non-breaking spaces where a break would read badly (after a one- or two-letter word,
 * between a number and what it counts, before a short last word). `lineCount` measures a
 * setting before layout, from the font's measured average letter width, so a preview, a
 * thumbnail and the 1080px export always agree.
 */

import type { FontMeta } from "./library";
import { measuredEm } from "./measure";

const NBSP = " ";
const HEB = "֐-׿";
const HEB_LETTER = new RegExp(`[${HEB}]`);

/** Words of one or two letters that should never end a line in a headline. */
function isShortWord(word: string): boolean {
  const letters = word.replace(/[^֐-׿A-Za-z]/g, "");
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
      if (!tail.includes(NBSP) && tail.replace(/[^֐-׿A-Za-z0-9]/g, "").length <= 4) {
        s = `${s.slice(0, lastSpace)}${NBSP}${tail}`;
      }
    }
  }
  return s;
}

/**
 * The headline's key phrase — what an accent colour marks. After a colon or a dash when
 * there is one ("שישי: חלות חמות" → "חלות חמות"), otherwise the last word.
 */
export function splitKeyPhrase(text: string): { lead: string; key: string } {
  const s = text.trim();
  const sep = s.search(/[:–—]\s/);
  if (sep > 0) {
    const key = s.slice(sep + 1).trim();
    if (key && key.split(/[\s ]+/).length <= 4) return { lead: s.slice(0, sep + 1) + " ", key };
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
  if (parts.some((p) => p.split(/[  ]+/).length < 2)) return [text];
  return parts;
}

/** The number of words, counting a run held by non-breaking spaces as its words. */
export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/[\s ]+/).length : 0;
}

/* ------------------------------------------------------------------ */
/* Measure                                                             */
/* ------------------------------------------------------------------ */

/**
 * The advance of `text` in em: measured in the real face once it has loaded (see
 * measure.ts), estimated from the font's average letter width before that.
 */
export function emWidth(text: string, meta: FontMeta, weight: number, exact = false): number {
  const measured = exact ? measuredEm(text, meta.key, weight) : null;
  if (measured !== null) return measured;
  // Heavier cuts run a little wider; spaces are about a quarter em.
  const heavy = 1 + (Math.max(0, weight - 400) / 1000) * 0.18;
  let em = 0;
  for (const ch of text) {
    if (ch === " " || ch === NBSP) em += 0.26;
    else if (/[0-9]/.test(ch)) em += meta.widthEm * 1.05;
    else if (/[.,:;'׳״"!?()–—-]/.test(ch)) em += meta.widthEm * 0.5;
    else if (/[A-Z]/.test(ch)) em += meta.widthEm * 1.15;
    else em += meta.widthEm;
  }
  return em * heavy;
}

/** A word space in em (measured in the face once loaded). */
function spaceEm(meta: FontMeta, weight: number, exact: boolean): number {
  return (exact ? measuredEm(" ", meta.key, weight) : null) ?? 0.26;
}

/**
 * How many lines `text` takes at `size` px in a column `width` px wide (`exact`: measured in
 * the loaded face, see measure.ts; otherwise estimated): the browser's own
 * greedy breaking at ordinary spaces (a run held by non-breaking spaces is one word), with a
 * margin so the estimate never undercounts. `text-wrap: balance` evens the lines out but
 * keeps their number. `Infinity` when one word alone is wider than the column.
 */
export function lineCount(text: string, meta: FontMeta, weight: number, size: number, width: number, exact = false): number {
  const s = text.trim();
  if (!s) return 0;
  const limit = width * 0.95;
  const space = spaceEm(meta, weight, exact) * size;
  let lines = 1;
  let used = 0;
  for (const word of s.split(/ +/)) {
    const w = emWidth(word, meta, weight, exact) * size;
    if (w > limit) return Infinity;
    if (used === 0) used = w;
    else if (used + space + w <= limit) used += space + w;
    else {
      lines += 1;
      used = w;
    }
  }
  return lines;
}

/** `lineCount` for a headline set one sentence to a line (see `splitSentences`). */
export function headlineLines(text: string, meta: FontMeta, weight: number, size: number, width: number, exact = false): number {
  return splitSentences(text).reduce((n, seg) => n + lineCount(seg, meta, weight, size, width, exact), 0);
}

/** The widest line of a setting in px (for a block that hugs its text). */
export function widestLine(text: string, meta: FontMeta, weight: number, size: number, width: number, exact = false): number {
  const limit = width * 0.95;
  const space = spaceEm(meta, weight, exact) * size;
  let widest = 0;
  for (const seg of splitSentences(text)) {
    let used = 0;
    for (const word of seg.trim().split(/ +/)) {
      const w = emWidth(word, meta, weight, exact) * size;
      if (used === 0) used = w;
      else if (used + space + w <= limit) used += space + w;
      else {
        widest = Math.max(widest, used);
        used = w;
      }
    }
    widest = Math.max(widest, used);
  }
  return Math.min(width, widest);
}
