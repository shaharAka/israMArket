import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const cache = new Map();
function moduleAt(name) {
  if (cache.has(name)) return cache.get(name);
  const exports = {}; cache.set(name, exports);
  const source = fs.readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled, {exports, require: path => moduleAt(path.startsWith('@/lib/') ? path.slice(6) : `dna/${path.replace(/^\.\//,'')}`)});
  return exports;
}
const {resolveDna} = moduleAt('dna/resolve');
for (const colors of [[{hex:'#cc4411'},null,42,'#cc4411'],undefined,[]]) {
  const resolved = resolveDna({version:2, signature:{kind:'corner_mark',use_logo:true,logo_url:'/backend/media/1/logo-abc.png',logo_colors:colors}});
  assert.equal(resolved.signature.logoUrl, '/backend/media/1/logo-abc.png');
  assert.ok(resolved.signature.logoColors.every(color => typeof color === 'string'));
  if (colors?.length) assert.deepEqual([...resolved.signature.logoColors], ['#cc4411']);
}
console.log('Logo rendering survives malformed color evidence and preserves valid logo colors.');
