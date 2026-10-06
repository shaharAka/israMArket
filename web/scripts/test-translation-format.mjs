import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import crypto from "node:crypto";

// Test the actual formatter without adding a runtime/test dependency to the app.
const text = fs.readFileSync(new URL("../lib/i18n/messages.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const exports = {};
vm.runInNewContext(outputText, { exports, Object, Error, String });
const { formatMessage, createTranslator } = exports;

assert.equal(formatMessage("{arg_1}: {arg_0}", { arg_0: "3,000–7,000 ₪", arg_1: "Диапазон" }), "Диапазон: 3,000–7,000 ₪");
assert.equal(formatMessage("{arg_0} / {arg_0}", { arg_0: 0 }), "0 / 0");
assert.equal(formatMessage("{arg_0}", { arg_0: "<script>{arg_1}</script>" }), "<script>{arg_1}</script>");
assert.throws(() => formatMessage("{arg_0}"), /Missing translation argument/);
assert.throws(() => formatMessage("{arg_0}", Object.create({ arg_0: "inherited" })), /Missing translation argument/);
assert.throws(() => createTranslator({})("unknown"), /Missing translated message/);
assert.throws(() => createTranslator({})("toString"), /Missing translated message/);
assert.equal(createTranslator({ hello: "مرحبًا {arg_0}" })("hello", { arg_0: "Студия" }), "مرحبًا Студия");
console.log("Translation formatter: 8 checks passed");

const idSource = fs.readFileSync(new URL("../lib/i18n/message-id.ts", import.meta.url), "utf8");
const idModule = {};
vm.runInNewContext(ts.transpileModule(idSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: idModule, TextEncoder });
const sources = JSON.parse(fs.readFileSync(new URL("../lib/i18n/messages/he.json", import.meta.url), "utf8"));
for (const [expected, source] of Object.entries(sources)) assert.equal(idModule.messageId(source), expected);
for (const source of ["", "abc", "עברית / العربية / Русский / English ☀️", "x".repeat(100000)]) {
  assert.equal(idModule.messageId(source), "m_" + crypto.createHash("sha256").update(source).digest("hex").slice(0,16));
}
console.log(`Runtime source IDs: ${Object.keys(sources).length} catalog messages and UTF-8/block boundaries match independent Node crypto`);
