import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/productJourney.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
const exports={};vm.runInNewContext(outputText,{exports});
for(const segment of ['services','online_shop','physical_shop','software','fundraising']){
 const before=Array.from(exports.interviewSteps({phase:'before',segment}));
 assert.equal(before.at(-1),'signup',segment+': signup remains the gate');
 for(const gated of ['sources','connections','detail','metrics','build'])assert(!before.includes(gated),segment+': no account-only work before signup');
 const after=Array.from(exports.interviewSteps({phase:'after',segment}));
 assert(after.indexOf('connections')<after.indexOf('detail'),segment+': connected context before deeper research');
 assert(after.indexOf('detail')<after.indexOf('metrics'),segment+': goals follow research');
 assert(after.indexOf('metrics')<after.indexOf('build'),segment+': goals precede plan');
 assert.equal(new Set(after).size,after.length,segment+': saved step IDs unambiguous');
 assert.deepEqual([...after].sort(),[...(segment==='software'?['software_offer','software']:[]),'sources','connections','metrics','detail','build'].sort(),segment+': legacy resume destinations retained');
}
assert.equal(exports.interviewChapter('metrics'),'goals');
assert.equal(exports.interviewChapter('build'),'plan');
console.log('Five business routes retain signup boundary and resume destinations; research precedes goals and plan.');
