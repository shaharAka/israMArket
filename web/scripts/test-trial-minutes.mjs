import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual helper and formatter against the shipped locale catalogs.
// Extracting its declaration avoids loading React, Next and the trial API in Node.
const trialFile = new URL("../components/trial/TrialGuide.tsx", import.meta.url);
const trialSource = fs.readFileSync(trialFile, "utf8");
const trialAst = ts.createSourceFile(trialFile.pathname, trialSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helper = trialAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "minutesLabel");
assert.ok(helper, "The trial duration formatter exists");
assert.ok(helper.parameters[1] && !helper.parameters[1].initializer && !helper.parameters[1].questionToken,
  "minutesLabel must require the active UI translator");

function loadExports(source) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, Object, String, Error });
  return exports;
}
const { minutesLabel } = loadExports(helper.getText(trialAst));
const { createTranslator } = loadExports(fs.readFileSync(new URL("../lib/i18n/messages.ts", import.meta.url), "utf8"));
const id = source => "m_" + crypto.createHash("sha256").update(source).digest("hex").slice(0, 16);
for (const locale of ["he", "en", "ar", "ru"]) {
  const catalog = JSON.parse(fs.readFileSync(new URL(`../lib/i18n/messages/${locale}.json`, import.meta.url), "utf8"));
  const translate = createTranslator(catalog);
  const t = (source, args) => translate(id(source), args);
  assert.equal(minutesLabel(1, t), catalog[id("דקה")], `${locale}: singular duration`);
  for (const minutes of [2, 10]) {
    const label = minutesLabel(minutes, t);
    assert.equal(label, catalog[id("{arg_0} דק׳")].replace("{arg_0}", String(minutes)), `${locale}: plural duration`);
    assert.ok(!/\{arg_\d+\}/.test(label), `${locale}: duration has no unresolved placeholder`);
  }
}

// Catch the original omission at the dashboard and empty-state call sites too.
let calls = 0;
for (const relative of ["../components/trial/TrialGuide.tsx", "../components/trial/StepLink.tsx", "../app/dashboard/page.tsx"]) {
  const file = new URL(relative, import.meta.url);
  const ast = ts.createSourceFile(file.pathname, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "minutesLabel") {
      calls++;
      assert.equal(node.arguments.length, 2, `${relative}: duration must receive its UI translator`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
assert.equal(calls, 4, "All four trial-duration call sites were checked");
console.log("Trial durations: singular/plural labels in HE/EN/AR/RU and all four translator call sites passed");
