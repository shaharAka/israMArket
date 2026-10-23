import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function moduleAt(path) {
  const exports={};
  const source=fs.readFileSync(new URL(path,import.meta.url),"utf8");
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled,{exports,URL,Number});
  return exports;
}
const {briefLearning}=moduleAt("../lib/campaignEvidence.ts");
const draft={informed_by_note:"Applied a deadline",learning:"More clicks",results:{value:21,updated_at:"2026-10-24",matched_by:["tracked_link"]}};
assert.equal(briefLearning(draft),null,"a draft's applied change is not a measured finding");
assert.equal(briefLearning({...draft,published_url:"https://example.com/p/1"}),"More clicks");
assert.equal(briefLearning({...draft,published_at:"2026-10-23",results:{...draft.results,value:0}}),"More clicks","zero is measured");
for(const value of [null,undefined,Infinity,NaN])assert.equal(briefLearning({...draft,published_at:"2026-10-23",results:{...draft.results,value}}),null);
assert.equal(briefLearning({...draft,published_at:"2026-10-23",results:{...draft.results,matched_by:[]}}),null);
assert.equal(briefLearning({...draft,published_at:"2026-10-23",results:{...draft.results,updated_at:""}}),null);
const {signInDestination,safeReturnPath}=moduleAt("../lib/authNavigation.ts");
assert.equal(signInDestination(null,{onboarding_complete:true},"he"),"/campaign?lang=he");
assert.equal(signInDestination(null,{quarter_plan:{}},"en"),"/campaign?lang=en");
assert.equal(signInDestination(null,null,"ar"),"/start?lang=ar");
assert.equal(signInDestination(null,{},"ru"),"/onboarding?lang=ru");
assert.equal(signInDestination("/posts?post=2&lang=en",null,"he"),"/posts?post=2&lang=en");
assert.equal(safeReturnPath("https://example.com"),null);
console.log("Campaign evidence and owner navigation: 15 checks passed");
