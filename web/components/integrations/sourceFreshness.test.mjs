import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('./sourceFreshness.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { materiallyOlder } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const reading = { readAt: '2026-10-09T10:00:00Z', start: '2026-09-11', end: '2026-10-08' };
test('independent reads seconds apart do not produce a stale-data warning', () => {
  assert.equal(materiallyOlder(reading, { ...reading, readAt: '2026-10-09T10:00:30Z' }), false);
});
test('an older reporting window is significant even on the same day', () => {
  assert.equal(materiallyOlder(reading, { ...reading, readAt: '2026-10-09T10:00:30Z', end: '2026-10-09' }), true);
});
test('a source a day behind is significant', () => {
  assert.equal(materiallyOlder(reading, { ...reading, readAt: '2026-10-10T10:00:00Z' }), true);
});
test('equivalent timezone timestamps and invalid timestamps are not misordered', () => {
  assert.equal(materiallyOlder(reading, { ...reading, readAt: '2026-10-09T13:00:00+03:00' }), false);
  assert.equal(materiallyOlder({ readAt: 'invalid' }, reading), false);
  assert.equal(materiallyOlder(reading, { ...reading, readAt: '2026-10-09T09:00:00Z' }), false);
});
