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

  it("strips data:text/html and vbscript URLs", () => {
    const out = sanitizeHTML(
      `<a href="data:text/html,<script>1</script>">x</a><a href="vbscript:msgbox(1)">y</a>`
    );
    assert.doesNotMatch(out, /data:\s*text\/html/i);
    assert.doesNotMatch(out, /vbscript:/i);
  });

  it("strips form and base tags", () => {
    const out = sanitizeHTML(`<base href="https://evil"><form action="/x"><input></form>ok`);
    assert.doesNotMatch(out, /<form/i);
    assert.doesNotMatch(out, /<base/i);
    assert.match(out, /ok/);
  });

  it("strips nested script tag smuggling", () => {
    // <scr<script>ipt>… must not leave an executable <script> element
    const out = sanitizeHTML(`<scr<script>ipt>alert(1)</script>`);
    assert.doesNotMatch(out, /<script/i);
    assert.doesNotMatch(out, /<\/script/i);
  });

  it("strips slash-delimited dangerous tags and event attributes", () => {
    const out = sanitizeHTML(
      `<script/onload=alert(1)>bad</script><img/onerror=alert(2)>x<div/onmouseover=alert(3)>y`
    );
    assert.doesNotMatch(out, /<\/?script/i);
    assert.doesNotMatch(out, /on(?:load|error|mouseover)/i);
    assert.match(out, /x/);
    assert.match(out, /y/);
  });

  it("neutralizes HTML-entity encoded javascript URLs", () => {
    const out = sanitizeHTML(`<a href="&#106;avascript:alert(1)">x</a>`);
    assert.doesNotMatch(out, /javascript:/i);
    assert.doesNotMatch(out, /alert/);
  });

  it("neutralizes entity-encoded event handlers", () => {
    const out = sanitizeHTML(`<img src=x onerror&#61;alert(1)>`);
    assert.doesNotMatch(out, /onerror/i);
    assert.doesNotMatch(out, /alert/);
  });

  it("strips inline style attributes on the string path", () => {
    const out = sanitizeHTML(`<div style="background:url(javascript:alert(1))">ok</div>`);
    assert.doesNotMatch(out, /style=/i);
    assert.doesNotMatch(out, /javascript/i);
    assert.match(out, /ok/);
  });

  it("blocks whitespace-split javascript schemes (tab/LF/CR/entity)", () => {
    // Chromium treats java\tscript: as javascript: — sanitizeHTML must not leave these.
    const payloads = [
      `<a href="java\tscript:alert(1)">x</a>`,
      `<a href="java\nscript:alert(1)">x</a>`,
      `<a href="java\rscript:alert(1)">x</a>`,
      `<a href="java&#9;script:alert(1)">x</a>`,
      `<a href="java&Tab;script:alert(1)">x</a>`,
      `<a href='java\tscript:alert(1)'>x</a>`
    ];
    for (const input of payloads) {
      const out = sanitizeHTML(input);
      const compact = out.replace(/[\u0000-\u001F\u007F\s]+/g, "").toLowerCase();
      assert.equal(
        compact.includes("javascript:"),
        false,
        `payload survived: ${JSON.stringify(input)} => ${JSON.stringify(out)}`
      );
    }
  });

  it("removes unsafe srcset candidates", () => {
    const out = sanitizeHTML(
      `<img srcset="https://safe.example/a.png 1x, javascript:alert(1) 2x"><img srcset="data:image/svg+xml,<svg onload=alert(2)> 1x">`
    );
    assert.doesNotMatch(out, /srcset/i);
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

  it("does not fall back to predictable randomness for CSP nonces", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    if (!descriptor?.configurable) return;
    try {
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
      assert.throws(() => createCSPNonce(), /Secure randomness is required/);
    } finally {
      Object.defineProperty(globalThis, "crypto", descriptor);
    }
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

describe("SSR dehydrate nonce + security headers", () => {
  it("renderApplication state script carries nonce when provided", async () => {
    const {
      html,
      signal,
      renderApplication
    } = await import("../../src/index.js");
    function App() {
      const [n] = signal(1);
      return () => html`<p>${() => n()}</p>`;
    }
    const { state } = await renderApplication(App, { path: "/", nonce: "testnonce99" });
    assert.match(state, /nonce="testnonce99"/);
    assert.match(state, /__CACHOU_STATE__/);
  });

  it("buildSecurityHeaders omits unsafe-inline scripts by default", () => {
    const h = buildSecurityHeaders({ nonce: "n2" });
    const csp = h["Content-Security-Policy"] || "";
    assert.match(csp, /nonce-n2/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  });
});
