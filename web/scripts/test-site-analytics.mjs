import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../lib/siteAnalytics.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
function review(url='https://www.isramarket.co.il/',consent=null){
 const cookies=new Map(consent?[['isramarket_analytics',consent]]:[]),scripts=[],local=new Map(),session=new Map();
 const location=new URL(url),document={head:{appendChild:script=>scripts.push(script)},documentElement:{lang:'he'},referrer:'https://www.google.com/search?q=private-example',getElementById:id=>scripts.find(s=>s.id===id),createElement:()=>({})};
 Object.defineProperty(document,'cookie',{configurable:true,get:()=>[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),set:value=>{const [pair,...attrs]=value.split(';');const i=pair.indexOf('=');if(attrs.some(a=>a.trim()==='Max-Age=0'))cookies.delete(pair.slice(0,i));else cookies.set(pair.slice(0,i),pair.slice(i+1));}});
 const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
 const window={location,addEventListener:()=>{},removeEventListener:()=>{},dispatchEvent:()=>{},setTimeout:()=>0};
 const exports={};vm.runInNewContext(outputText,{exports,process:{env:{NEXT_PUBLIC_GA_MEASUREMENT_ID:'G-TEST1'}},window,location,document,navigator:{userAgent:'Mozilla/5.0'},localStorage:storage(local),sessionStorage:storage(session),URL,URLSearchParams,Event:class{},Date},{filename:'siteAnalytics.ts'});
 return {api:exports,cookies,scripts,window,location,local,document,events:()=>window.dataLayer?.filter(row=>row[0]==='event')||[]};
}
let q=review();q.api.trackWebsitePage('/');assert.equal(q.scripts.length,0,'No Google resource before consent');assert.equal(q.events().length,0);
q=review(undefined,'denied');q.api.trackWebsitePage('/');assert.equal(q.scripts.length,0,'Refusal sends no Google request, including consent pings');
q=review('https://www.isramarket.co.il/?email=private%40example.com&code=secret&post_uid=customer-id','granted');q.api.trackWebsitePage('/');
assert.equal(q.scripts.length,1);assert.equal(Object.prototype.toString.call(q.events()[0]),'[object Arguments]','Use Google’s standard gtag command queue');assert.equal(q.events().length,1);assert.equal(q.events()[0][2].page_location,'https://www.isramarket.co.il/');assert.equal(q.events()[0][2].page_referrer,'https://www.google.com/');
assert.doesNotMatch(JSON.stringify(q.window.dataLayer),/private|secret|customer-id|post_uid|search\?q/,'Raw query and referrer content never enter the tag queue');
q.api.trackWebsitePage('/');assert.equal(q.events().length,1,'Hydration and duplicate effects do not duplicate page views');
q.api.trackWebsitePage('/signup');q.api.trackWebsitePage('/');assert.equal(q.events().length,3,'Actual public route changes are measured');assert.equal(q.scripts.length,1);
for(const path of ['/integrations','/dashboard','/posts','/design/hero','/preview','/admin','/reset/customer-token','/backend/auth/google/callback']){
 const c=review('https://www.isramarket.co.il'+path,'granted');c.api.trackWebsitePage(path);assert.equal(c.scripts.length,0,`No tag on ${path}`);assert.equal(c.api.publicAnalyticsPath(path),null);
}
for(const url of ['http://localhost:3130/','http://127.0.0.1:3130/','https://example.com/','https://www.isramarket.co.il/?mock=1','https://www.isramarket.co.il/start?phase=after','https://www.isramarket.co.il/?review_step=metrics','https://www.isramarket.co.il/?composition=workspace','https://www.isramarket.co.il/?internal=1']){
 const c=review(url,'granted');c.api.trackWebsitePage(c.location.pathname);assert.equal(c.scripts.length,0,`Excluded: ${url}`);
}
q=review(undefined,'granted');q.local.set('isramarket_demo','1');q.api.trackWebsitePage('/');assert.equal(q.scripts.length,0);
q=review('https://www.isramarket.co.il/?internal=1','granted');q.api.trackWebsitePage('/');q.location.search='';q.api.trackWebsitePage('/');assert.equal(q.scripts.length,0,'Internal choice survives navigation');
q=review('https://www.isramarket.co.il/start','granted');q.api.trackInterviewStart();q.api.trackInterviewStart();assert.equal(q.events().filter(e=>e[1]==='begin_interview').length,1,'A session has one interview start');
q=review('https://www.isramarket.co.il/signup','granted');q.cookies.set('isramarket_signup_event','email');q.api.consumeSignupEvent();q.api.consumeSignupEvent();assert.equal(q.events().filter(e=>e[1]==='sign_up').length,1);assert.equal(q.events()[0][2].method,'email');assert.equal(q.cookies.has('isramarket_signup_event'),false);
q=review('https://www.isramarket.co.il/dashboard','granted');q.cookies.set('isramarket_signup_event','google');q.api.consumeSignupEvent();assert.equal(q.events()[0][1],'sign_up');assert.equal(q.events()[0][2].page_location,'https://www.isramarket.co.il/signup','A Google redirect never sends the private route');
q=review(undefined,'denied');q.cookies.set('isramarket_signup_event','google');q.api.consumeSignupEvent();assert.equal(q.events().length,0);assert.equal(q.scripts.length,0);
q=review(undefined,'granted');q.cookies.set('_ga','one');q.cookies.set('_ga_TEST','two');q.cookies.set('session','kept');q.api.trackWebsitePage('/');q.api.chooseAnalytics('denied');assert.equal(q.window['ga-disable-G-TEST1'],true);assert.equal(q.cookies.has('_ga'),false);assert.equal(q.cookies.has('_ga_TEST'),false);assert.equal(q.cookies.get('session'),'kept');const before=q.events().length;q.api.trackWebsitePage('/signup');assert.equal(q.events().length,before,'Withdrawal blocks later events');
q=review('https://www.isramarket.co.il/?analytics_test=1','granted');q.api.trackWebsitePage('/');assert.equal(q.events()[0][2].debug_mode,true);assert.equal(q.events()[0][2].traffic_type,'internal');
q=review('https://www.isramarket.co.il/start','granted');q.document.head.appendChild=()=>{throw new Error('Resource blocked')};assert.doesNotThrow(()=>q.api.trackInterviewStart());assert.equal(q.window['ga-disable-G-TEST1'],true);
q=review();Object.defineProperty(q.document,'cookie',{get:()=>{throw new Error('Cookies blocked')},set:()=>{throw new Error('Cookies blocked')}});assert.doesNotThrow(()=>q.api.chooseAnalytics('denied'));assert.equal(q.api.analyticsChoice(),'denied');
console.log('Website Analytics: consent/refusal/withdrawal, safe URLs/referrers, private/local/demo/internal exclusion, SPA deduplication and real signup receipts passed.');
