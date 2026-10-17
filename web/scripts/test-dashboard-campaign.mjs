import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const cache=new Map();
function load(file){
 file=path.extname(file)?file:file+'.ts';if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 const {outputText}=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 vm.runInNewContext(outputText,{exports,require:spec=>load(spec.startsWith('@/')?path.join(root,spec.slice(2)):path.resolve(path.dirname(file),spec))},{filename:file});return exports;
}
const {dashboardCampaign,readDashboardSource}=load(path.join(root,'lib/dashboardCampaign.ts'));
const post=(id,week,state='ready')=>Object.freeze({uid:id,title:id,week,lifecycle:state});
const plan=posts=>({year:2026,month:9,roadmap:{posts}});
const old=new Date(2026,9,17),current=new Date(2026,8,18);
const linked={...post('linked',1),plan_link:{week:3}};
let result=dashboardCampaign(plan([post('out',1,'published'),linked]),old);
assert.equal(result.week,3,'Outside the month, use the actual plan-link week of pending work');
assert.equal(result.nextIndex,1);assert.equal(result.action,'review');assert.equal(result.posts[0].post.uid,'linked');
result=dashboardCampaign(plan([post('earlier',1),post('this-week',3)]),current);
assert.equal(result.week,3,'Within the month, show the current week, even with older work pending');assert.equal(result.posts[0].post.uid,'this-week');
assert.equal(result.nextIndex,0,'Earlier pending work remains accessible through the primary action');
result=dashboardCampaign(plan([post('published',1,'published'),post('approved',2,'approved'),post('measured',1,'measured')]),old);
assert.equal(result.action,'publish');assert.equal(result.nextIndex,1,'Do not ask to approve published or measured posts');
result=dashboardCampaign(plan([post('published',1,'published'),post('measured',2,'measured')]),old);
assert.equal(result.nextIndex,-1);assert.equal(result.action,'results');
result=dashboardCampaign(plan([post('no-date',undefined)]),old);
assert.equal(result.week,0,'Unknown week stays unknown');
result=dashboardCampaign(plan([post('only-week-one',1)]),current);
assert.equal(result.week,3);assert.equal(result.posts.length,0,'An empty current week must not masquerade as another week');
assert.equal(dashboardCampaign(plan([post('end',4)]),new Date(2026,8,30)).week,4);
result=dashboardCampaign({...plan([post('quick',0)]),post_workspace_only:true},current);
assert.equal(result.week,0,'Standalone drafts do not belong to the current campaign week');assert.equal(result.posts.length,1,'Quick posts stay visible before a plan exists');
console.log('Dashboard: plan-linked/current/unknown/empty weeks and review → publish → results navigation passed.');

let fallbackCalls=0;
const workspace=async()=>{fallbackCalls++;return {post_workspace_only:true,roadmap:{posts:[post('quick',0)]}};};
assert.equal((await readDashboardSource(async()=>plan([]),workspace)).roadmap.posts.length,0);
assert.equal(fallbackCalls,0,'An existing plan does not need another data request');
assert.equal((await readDashboardSource(async()=>{throw {status:404};},workspace)).post_workspace_only,true);
assert.equal(fallbackCalls,1,'A missing plan can still have a quick-post workspace');
for(const status of [401,403,500]){
 await assert.rejects(readDashboardSource(async()=>{throw {status};},workspace),error=>error.status===status);
}
assert.equal(fallbackCalls,1,'Permission and service failures never masquerade as an empty plan');
console.log('Dashboard source fallback preserves quick posts and real access/network errors.');
