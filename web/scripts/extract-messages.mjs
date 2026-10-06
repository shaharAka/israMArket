/** Source inventory for localization. Never reads environments or customer data.
 * Run from the repository root: node web/scripts/extract-messages.mjs
 * Catalogs are drafts until their route integration and language review are complete.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const root = process.env.ISRAMARKET_I18N_ROOT
  ? path.resolve(process.env.ISRAMARKET_I18N_ROOT)
  : path.resolve(import.meta.dirname, "../..");
const entries = new Map();
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory() && item.name !== "i18n") walk(file);
    else if (item.isFile() && /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file)) files.push(file);
  }
}
for (const part of ["app", "components", "lib"]) walk(path.join(root, "web", part));

export function addMessage(text, reference) {
  const hebrew = /[\u0590-\u05ff]/.test(text);
  if (!hebrew && !(reference.kind === "jsx" || ["display", "validation"].includes(reference.purpose)) ) return;
  if (!hebrew && !/[A-Za-z]/.test(text.replace(/\{arg_\d+\}/g, ""))) return;
  const id = "m_" + crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
  const existing = entries.get(id);
  if (existing && existing.source !== text) throw new Error("Message ID collision");
  const entry = existing ?? { source: text, language: hebrew ? "he" : "en", references: [] };
  if (!entry.references.some(r => r.file === reference.file && r.line === reference.line)) entry.references.push(reference);
  entries.set(id, entry);
}

for (const file of files.sort()) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
    file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    const reference = { file: path.relative(root, file), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 };
    if (ts.isTemplateExpression(node)) {
      let text = node.head.text;
      node.templateSpans.forEach((span, i) => { text += `{arg_${i}}${span.literal.text}`; });
      const parent = node.parent;
      const displayTemplate = ts.isJsxExpression(parent) &&
        (!ts.isJsxAttribute(parent.parent) || /^(title|placeholder|aria-label|alt|label|caption|description)$/.test(parent.parent.name.getText(source)));
      addMessage(text, { ...reference, kind: "template", ...(displayTemplate ? { purpose: "display" } : {}) });
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      const displayAttribute = ts.isJsxAttribute(parent) &&
        /^(title|placeholder|aria-label|alt|label|caption|description)$/.test(parent.name.getText(source));
      const displayProperty = ts.isPropertyAssignment(parent) &&
        /^(label|title|subtitle|description|tooltip|buttonLabel|actionLabel|helper)$/.test(parent.name.getText(source));
      addMessage(node.text, { ...reference, kind: "literal", ...(displayAttribute || displayProperty ? { purpose: "display" } : {}) });
    } else if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, " ").trim();
      addMessage(text, { ...reference, kind: "jsx" });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

// Keep API validation, connector recovery and deterministic analysis labels in the
// same source-linked audit. Generation instructions and logic references are marked
// separately; translating a catalog must never rewrite business rules or prompts.
const apiEntries = JSON.parse(execFileSync("python3", [path.resolve(import.meta.dirname, "../../scripts/extract-api-messages.py"), root], {
  encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
}));
for (const entry of apiEntries) addMessage(entry.source, entry.reference);

const destination = path.join(root, "web/lib/i18n");
fs.mkdirSync(destination, { recursive: true });
// Model instructions are accounted for in the inventory but are not UI copy. They
// need explicit output-language handling, not literal translation inside prompts.
const messages = [...entries].filter(([, entry]) => entry.references.some(reference =>
  reference.purpose !== "generation-instruction" && reference.purpose !== "logic-reference"));
const sorted = Object.fromEntries(messages.sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(path.join(destination, "source.json"), JSON.stringify(sorted, null, 2) + "\n");
fs.mkdirSync(path.join(destination, "messages"), { recursive: true });
fs.writeFileSync(path.join(destination, "messages/he.json"), JSON.stringify(
  Object.fromEntries(Object.entries(sorted).map(([id, message]) => [id, message.source])), null, 2) + "\n");
console.log(JSON.stringify({ files: files.length, messages: messages.length, instructionsExcluded: entries.size - messages.length,
  characters: messages.reduce((n, [, entry]) => n + entry.source.length, 0) }));
