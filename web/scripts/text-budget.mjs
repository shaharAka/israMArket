/**
 * Text budget check for signed-in pages (DESIGN-STANDARD.md, "Text budget").
 *
 * Loads each route in the explicit demo (no customer data, no writes) with headless Chrome
 * at 390 and 1440 and reports, for the page content (`<main>`):
 *   - visible words above the fold (budget: 80 at 390, 120 at 1440)
 *   - paragraphs longer than two lines at 390
 *   - disclosures (`<details>` and in-page `aria-expanded` toggles), above the fold, and
 *     nested ones (a disclosure inside a disclosure, sheet or dialog)
 * It exits 1 when a page is over the word budget, has a paragraph over two lines, has more
 * than two disclosures above the fold, or nests a disclosure.
 *
 * Needs a running build; it is not part of CI. From web/:
 *   npx next build && npx next start -p 3141
 *   node scripts/text-budget.mjs --base http://localhost:3141 /campaign /account
 * Options: --base <url> (default http://localhost:3141), --json <file>, --viewport 390|1440,
 * --no-fail (report only). Chrome: CHROME_PATH, default the macOS Google Chrome app.
 * Customer content (post captions, the business's own answers) can be excluded from the
 * count with `data-text-budget="content"` on its container.
 */
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const BUDGET = { 390: { words: 80 }, 1440: { words: 120 } };
const MAX_LINES = 2;
const MAX_DISCLOSURES_ABOVE_FOLD = 2;
const VIEWPORTS = {
  390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  1440: { width: 1440, height: 900, deviceScaleFactor: 1 },
};

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); if (i < 0) return undefined; const [, value] = args.splice(i, 2); return value; };
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const base = (option("--base") ?? "http://localhost:3141").replace(/\/$/, "");
const jsonOut = option("--json");
const onlyViewport = option("--viewport");
const noFail = flag("--no-fail");
const routes = args.length ? args : ["/campaign"];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Runs in the page. */
function measure({ maxLines }) {
  const main = document.querySelector("main") ?? document.body;
  const vh = innerHeight;
  const skip = el => el.closest('[aria-hidden="true"], [data-text-budget="content"], nav, aside, .sr-only, script, style, noscript, svg, button, a, input, textarea, select, [contenteditable="true"]');
  const shown = el => el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true;

  // Words above the fold.
  let words = 0;
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    const parent = node.parentElement;
    if (!text || !parent || !shown(parent) || parent.closest('[aria-hidden="true"], [data-text-budget="content"], .sr-only, script, style, svg')) continue;
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
    if (!rects.some(r => r.bottom > 0 && r.top < vh)) continue;
    words += text.split(/\s+/).filter(token => /[\p{L}\p{N}]/u.test(token)).length;
  }

  // Paragraphs: a block with its own running text, measured in rendered lines.
  const long = [];
  for (const el of main.querySelectorAll("p, li, dd, dt, label, blockquote, div, span, small, figcaption, h1, h2, h3, h4")) {
    if (skip(el) || !shown(el)) continue;
    const display = getComputedStyle(el).display;
    if (display.startsWith("inline") || display === "contents" || display === "none") continue;
    const inline = [...el.childNodes].filter(child => child.nodeType === Node.TEXT_NODE ? child.textContent.trim() :
      child.nodeType === Node.ELEMENT_NODE && getComputedStyle(child).display.startsWith("inline") && !child.matches("svg, img, button, input, select"));
    if (!inline.some(child => child.nodeType === Node.TEXT_NODE)) continue;
    const tops = [];
    for (const child of inline) {
      range.selectNode(child);
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 4) continue;
        if (!tops.some(top => Math.abs(top - r.top) < r.height * 0.5)) tops.push(r.top);
      }
    }
    if (tops.length > maxLines) {
      const text = el.innerText.trim().replace(/\s+/g, " ");
      long.push({ lines: tops.length, words: text.split(" ").length, text: text.slice(0, 70) });
    }
  }

  // Disclosures.
  const toggles = [...main.querySelectorAll("details, [aria-expanded]")].filter(el => shown(el) && !el.closest("nav, aside") && !el.hasAttribute("aria-haspopup"));
  const disclosures = toggles.filter(el => el.tagName === "DETAILS" || !el.closest("details"));
  const aboveFold = disclosures.filter(el => el.getBoundingClientRect().top < vh).length;
  const nested = disclosures.filter(el => (el.parentElement?.closest("details") || el.closest('[role="dialog"], dialog[open]')))
    .map(el => (el.querySelector("summary")?.innerText ?? el.innerText ?? "").trim().slice(0, 50));
  return { words, long, disclosures: disclosures.length, aboveFold, nested, height: Math.round(document.documentElement.scrollHeight / vh * 10) / 10 };
}

async function skipWelcome(page) {
  for (let i = 0; i < 3; i++) {
    const clicked = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find(b => /^\s*(לדלג|Skip)\s*$/.test(b.textContent || "") && b.getBoundingClientRect().width > 0);
      button?.click();
      return Boolean(button);
    });
    if (!clicked) return;
    await sleep(400);
  }
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check", "--lang=he-IL"],
});
const results = [];
try {
  for (const width of Object.keys(VIEWPORTS).filter(w => !onlyViewport || w === onlyViewport)) {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORTS[width]);
    await page.goto(`${base}/login`, { waitUntil: "networkidle2" });
    await page.evaluate(() => localStorage.setItem("isramarket_demo", "1"));
    for (const route of routes) {
      await page.goto(base + route, { waitUntil: "networkidle2", timeout: 60000 });
      await sleep(1500);
      await skipWelcome(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(400);
      const m = await page.evaluate(measure, { maxLines: MAX_LINES });
      const failures = [];
      if (m.words > BUDGET[width].words) failures.push(`${m.words} words above the fold (budget ${BUDGET[width].words})`);
      if (width === "390" && m.long.length) failures.push(`${m.long.length} paragraph(s) over ${MAX_LINES} lines`);
      if (m.aboveFold > MAX_DISCLOSURES_ABOVE_FOLD) failures.push(`${m.aboveFold} disclosures above the fold (max ${MAX_DISCLOSURES_ABOVE_FOLD})`);
      if (m.nested.length) failures.push(`${m.nested.length} nested disclosure(s)`);
      results.push({ route, width: Number(width), ...m, long: width === "390" ? m.long : [], failures });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

const pad = (value, n) => String(value).padEnd(n);
console.log(pad("route", 18), pad("vp", 5), pad("words", 7), pad("long¶", 6), pad("discl.", 7), pad("fold", 5), pad("nested", 7), "result");
for (const r of results) {
  console.log(pad(r.route, 18), pad(r.width, 5), pad(r.words, 7), pad(r.width === 390 ? r.long.length : "-", 6), pad(r.disclosures, 7), pad(r.aboveFold, 5), pad(r.nested.length, 7), r.failures.length ? "FAIL" : "ok");
  for (const p of r.long) console.log(`    ${p.lines} lines, ${p.words} words: ${p.text}`);
  for (const n of r.nested) console.log(`    nested: ${n}`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2) + "\n");
if (!noFail && results.some(r => r.failures.length)) process.exitCode = 1;
