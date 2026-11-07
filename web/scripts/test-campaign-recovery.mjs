import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compiled=ts.transpileModule(fs.readFileSync(new URL('../lib/campaignRecovery.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};vm.runInNewContext(compiled,{exports,Promise});
const {loadCampaignWorkspace:load}=exports;
const plan={posts:['saved post']},allowance={remaining:2},history={revisions:['pending']};
const pass=value=>()=>Promise.resolve(value), fail=value=>()=>Promise.reject(value);
let r=await load({plan:pass(plan),allowance:fail(Error('offline')),history:pass(history)});
assert.equal(r.plan,plan);assert.equal(r.history,history);assert.equal(r.allowance,null);assert.equal(r.unavailable.join(','),'allowance');
r=await load({plan:pass(plan),allowance:pass(allowance),history:fail(Error('offline'))});
assert.equal(r.plan,plan);assert.equal(r.history,null);assert.equal(r.unavailable.join(','),'history');
r=await load({plan:pass(plan),allowance:fail(Error('offline')),history:fail(Error('offline'))});
assert.equal(r.plan,plan);assert.equal(r.unavailable.length,2);
for(const slot of ['plan','allowance','history']){
 const auth={status:401}; const deps={plan:pass(plan),allowance:pass(allowance),history:pass(history),[slot]:fail(auth)};
 await assert.rejects(load(deps),e=>e===auth,'expired access is never swallowed as optional missing data');
}
const missing={status:404};await assert.rejects(load({plan:fail(missing),allowance:pass(allowance),history:pass(history)}),e=>e===missing);
r=await load({plan:pass(plan),allowance:pass(allowance),history:pass(history)});assert.equal(r.history,history);assert.equal(r.unavailable.length,0);
console.log('Campaign recovery: optional failures, auth expiry, missing plans and recovered reads passed');
