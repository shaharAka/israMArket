import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const { outputText } = ts.transpileModule(readFileSync(new URL("./trackingGuideDraft.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { restoreTrackingDraft: restore, trackingGuideKey: key } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("each business and provider resumes only its own instructions", () => {
  const storage = new Map([[key(1, "meta"), JSON.stringify({ platform: "wix", step: "check", verified: true })]]);
  assert.deepEqual(restore(storage.get(key(1, "meta"))), { platform: "wix", step: "check" });
  for (const other of [key(2, "meta"), key(1, "google"), key(1, "tiktok")]) {
    assert.deepEqual(restore(storage.get(other)), { platform: "", step: "platform" });
  }
  assert.equal(key(undefined, "meta"), "");
});
test("already installed resumes the real check without inventing a platform or verification", () => {
  assert.deepEqual(restore('{"platform":"","step":"check","verified":true}'), { platform: "", step: "check" });
});
test("invalid or obsolete drafts cannot block setup", () => {
  for (const value of ["{", "null", '{"platform":"wix","step":"done"}', '{"platform":"unknown","step":"install"}']) {
    assert.deepEqual(restore(value), { platform: "", step: "platform" });
  }
});
