import fs from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import type { SampleBusiness } from "@/lib/dna/samples";
import { DnaQa } from "./DnaQa";
import { normalizeFixture } from "./fixtures";

/**
 * Visual QA for the Design DNA renderer (docs/design-dna.md, Revision 1): real businesses
 * from `fixtures/*.json` first (when there are any), then fictional businesses with
 * hand-written DNAs, three posts each, side by side. Three of the fictional ones are
 * bakeries sharing one photograph — the proof that same-field businesses come out looking
 * like different designers made them. Each business shows its direction in words, never its
 * keys. Not linked from the app; not served in production builds.
 *
 *   /dev/dna                 every business, 4:5
 *   /dev/dna?ratio=1:1       the same at 1:1 (or 9:16)
 *   /dev/dna?only=bonbon     one business (comma-separated ids)
 *   /dev/dna?all=1           every design for every business
 *   /dev/dna?v1=1            a v1 DNA and v1 posts (no direction, no safe area), for compatibility
 *   /dev/dna?nodna=1         old posts of a business with no DNA yet
 *
 * "לייצא את כל הכרטיסים" writes every card as a 1080px PNG, with a JSON beside it (business,
 * design, words), to `.design-review/dna/<ratio>/` under `web/` (or `DNA_EXPORT_DIR`), for a
 * review script to score. Headless, with puppeteer-core:
 *
 *   const page = await browser.newPage();
 *   await page.goto("http://localhost:3119/dev/dna?ratio=4:5", { waitUntil: "networkidle0" });
 *   await page.click("[data-qa-export-all]");
 *   await page.waitForSelector("[data-qa-export-done]", { timeout: 300000 });
 *   const dir = await page.$eval("[data-qa-export-done]", (n) => n.getAttribute("data-qa-export-done"));
 *
 * `window.__dnaQa` then also holds the readability check for every card (smallest text, lines
 * drawn against lines planned).
 */
async function loadFixtures(): Promise<{ businesses: SampleBusiness[]; errors: { file: string; message: string }[] }> {
  const dir = path.join(process.cwd(), "app", "dev", "dna", "fixtures");
  const businesses: SampleBusiness[] = [];
  const errors: { file: string; message: string }[] = [];
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".json")).sort();
  } catch {
    return { businesses, errors };
  }
  for (const file of files) {
    try {
      businesses.push(normalizeFixture(file, JSON.parse(await fs.readFile(path.join(dir, file), "utf8"))));
    } catch (err) {
      errors.push({ file, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { businesses, errors };
}

export default async function DevDnaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const { businesses, errors } = await loadFixtures();
  return <DnaQa fixtures={businesses} fixtureErrors={errors} />;
}
