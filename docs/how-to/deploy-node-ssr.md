# Deploy Node SSR (supported recipe)

**Status:** stable helpers (`renderApplication`, `htmlDocument`) · **Example:** `examples/node-ssr/`

This is the supported path for concurrent Node servers. It does **not** use the monorepo demo server.

Related: [Deploy](../DEPLOY.md) · [SSR how-to](./ssr-and-hydration.md) · [Stability](../STABILITY.md) · [Security](../SECURITY.md)

---

## 1. Install

```bash
npm install cachoujs
```

Node **20+**. For Vite client hydration later, also install Vite and use `cachoujs/browser` (or the Vite plugin default alias).

---

## 2. Per-request render

```js
import {
  applyProductionSecurityDefaults,
  createCSPNonce,
  buildSecurityHeaders,
  applySecurityHeaders,
  renderApplication,
  htmlDocument,
  installSSRAsyncHooks
} from "cachoujs";
import { createRequire } from "node:module";

applyProductionSecurityDefaults();

// Once at process start (concurrent isolation)
try {
  const require = createRequire(import.meta.url);
  installSSRAsyncHooks(require("node:async_hooks"));
} catch {
  // explicit context in renderApplication is still enough for sequential handlers
}

// Inside each request:
const nonce = createCSPNonce();
const { html, head, state } = await renderApplication(App, {
  path: req.url,
  request: req,
  signal: req.signal, // if available
  nonce,
  // preload: ({ request, signal }) => loadPage(request, signal)
});

applySecurityHeaders(res, buildSecurityHeaders({ nonce, allowInlineStyles: false }));
res.setHeader("Content-Type", "text/html; charset=utf-8");
res.end(
  htmlDocument({
    html,
    head,
    state,
    title: "My App",
    styles: `<style nonce="${nonce}">/* critical CSS */</style>`,
    scripts: `<script type="module" src="/assets/client.js" nonce="${nonce}"></script>`
  })
);
```

Rules:

1. **One context per request** — `renderApplication` creates it (or pass `context`).
2. Always use the returned `state` / `head` for that request (never a previous one).
3. Prefer **nonces** for CSP scripts/styles over `unsafe-inline` for scripts.
4. Client bundles: **`cachoujs/browser`**.

---

## 3. Run the example

```bash
node examples/node-ssr/server.mjs
```

---

## 4. What not to do

- Do not enable `CACHOU_DEMO` on a public host.
- Do not use implicit `dehydrate()` under concurrent handlers without a context.
- Do not import `cachoujs/content` into the client bundle.
