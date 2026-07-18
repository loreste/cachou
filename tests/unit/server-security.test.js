import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveSafeAssetPath } from "../../server/static-assets.js";
import { isAllowedWebSocketOrigin } from "../../server/ws.js";
import { isDemoMode } from "../../server/demo-guard.js";
import { dehydrate, createSSRContext } from "../../src/index.js";

const distRoot = path.resolve("/app/project/dist");

describe("resolveSafeAssetPath", () => {
  it("resolves files under dist", () => {
    const p = resolveSafeAssetPath(distRoot, "/assets/app.js");
    assert.equal(p, path.join(distRoot, "assets/app.js"));
  });

  it("maps /demo prefix onto dist", () => {
    const p = resolveSafeAssetPath(distRoot, "/demo/index.html");
    assert.equal(p, path.join(distRoot, "index.html"));
  });

  it("blocks ../ traversal", () => {
    assert.equal(resolveSafeAssetPath(distRoot, "/../../../etc/passwd"), null);
    assert.equal(resolveSafeAssetPath(distRoot, "/assets/../../etc/passwd"), null);
  });

  it("blocks absolute path injection", () => {
    assert.equal(resolveSafeAssetPath(distRoot, "/etc/passwd"), path.join(distRoot, "etc/passwd"));
    // Absolute after join is still under dist when path is relative segment-only.
    // Explicit absolute Windows / UNC-style is rejected:
    assert.equal(resolveSafeAssetPath(distRoot, "C:\\\\Windows\\\\system.ini"), null);
  });

  it("blocks null bytes", () => {
    assert.equal(resolveSafeAssetPath(distRoot, "/assets/x.js%00.txt"), null);
  });

  it("blocks encoded traversal", () => {
    assert.equal(resolveSafeAssetPath(distRoot, "/assets/%2e%2e/%2e%2e/etc/passwd"), null);
  });
});

describe("WebSocket origin check", () => {
  it("allows missing Origin", () => {
    assert.equal(isAllowedWebSocketOrigin({ headers: { host: "localhost:5173" } }), true);
  });

  it("allows matching Origin host", () => {
    assert.equal(
      isAllowedWebSocketOrigin({
        headers: { host: "localhost:5173", origin: "http://localhost:5173" }
      }),
      true
    );
  });

  it("rejects cross-site Origin", () => {
    assert.equal(
      isAllowedWebSocketOrigin({
        headers: { host: "localhost:5173", origin: "https://evil.example" }
      }),
      false
    );
  });
});

describe("demo mode default", () => {
  it("is off when NODE_ENV=production and CACHOU_DEMO unset", () => {
    const prevNode = process.env.NODE_ENV;
    const prevDemo = process.env.CACHOU_DEMO;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.CACHOU_DEMO;
      assert.equal(isDemoMode(), false);
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevDemo === undefined) delete process.env.CACHOU_DEMO;
      else process.env.CACHOU_DEMO = prevDemo;
    }
  });
});

describe("dehydrate nonce", () => {
  it("emits a CSP nonce attribute when provided", () => {
    const ctx = createSSRContext();
    const html = dehydrate(ctx, { nonce: "abc123_safe-nonce" });
    assert.match(html, /nonce="abc123_safe-nonce"/);
    assert.match(html, /window\.__CACHOU_STATE__/);
  });

  it("rejects unsafe nonce characters", () => {
    const ctx = createSSRContext();
    const html = dehydrate(ctx, { nonce: `"><script>alert(1)</script>` });
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /nonce="/);
  });
});

describe("SSR quoted attribute security policy", () => {
  it("blocks javascript: URLs in quoted href bindings", async () => {
    const { html, renderToString, configureSecurityPolicy } = await import("../../src/html.js");
    configureSecurityPolicy({
      allowInlineStyles: true,
      allowedURLProtocols: ["http:", "https:", "mailto:", "tel:", "blob:", "data:"]
    });
    function App() {
      return () => html`<a href="${"javascript:alert(1)"}">x</a>`;
    }
    const out = renderToString(App);
    assert.doesNotMatch(out, /javascript:/i);
    assert.match(out, /<a href="">/);
  });

  it("blocks javascript: URLs in unquoted href bindings", async () => {
    const { html, renderToString, configureSecurityPolicy } = await import("../../src/html.js");
    configureSecurityPolicy({
      allowInlineStyles: true,
      allowedURLProtocols: ["http:", "https:", "mailto:", "tel:", "blob:", "data:"]
    });
    function App() {
      return () => html`<a href=${"javascript:alert(1)"}>x</a>`;
    }
    const out = renderToString(App);
    assert.doesNotMatch(out, /javascript:/i);
  });

  it("blocks unsafe inline styles when production defaults are applied", async () => {
    const {
      html,
      renderToString,
      applyProductionSecurityDefaults
    } = await import("../../src/html.js");
    applyProductionSecurityDefaults();
    function App() {
      return () => html`<div style="${"color:red"}">x</div>`;
    }
    const out = renderToString(App);
    assert.doesNotMatch(out, /color:red/);
  });

  it("still allows safe https href values", async () => {
    const { html, renderToString, configureSecurityPolicy } = await import("../../src/html.js");
    configureSecurityPolicy({
      allowedURLProtocols: ["http:", "https:", "mailto:", "tel:"]
    });
    function App() {
      return () => html`<a href="${"https://example.com/path"}">x</a>`;
    }
    const out = renderToString(App);
    assert.match(out, /href="https:\/\/example\.com\/path"/);
  });

  it("strips control characters from emitted safe URLs", async () => {
    const { html, renderToString, configureSecurityPolicy } = await import("../../src/html.js");
    configureSecurityPolicy({
      allowedURLProtocols: ["http:", "https:"]
    });
    function App() {
      return () => html`<a href="${"https://example.com/\u0000admin"}">x</a>`;
    }
    const out = renderToString(App);
    assert.equal(out.includes("\u0000"), false);
    assert.match(out, /href="https:\/\/example\.com\/admin"/);
  });
});
