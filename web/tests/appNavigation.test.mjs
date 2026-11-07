import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function moduleAt(path) {
  const exports = {};
  const source = fs.readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled, {exports, URLSearchParams});
  return exports;
}
const nav = moduleAt("../lib/appNavigation.ts");
const posts = moduleAt("../lib/postNavigation.ts");

test("the campaign owns editing and assets while the plan retains its calendar", () => {
  for (const path of ["/campaign", "/posts", "/assets", "/assets/1", "/featured", "/voice"]) assert.equal(nav.appTabFor(path)?.href, "/campaign");
  for (const path of ["/strategy", "/strategy/edit", "/calendar", "/baseline"]) assert.equal(nav.appTabFor(path)?.href, "/strategy");
  assert.equal(nav.appTabFor("/postscript"), null);
  assert.equal(nav.appTabFor("/campaigning"), null);
  assert.equal(nav.appTabFor("/business"), null);
});
test("the compact app header never replaces public-page language controls", () => {
  for (const path of ["/campaign", "/posts", "/account", "/integrations", "/prepare"]) assert.equal(nav.usesAppShell(path), true);
  for (const path of ["/", "/start", "/signup", "/for/services", "/connections/google-analytics", "/preview"]) assert.equal(nav.usesAppShell(path), false);
});
test("the month list resolves to one campaign home and retains the selected week/language", () => {
  assert.equal(posts.postsIndexDestination(new URLSearchParams(), true), "/campaign");
  const destination = new URL(posts.postsIndexDestination(new URLSearchParams("lang=ar&week=3&focus=saved-post"), true), "https://app.example");
  assert.equal(destination.pathname, "/campaign");
  assert.equal(destination.searchParams.get("week"), "3");
  assert.equal(destination.searchParams.get("focus"), "saved-post");
  assert.equal(destination.searchParams.get("lang"), "ar");
  assert.equal(posts.postsIndexDestination(new URLSearchParams(), false), null, "first-month setup remains reachable");
});
test("saved direct editors, old index spelling, calendars and recommendation reviews remain reachable", () => {
  for (const query of ["post=0", "i=2", "view=calendar", "create=1", "recommendation=1&post_uid=owner-post&plan=12"]) {
    assert.equal(posts.postsIndexDestination(new URLSearchParams(query), true), null, query);
  }
});
test("editor return preserves the actual originating post, week and interface language", () => {
  const returned = new URL(posts.campaignReturnHref({uid:"saved post & 1"},4,"ru"),"https://app.example");
  assert.equal(returned.pathname,"/campaign");
  assert.equal(returned.searchParams.get("focus"),"saved post & 1");
  assert.equal(returned.searchParams.get("week"),"4");
  assert.equal(returned.searchParams.get("lang"),"ru");
});
