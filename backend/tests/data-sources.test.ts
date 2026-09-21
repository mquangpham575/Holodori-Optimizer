import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  parseDataSource,
  parseHttpsBase,
  DEFAULT_MASTER_BASE_URL,
} from "../src/config.ts";
import { fetchPacked } from "../src/etl/holodori-sync.ts";

test("HOLODORI_DATA_SOURCE: known values pass through, anything else is auto", () => {
  assert.equal(parseDataSource(undefined), "auto");
  assert.equal(parseDataSource(""), "auto");
  assert.equal(parseDataSource("bogus"), "auto");
  assert.equal(parseDataSource("  MASTER "), "master");
  assert.equal(parseDataSource("optimizer"), "optimizer");
  assert.equal(parseDataSource("none"), "none");
});

test("base URLs must be plain https; anything else falls back", () => {
  const fb = DEFAULT_MASTER_BASE_URL;
  assert.equal(parseHttpsBase(undefined, fb), fb);
  assert.equal(parseHttpsBase("", fb), fb);
  assert.equal(parseHttpsBase("http://example.test/x", fb), fb);
  assert.equal(parseHttpsBase("javascript:alert(1)", fb), fb);
  assert.equal(parseHttpsBase("https://example.test/a?b=c", fb), fb);
  assert.equal(parseHttpsBase("https://user@example.test/a", fb), fb);
  assert.equal(parseHttpsBase("https://example.test/data/", fb), "https://example.test/data");
  assert.equal(parseHttpsBase("https://mirror.test:8443", fb), "https://mirror.test:8443");
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Every request fails with HTTP 500; returns the list of URLs that were requested. */
const failingFetch = (): string[] => {
  const urls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    urls.push(String(input?.url ?? input));
    return new Response("nope", { status: 500 });
  }) as typeof fetch;
  return urls;
};

const isOptimizer = (u: string) => u.includes("holodori-optimizer");

test("fetchPacked(none) refuses without touching the network", async () => {
  const urls = failingFetch();
  await assert.rejects(() => fetchPacked("none"), /disabled/);
  assert.equal(urls.length, 0);
});

test("fetchPacked(master) does not fall back to the optimizer", async () => {
  const urls = failingFetch();
  await assert.rejects(() => fetchPacked("master"));
  assert.ok(urls.length > 0);
  assert.ok(!urls.some(isOptimizer));
});

test("fetchPacked(optimizer) never asks the master tables", async () => {
  const urls = failingFetch();
  await assert.rejects(() => fetchPacked("optimizer"), /optimizer/);
  assert.ok(urls.length > 0);
  assert.ok(urls.every(isOptimizer));
});

test("fetchPacked(auto) falls back to the optimizer when master fails", async () => {
  const urls = failingFetch();
  await assert.rejects(() => fetchPacked("auto"), /optimizer/);
  assert.ok(urls.some((u) => !isOptimizer(u)));
  assert.ok(urls.some(isOptimizer));
});
