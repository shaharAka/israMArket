import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const { outputText } = ts.transpileModule(readFileSync(new URL("./connectionSummary.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { connectionSummary: summary } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const item = (status, read = "unchecked", connected = false) => ({ status, connected, source_readiness: { status: read } });

test("Analytics permission returns ask for selection instead of consent again", () => {
  assert.equal(summary("ga4", item("select_property")).action, "לבחור את האתר");
  assert.match(summary("ga4", item("select_property")).label, /אושרה/);
});
test("Search Console does not borrow Analytics state", () => {
  assert.equal(summary("search_console", item("select_site", "choose_site")).action, "לבחור את האתר");
  assert.equal(summary("search_console", item("connected", "ready", true)).label, "הנתונים נקראו");
});
test("missing Google assets offer a different account", () => {
  for (const state of ["no_properties", "no_sites"]) assert.equal(summary("ga4", item("select_property", state)).action, "לבחור חשבון גוגל אחר");
});
test("Meta partial consent stops at selecting the business", () => {
  for (const state of ["select_page", "select_assets"]) assert.equal(summary("meta", item(state)).action, "לבחור את העסק");
});
test("selected account still needs a successful read", () => {
  assert.equal(summary("ga4", item("connected", "unchecked", true)).action, "לבדוק את הנתונים");
  assert.doesNotMatch(summary("ga4", item("connected", "unchecked", true)).label, /נקראו/);
});
test("an empty read is a successful setup, not invented activity", () => {
  assert.equal(summary("search_console", item("connected", "empty", true)).label, "הקריאה הצליחה. עוד אין פעילות");
});
test("revoked access overrides old connected state", () => {
  assert.equal(summary("meta", item("connected", "permission", true)).action, "לחדש את הגישה");
  assert.equal(summary("ga4", item("reconnect", "ready", false)).action, "לחדש את הגישה");
});
test("TikTok uses its actual read result and never a generic ready state", () => {
  const tiktok = { ...item("connected", "ready", true), tiktok_data: { source_readiness: { status: "unavailable" } } };
  assert.equal(summary("tiktok", tiktok).action, "לבדוק את הנתונים");
});
test("disabled providers do not promise a working connection", () => {
  assert.equal(summary("tiktok", item("connected", "ready", true), false).action, "לראות את אפשרויות החיבור");
});
