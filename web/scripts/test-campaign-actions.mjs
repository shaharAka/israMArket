import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const cache=new Map();
function load(file) {
  file=path.extname(file)?file:file+'.ts';
  if(cache.has(file)) return cache.get(file);
  const exports={}; cache.set(file,exports);
  const {outputText}=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  vm.runInNewContext(outputText,{exports,require:spec=>spec==='@/lib/api'?{}:load(spec.startsWith('@/')?path.join(root,spec.slice(2)):path.resolve(path.dirname(file),spec))},{filename:file});
  return exports;
}
const {nextCampaignPost,toggleCampaignSelection}=load(path.join(root,'lib/campaign.ts'));
const post=(uid,lifecycle='ready',extra={})=>Object.freeze({uid,title:uid,lifecycle,...extra});
const out=post('out','published',{published_url:'https://example.test/published'});
const approved=post('approved','approved',{approval_status:'approved'});
const scheduled=post('scheduled','approved',{approval_status:'approved',scheduled_for:'2026-10-28'});
const draft=post('draft');
const needs=post('needs','needs_owner');
let next=nextCampaignPost([out,scheduled,approved,needs,draft]);
assert.equal(next.index,3); assert.equal(next.action,'review','Owner work comes before publishing already-approved work');
next=nextCampaignPost([out,scheduled,approved]);
assert.equal(next.index,2); assert.equal(next.action,'publish');
for(const posts of [[],[out],[scheduled],[post('measured','measured',{published_at:'2026-10-01'})]]) {
  next=nextCampaignPost(posts); assert.equal(next.index,-1); assert.equal(next.action,'results','Published/scheduled work must not be sent for approval/publication again');
}
assert.equal(nextCampaignPost([post('stale','ready',{approval_status:'approved'}),draft]).index,1,'Stored approval protection beats an inconsistent lifecycle');
for (const state of ['scheduled','published']) assert.equal(nextCampaignPost([post('legacy','ready',{approval_status:state}),draft]).index,1,'Older protected states without timestamps remain protected');
const drafts=[draft,needs,post('third'),post('fourth')];
const posts=Object.freeze([...drafts,approved,scheduled,out,post('unidentified')]);
let selected=Object.freeze([]);
for(const item of drafts.slice(0,3)) selected=Object.freeze(toggleCampaignSelection(posts,selected,item.uid));
assert.equal(selected.join(','),'draft,needs,third');
for(const uid of ['fourth','approved','scheduled','out','missing','']) assert.strictEqual(toggleCampaignSelection(posts,selected,uid),selected,'A fourth or protected/unknown post never enters the batch');
selected=toggleCampaignSelection(posts,selected,'needs');
assert.equal(selected.join(','),'draft,third','The selected post can be removed even at the cap');
assert.equal(toggleCampaignSelection(posts,selected,'fourth').join(','),'draft,third,fourth');
assert.equal(posts[0],draft,'Selection never rewrites saved content');
console.log('Campaign: lifecycle-aware next action, scheduled/published protection, explicit draft selection and 3-post cap passed.');
