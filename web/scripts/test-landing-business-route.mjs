import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, dependencies = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(outputText, { exports, require: key => { assert.ok(key in dependencies, `Unexpected import ${key}`); return dependencies[key]; } });
  return exports;
}
const models = load('../lib/businessModel.ts');
const { applyLandingBusinessRoute, changeBusinessRoute } = load('../lib/landingBusinessRoute.ts', { './businessModel': models });
const fresh = () => ({ v: 2, step: 'name', seen: [], draft: { business_name: '', offerings: '', links: {} } });
for (const model of ['products', 'services', 'saas']) {
  const input = fresh();
  const result = applyLandingBusinessRoute(input, model);
  assert.equal(result.draft.business_model, model);
  assert.equal(result.modelConfirmed, true);
  assert.equal(result.step, 'name');
  assert.equal(input.draft.business_model, undefined, 'Do not mutate a saved snapshot');
}
const saved = { ...fresh(), step: 'quarter', modelConfirmed: true,
  draft: { business_name: 'Owner studio', offerings: 'Design work', business_model: 'products', goal: 'sales', links: { website: 'https://example.com' }, baseline: { value: 7 }, target: { value: 12 } },
  plan: { old: true }, quarterPlan: { old: true }, planFor: 'old', quarterPlanFor: 'old', targetSuggestion: { old: true } };
const service = applyLandingBusinessRoute(saved, 'services');
assert.equal(service.step, 'what');
assert.equal(service.draft.business_name, saved.draft.business_name);
assert.equal(service.draft.offerings, saved.draft.offerings);
assert.equal(service.draft.links, saved.draft.links);
assert.equal(service.draft.goal, 'leads');
assert.equal(service.draft.baseline, undefined);
assert.equal(service.draft.target, undefined);
assert.equal(service.plan, null);
assert.equal(service.quarterPlan, null);
assert.equal(service.targetSuggestion, null);
assert.equal(saved.plan.old, true);
assert.equal(applyLandingBusinessRoute(saved, 'saas').step, 'software_offer');
const same = applyLandingBusinessRoute(saved, 'products');
assert.equal(same.step, 'quarter');
assert.equal(same.plan, saved.plan);
assert.equal(same.draft.baseline, saved.draft.baseline);
for (const invalid of [null, '', 'nonprofit', 'invalid']) assert.equal(applyLandingBusinessRoute(saved, invalid), saved);
assert.equal(changeBusinessRoute(service, 'products').draft.goal, 'sales');
console.log('Landing route checks passed: supported routes, draft preservation, derived-data invalidation, resume and unsupported paths.');
