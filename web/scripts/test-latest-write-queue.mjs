import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/latestWriteQueue.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, Promise });
const { createLatestWriteQueue } = exports;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const turn = () => new Promise(resolve => setImmediate(resolve));

const first = deferred();
const third = deferred();
const writes = [];
let startThird;
const thirdStarted = new Promise(resolve => { startThird = resolve; });
const queue = createLatestWriteQueue(async value => {
  writes.push(value);
  if (value === "first") return first.promise;
  startThird();
  return third.promise;
}, () => {});
queue.enqueue("first");
const firstFlush = queue.flush();
await turn();
assert.equal(queue.discard(), false, "an in-flight write cannot be discarded as if it had not reached the server");
queue.enqueue("second");
queue.enqueue("third");
first.resolve();
await firstFlush;
await thirdStarted;
assert.deepEqual(writes, ["first", "third"], "writes are serialized and in-flight typing coalesces to the newest snapshot");
third.resolve();
assert.equal(await queue.flushAll(), true);
assert.equal(queue.hasPending(), false);

const failedRequest = deferred();
const retryWrites = [];
let startFailed;
const failedStarted = new Promise(resolve => { startFailed = resolve; });
const retryQueue = createLatestWriteQueue(async value => {
  retryWrites.push(value);
  if (value === "old intent") { startFailed(); return failedRequest.promise; }
}, () => {});
retryQueue.enqueue("old intent");
const failedFlush = retryQueue.flush();
await failedStarted;
retryQueue.enqueue("latest intent");
failedRequest.reject(new Error("offline"));
await failedFlush;
assert.equal(await retryQueue.flushAll(), false, "failed design save remains pending and blocks leave");
assert.equal(retryQueue.hasPending(), true);
assert.equal(await retryQueue.retry(), true, "explicit retry saves the latest retained intent");
assert.deepEqual(retryWrites, ["old intent", "latest intent"]);
assert.equal(retryQueue.hasPending(), false);

let attempts = 0;
const discardQueue = createLatestWriteQueue(async () => { attempts += 1; throw new Error("offline"); }, () => {});
discardQueue.enqueue("unsaved design");
assert.equal(await discardQueue.flushAll(), false);
assert.equal(discardQueue.discard(), true, "a settled failed intent can be explicitly discarded");
assert.equal(discardQueue.hasPending(), false);
assert.equal(await discardQueue.retry(), true);
assert.equal(attempts, 1, "discard does not retry a failed write");
console.log("Latest design writes: serialized typing, coalescing, retained failures and explicit retry passed");
