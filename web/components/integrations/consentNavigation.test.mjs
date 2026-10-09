import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('./consentNavigation.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { prefersFullPageConsent } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
for (const [name, narrow, touch, expected] of [
  ['phone', true, true, true], ['small desktop window', true, false, true],
  ['touch tablet', false, true, true], ['desktop with mouse', false, false, false],
]) {
  test(`${name} selects the appropriate consent navigation`, () => {
    assert.equal(prefersFullPageConsent(query => ({ matches: query.includes('width') ? narrow : touch })), expected);
  });
}
