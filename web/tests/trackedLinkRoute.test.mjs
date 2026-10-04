import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { runInNewContext } from "node:vm";
import nextServer from "next/server.js";
import ts from "typescript";

const { NextRequest } = nextServer;
const source = readFileSync(new URL("../app/r/[code]/route.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});
const requests = [];
const upstream = createServer((request, response) => {
  requests.push({ method: request.method, path: request.url, headers: request.headers });
  response.writeHead(302, { location: "https://wa.me/972501234567", "cache-control": "no-store" });
  response.end();
});
let route;

before(async () => {
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const exports = {};
  // Run the real Next handler against a loopback HTTP server with Node's real fetch.
  // A fetch mock would hide its automatic User-Agent, which caused the false tap.
  runInNewContext(outputText, {
    exports,
    require: createRequire(import.meta.url),
    process: { env: { API_ORIGIN: `http://127.0.0.1:${upstream.address().port}` } },
    Headers,
    fetch,
  });
  route = exports;
});
after(async () => {
  await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
});

async function call(method, headers = {}) {
  const request = new NextRequest("https://example.com/r/Ab123cd", { method, headers });
  const response = await route[method](request, { params: Promise.resolve({ code: "Ab123cd" }) });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://wa.me/972501234567");
  assert.equal(response.headers.get("cache-control"), "no-store");
  return requests.at(-1);
}

test("a request without a User-Agent reaches the API as empty, never Node's invented agent", async () => {
  const forwarded = await call("GET");
  assert.equal(forwarded.headers["user-agent"], "");
  assert.equal(forwarded.path, "/r/Ab123cd");
});

test("a customer's agent is preserved without forwarding cookies, address, referrer or credentials", async () => {
  const agent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Instagram";
  const forwarded = await call("GET", {
    "user-agent": agent,
    cookie: "synthetic_session=never-forward",
    authorization: "Bearer synthetic-only",
    "x-forwarded-for": "203.0.113.77",
    referer: "https://example.com/private",
  });
  assert.equal(forwarded.headers["user-agent"], agent);
  for (const name of ["cookie", "authorization", "x-forwarded-for", "referer"]) {
    assert.equal(forwarded.headers[name], undefined);
  }
});

test("all preview hints reach the API so previews can be excluded from tap counts", async () => {
  for (const name of ["purpose", "sec-purpose", "x-purpose", "x-moz"]) {
    const forwarded = await call("GET", { "user-agent": "Mozilla/5.0", [name]: "prefetch" });
    assert.equal(forwarded.headers[name], "prefetch");
  }
});

test("HEAD stays HEAD even with no agent, keeping its redirect without counting a tap", async () => {
  const forwarded = await call("HEAD");
  assert.equal(forwarded.method, "HEAD");
  assert.equal(forwarded.headers["user-agent"], "");
});
