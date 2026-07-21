import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveSafeAssetPath, resolveSafeExistingAssetPath } from "../../server/static-assets.js";
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

  it("blocks existing symlinks that escape dist", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-dist-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "cachou-dist-outside-"));
    await fs.writeFile(path.join(outside, "secret.js"), "secret", "utf8");
    await fs.symlink(path.join(outside, "secret.js"), path.join(root, "escape.js"));
    assert.equal(resolveSafeAssetPath(root, "/escape.js"), null);
    assert.equal(resolveSafeExistingAssetPath(root, path.join(root, "escape.js")), null);
  });
});

describe("WebSocket origin check", () => {
  it("rejects missing Origin by default", () => {
    assert.equal(isAllowedWebSocketOrigin({ headers: { host: "localhost:5173" } }), false);
  });

  it("allows missing Origin only when explicitly requested", () => {
    assert.equal(
      isAllowedWebSocketOrigin({ headers: { host: "localhost:5173" } }, { allowMissingOrigin: true }),
      true
    );
  });

  it("allows matching Origin host", () => {
    assert.equal(
      isAllowedWebSocketOrigin({
        headers: { host: "localhost:5173", origin: "http://localhost:5173" }
      }),
      true
    );
  });

  it("rejects a same-host Origin with the wrong scheme", () => {
    assert.equal(
      isAllowedWebSocketOrigin({
        headers: { host: "localhost:5173", origin: "https://localhost:5173" }
      }),
      false
    );
  });

  it("does not trust a client-supplied forwarded scheme by default", () => {
    assert.equal(
      isAllowedWebSocketOrigin({
        headers: {
          host: "example.test",
          origin: "https://example.test",
          "x-forwarded-proto": "https"
        }
      }),
      false
    );
  });

  it("uses the forwarded scheme only behind an explicitly trusted proxy", () => {
    assert.equal(
      isAllowedWebSocketOrigin({
        headers: {
          host: "example.test",
          origin: "https://example.test",
          "x-forwarded-proto": "https"
        }
      }, { trustProxy: true }),
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
    // Sanitized-null URL attributes are omitted (not emitted as href="").
    assert.doesNotMatch(out, /href=/);
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
