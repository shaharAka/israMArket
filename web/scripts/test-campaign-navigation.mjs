import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function moduleAt(path, requireModule = () => ({})) {
  const exports = {};
  const source = fs.readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: requireModule });
  return exports;
}

const lifecycle = moduleAt("../lib/postLifecycle.ts", (name) => {
  if (name === "@/lib/dna/library") return { compositionDrawsPhoto: () => false };
  return {};
});
const campaign = moduleAt("../lib/campaign.ts", (name) => {
  if (name === "@/lib/api") return { api: async () => { throw new Error("endpoint should not be called"); } };
  if (name === "./postLifecycle") return lifecycle;
  return {};
});

const post = (uid, lifecycleName, fields = {}) => ({ uid, lifecycle: lifecycleName, ...fields });
const scheduled = post("scheduled", "approved", { approval_status: "scheduled" });
const published = post("published", "published", { published_url: "https://example.test/p/1" });
const pending = post("pending", "needs_owner");
const ready = post("ready", "ready");
const approved = post("approved", "approved", { approval_status: "approved" });

assert.equal(campaign.protectedPost(scheduled), true, "scheduled work cannot be regenerated");
assert.equal(campaign.protectedPost(published), true, "published work cannot be regenerated");
const next = (posts) => JSON.parse(JSON.stringify(campaign.nextCampaignPost(posts)));
assert.deepEqual(next([scheduled, published, pending, ready]), { index: 2, action: "review" });
assert.deepEqual(next([approved]), { index: 0, action: "publish" });
assert.deepEqual(next([scheduled, published]), { index: -1, action: "results" });
assert.deepEqual(next([]), { index: -1, action: "results" });

const drafts = [post("a", "ready"), post("b", "ready"), post("c", "ready"), post("d", "ready"), approved];
let selection = [];
selection = campaign.toggleCampaignSelection(drafts, selection, "a");
selection = campaign.toggleCampaignSelection(drafts, selection, "b");
selection = campaign.toggleCampaignSelection(drafts, selection, "c");
assert.deepEqual(Array.from(selection), ["a", "b", "c"], "batch editing supports three drafts");
assert.equal(campaign.toggleCampaignSelection(drafts, selection, "d"), selection, "the fourth draft cannot exceed the cap");
assert.equal(campaign.toggleCampaignSelection(drafts, selection, "approved"), selection, "approved work cannot enter a batch");
assert.deepEqual(Array.from(campaign.toggleCampaignSelection(drafts, selection, "b")), ["a", "c"], "selected drafts can be removed");
assert.deepEqual(Array.from(campaign.toggleCampaignSelection(drafts, ["approved"], "approved")), [], "a protected post already in the selection can still be removed");
assert.equal(campaign.toggleCampaignSelection(drafts, selection, "missing"), selection, "unknown post ids are ignored");

assert.equal(lifecycle.channelOf({primary_outlet:"linkedin"}), "linkedin");
assert.equal(lifecycle.metricLabel({primary_outlet:"tiktok",measure:{metric:"reach",label_he:"אנשים שראו"}}), "", "manual-only export must not promise an unsupported reach read");
assert.equal(lifecycle.metricLabel({primary_outlet:"tiktok",measure:{metric:"reach",label_he:"אנשים שראו"},results:{value:12}}), "אנשים שראו");
console.log("Campaign navigation, batch selection and manual-channel evidence: 15 checks passed");
