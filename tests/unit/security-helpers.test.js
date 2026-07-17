import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeHTML,
  sanitizeAuthToken,
  createCSPNonce,
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  applySecurityHeaders,
  createAuth
} from "../../src/index.js";

describe("sanitizeHTML", () => {
  it("strips script tags", () => {
    const out = sanitizeHTML(`Hello <script>alert(1)</script> world`);
    assert.equal(out.includes("script"), false);
    assert.match(out, /Hello/);
    assert.match(out, /world/);
  });

  it("strips event handler attributes", () => {
    const out = sanitizeHTML(`<img src="x" onerror="alert(1)">`);
    assert.doesNotMatch(out, /onerror/i);
  });

  it("neutralizes javascript: URLs", () => {
    const out = sanitizeHTML(`<a href="javascript:alert(1)">x</a>`);
    assert.doesNotMatch(out, /javascript:/i);
  });

  it("strips iframe and svg", () => {
    const out = sanitizeHTML(`<div><iframe src="https://evil"></iframe><svg onload="x"></svg>ok</div>`);
    assert.doesNotMatch(out, /iframe/i);
    assert.doesNotMatch(out, /svg/i);
    assert.match(out, /ok/);
  });

  it("handles null/undefined", () => {
    assert.equal(sanitizeHTML(null), "");
    assert.equal(sanitizeHTML(undefined), "");
  });
});

describe("sanitizeAuthToken", () => {
  it("accepts normal tokens", () => {
    assert.equal(sanitizeAuthToken("abc.def-ghi_123"), "abc.def-ghi_123");
  });

  it("rejects control characters and newlines", () => {
    assert.equal(sanitizeAuthToken("a\r\nb"), null);
    assert.equal(sanitizeAuthToken("a\0b"), null);
  });

  it("rejects HTML-looking tokens", () => {
    assert.equal(sanitizeAuthToken("<script>x</script>"), null);
  });

  it("rejects oversized tokens", () => {
    assert.equal(sanitizeAuthToken("x".repeat(9000)), null);
  });
});

describe("CSP helpers", () => {
  it("createCSPNonce returns a safe charset string", () => {
    const n = createCSPNonce();
    assert.equal(typeof n, "string");
    assert.ok(n.length >= 16);
    assert.match(n, /^[A-Za-z0-9_-]+$/);
  });

  it("buildContentSecurityPolicy includes nonce and forbids object", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc123", allowInlineStyles: false });
    assert.match(csp, /script-src 'self' 'nonce-abc123'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  });

  it("buildSecurityHeaders returns expected keys", () => {
    const h = buildSecurityHeaders({ nonce: "n1", allowInlineStyles: true });
    assert.ok(h["Content-Security-Policy"]);
    assert.equal(h["X-Content-Type-Options"], "nosniff");
    assert.equal(h["X-Frame-Options"], "DENY");
  });

  it("applySecurityHeaders sets headers on a mock response", () => {
    const set = {};
    applySecurityHeaders(
      { setHeader(k, v) { set[k] = v; } },
      { "X-Test": "1" }
    );
    assert.equal(set["X-Test"], "1");
  });
});

describe("createAuth token hardening", () => {
  it("rejects poisoned tokens on setToken", () => {
    const store = new Map();
    const storage = {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: k => store.delete(k)
    };
    const auth = createAuth({ storage, persist: "none" });
    // override storage path
    const auth2 = createAuth({ storage });
    auth2.setToken("good-token-value");
    assert.equal(auth2.token(), "good-token-value");
    auth2.setToken("bad\r\ntoken");
    assert.equal(auth2.token(), null);
    void auth;
  });

  it("supports session persist preference without throwing on SSR", () => {
    const auth = createAuth({ persist: "session" });
    assert.equal(typeof auth.token, "function");
    assert.equal(auth.token(), null);
  });
});
