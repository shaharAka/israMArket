/** Audit translated source copy without importing the app or making provider calls. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = JSON.parse(fs.readFileSync(path.join(root, "web/lib/i18n/source.json"), "utf8"));
const review = JSON.parse(fs.readFileSync(path.join(root, "web/lib/i18n/reviewed.json"), "utf8"));
const failures = [];
const stats = {};

const placeholders = text => [...text.matchAll(/\{arg_\d+\}/g)].map(m => m[0]).sort();
const numbers = text => [...text.replace(/\{arg_\d+\}/g, "").matchAll(/\d+(?:[,.]\d+)*/g)].map(m => m[0]).sort();
const urls = text => [...text.matchAll(/https?:\/\/[^\s<>"`]+/g)].map(m => m[0]);
const identifiers = text => [...text.matchAll(/[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g)].map(m => m[0]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function reviewedNumbers(id, locale, text) {
  const values = numbers(text);
  for (const item of review.numberForms?.[id]?.[locale] ?? []) {
    const word = item.form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = [...text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${word}(?![\\p{L}\\p{N}_])`, "gu"))].length;
    values.push(...Array(count).fill(item.value));
  }
  return values.sort();
}

for (const [id, entry] of Object.entries(source)) {
  const expected = "m_" + crypto.createHash("sha256").update(entry.source).digest("hex").slice(0, 16);
  if (expected !== id) failures.push({ id, issue: "source hash" });
  if (!entry.references?.length) failures.push({ id, issue: "missing source reference" });
}

for (const locale of ["he", "en", "ar", "ru"]) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, `web/lib/i18n/messages/${locale}.json`), "utf8"));
  let complete = 0;
  for (const [id, entry] of Object.entries(source)) {
    const translated = catalog[id];
    const issue = typeof translated !== "string" || !translated.trim() ? "missing" :
      !same(placeholders(entry.source), placeholders(translated)) ? "placeholders" :
      !same(numbers(entry.source), reviewedNumbers(id, locale, translated)) ? "numbers" :
      ["₪", "%", "$", "€"].some(symbol => entry.source.split(symbol).length !== translated.split(symbol).length) ? "currency/percent" :
      urls(entry.source).some(url => !translated.includes(url)) ? "URL" :
      identifiers(entry.source).some(token => !translated.includes(token)) ? "email/API identifier" : "";
    if (issue) failures.push({ locale, id, issue, file: entry.references[0].file });
    else complete++;
  }
  for (const id of Object.keys(catalog)) {
    if (!source[id]) failures.push({ locale, id, issue: "orphan message" });
  }
  for (const [id, reviewed] of Object.entries(review.messages ?? {})) {
    if (source[id] && Object.hasOwn(reviewed, locale) && reviewed[locale] !== catalog[id]) {
      failures.push({ locale, id, issue: "reviewed meaning changed; review the copy in context" });
    }
  }
  stats[locale] = { translated: complete, required: Object.keys(source).length };
}

console.log(JSON.stringify({ stats, failures: failures.slice(0, 40), totalFailures: failures.length }, null, 2));
if (failures.length) process.exitCode = 1;
