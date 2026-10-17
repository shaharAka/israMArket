import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const { outputText } = ts.transpileModule(readFileSync(new URL("./connectionJourney.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { connectionJourney: journey } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const item = (status = "ready") => ({ provider: "ga4", status: "connected", connected: true, external_id: "example", display_name: "Example", source_readiness: { status } });

test("consent alone advances to selection, not measured data", () => {
  const result = journey("ga4", { ...item(), status: "select_property", connected: false, external_id: "", source_readiness: { status: "choose_property" } }, true);
  assert.deepEqual(result.steps, ["done", "current", "waiting"]);
  assert.equal(result.usable, false);
});
test("an account without Analytics properties offers account recovery, not nonexistent sites", () => {
  const result = journey("ga4", { ...item("no_properties"), status: "select_property", connected: false, external_id: "", properties: [] }, true);
  assert.deepEqual(result.steps, ["done", "current", "waiting"]);
  assert.equal(result.action, "לבחור חשבון גוגל אחר");
  assert.equal(result.usable, false);
});
test("an empty successful read completes setup without claiming useful activity", () => {
  const result = journey("ga4", item("empty"), true);
  assert.deepEqual(result.steps, ["done", "done", "done"]);
  assert.equal(result.usable, false);
  assert.equal(result.streams[0].usable, false);
});
test("a working Instagram read never marks Facebook, ads or website tracking ready", () => {
  const result = journey("meta", { ...item("partial"), provider: "meta", source_readiness: { status: "partial", selection: { page_id: "page", instagram_id: "ig" }, sections: { social: { status: "ready" }, facebook: { status: "permission" } } } }, true);
  assert.deepEqual(result.streams.map(s => s.usable), [false, true, false, false]);
  assert.deepEqual(result.steps, ["done", "done", "current"]);
});
test("confirmed Pixel event receipt is not labelled verified sales", () => {
  const result = journey("meta", { ...item(), pixel_id: "pixel", pixel_verification: { status: "receiving" } }, true);
  assert.equal(result.streams[3].status, "מתקבלים אירועים");
  assert.doesNotMatch(result.streams[3].label, /רכישות|מכירות|הזמנות/);
});
test("Stories and retained reads keep their own state beside a working Instagram feed", () => {
  const result = journey("meta", { ...item("partial"), provider: "meta", source_readiness: { status: "partial", selection: { instagram_id: "ig", page_id: "page" }, sections: { social: { status: "ready" }, stories: { status: "permission", retained_at: "2026-10-10T00:00:00" } } } }, true);
  assert.equal(result.streams.find(s => s.label === "פוסטים באינסטגרם").usable, true);
  assert.deepEqual(result.streams.find(s => s.label === "סטורי באינסטגרם"), { label: "סטורי באינסטגרם", status: "נתונים שמורים", usable: false });
});
test("revoked or disabled access cannot retain a ready progress indicator", () => {
  assert.deepEqual(journey("ga4", item("reconnect"), true).steps, ["current", "waiting", "waiting"]);
  const disabled = journey("ga4", item(), false);
  assert.equal(disabled.usable, false);
  assert.equal(disabled.streams[0].usable, false);
  assert.deepEqual(disabled.steps, ["waiting", "waiting", "waiting"]);
});
test("TikTok uses its own snapshot and never promises advertising or website measurements", () => {
  const result = journey("tiktok", { ...item(), provider: "tiktok", source_readiness: null, tiktok_data: { source_readiness: { status: "ready", last_success_at: "2026-10-17T08:32:22" } } }, true);
  assert.equal(result.usable, true);
  assert.equal(result.checkedAt, "2026-10-17T08:32:22");
  assert.equal(result.streams.length, 1);
});
