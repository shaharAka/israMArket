import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/finding-values.ts", import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText, { exports, Intl });
const { formatFindingValue: format } = exports;
for (const locale of ["he-IL", "en-US", "ar", "ru-RU"]) {
  for (const currency of ["USD", "ILS", "EUR"]) {
    assert.equal(format({ value: 12.34, unit: "money", currency }, locale),
      new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(12.34));
  }
}
assert.equal(format({ value: 0, unit: "money", currency: "USD" }, "en-US"), "$0.00");
assert.equal(format({ value: 0.24, unit: "ratio" }, "en-US"), "0.24×");
assert.equal(format({ value: 1000 }, "en-US"), "1,000");
assert.equal(format({ value: 12, unit: "money", currency: "USDX" }, "en-US"), "12");
assert.equal(format({ value: 12, unit: "money" }, "en-US"), "12");
console.log("Finding values: source currencies in all four locales; zero, ratios and legacy snapshots passed");
