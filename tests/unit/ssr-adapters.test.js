import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toReadableStream,
  buildResponseHeaders,
  requestPath,
  handleFetchRequest,
  createFetchHandler
} from "../../src/ssr-adapters.js";
import { html, signal } from "../../src/index.js";

function App() {
  const [n] = signal(42);
  return () => html`<main data-test="ssr"><h1>Hi ${() => n()}</h1></main>`;
}

describe("ssr-adapters helpers", () => {
  it("requestPath parses pathname + search", () => {
    const req = new Request("https://example.com/app?x=1");
    assert.equal(requestPath(req), "/app?x=1");
  });

  it("buildResponseHeaders sets CSP and content-type", () => {
    const headers = buildResponseHeaders(
      { "Content-Security-Policy": "default-src 'self'" },
      { "X-Test": "1" }
    );
    assert.equal(headers.get("Content-Type"), "text/html; charset=utf-8");
    assert.equal(headers.get("X-Test"), "1");
    assert.match(headers.get("Content-Security-Policy") || "", /default-src/);
  });

  it("toReadableStream wraps async generators", async () => {
    async function* gen() {
      yield "a";
      yield "b";
    }
    const stream = toReadableStream(gen());
    assert.ok(stream instanceof ReadableStream);
    const text = await new Response(stream).text();
    assert.equal(text, "ab");
  });

  it("toReadableStream passes through ReadableStream", () => {
    const original = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("x"));
        c.close();
      }
    });
    assert.equal(toReadableStream(original), original);
  });
});

describe("handleFetchRequest / createFetchHandler", () => {
  it("returns HTML Response with security headers", async () => {
    const res = await handleFetchRequest(App, new Request("https://ex.test/"), {
      title: "T",
      applySecurityDefaults: true
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("Content-Type") || "", /text\/html/);
    assert.ok(res.headers.get("Content-Security-Policy"));
    const body = await res.text();
    assert.match(body, /data-test="ssr"/);
    assert.match(body, /Hi/);
    assert.match(body, /<title>T<\/title>/);
  });

  it("createFetchHandler is a request => Response factory", async () => {
    const fetch = createFetchHandler(App, { title: "F" });
    const res = await fetch(new Request("https://ex.test/hello"));
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /Hi/);
  });

  it("onError can customize error responses", async () => {
    function Boom() {
      throw new Error("boom");
    }
    const res = await handleFetchRequest(Boom, new Request("https://ex.test/"), {
      onError: () => new Response("custom", { status: 503 })
    });
    assert.equal(res.status, 503);
    assert.equal(await res.text(), "custom");
  });

  it("stream mode returns a streaming body when available", async () => {
    const res = await handleFetchRequest(App, new Request("https://ex.test/"), {
      stream: true,
      title: "S"
    });
    assert.equal(res.status, 200);
    assert.ok(res.body);
    const body = await res.text();
    // progressive stream still includes app markup eventually
    assert.match(body, /Hi|app|html/i);
  });
});
