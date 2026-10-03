import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./connectionRecommendation.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { connectionRecommendation: recommend } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const business = { website_url: "", quarter_plan: { integrations: [{ key: "instagram_insights", why_he: "הסגנון שלכם, לקהל שלכם" }] } };
const setup = { groups: [{ items: [{ key: "google", title: "אתר" }, { key: "instagram", title: "אינסטגרם" }] }] };
const sources = { ga4_ready: true, meta_ready: true, integrations: [] };

test("a service provider without a site gets the plan's social connection, never a required website", () => {
  assert.deepEqual(recommend(business, setup, sources, true), { key: "meta", title: "פייסבוק ואינסטגרם", why: "הסגנון שלכם, לקהל שלכם" });
});
test("a plan without measurement requirements does not prescribe a new Google or Meta grant", () => {
  assert.equal(recommend(business, { groups: [{ items: [] }] }, sources, true), null);
});
test("an existing permission return is resumed even if the new plan no longer requires that source", () => {
  assert.equal(recommend(business, { groups: [] }, { ...sources, integrations: [{ provider: "ga4", status: "select_property", properties: [{ property_id: "example" }] }] }, true).key, "ga4");
});
test("selected data with a failed first read needs recovery, not a false complete state", () => {
  assert.equal(recommend(business, { groups: [] }, { ...sources, integrations: [{ provider: "ga4", external_id: "example", source_readiness: { status: "unavailable" } }] }, true).key, "ga4");
});
test("an unavailable provider is not prescribed as a working one-click connection", () => {
  assert.equal(recommend(business, setup, { ...sources, meta_ready: false }, true), null);
});
test("a WhatsApp link is recommended only when present in the saved plan; it is not an enquiry count", () => {
  const result = recommend({ ...business, quarter_plan: { integrations: [{ key: "whatsapp_link" }] } }, setup, sources, false);
  assert.equal(result.key, "whatsapp");
  assert.match(result.why, /לחיצה אינה הודעה או לקוח/);
});
test("permission requirements do not override existing confirmed usable source data", () => {
  const connected = { ...sources, integrations: [{ provider: "ga4", connected: true, external_id: "example", source_readiness: { status: "ready" } }, { provider: "meta", connected: true }] };
  assert.equal(recommend({ ...business, website_url: "https://example.com" }, setup, connected, true), null);
});
test("a failed setup read does not invent a recommendation", () => {
  assert.equal(recommend(business, null, sources, true), null);
});
