# Deploy

CachouJS is a **browser runtime first**. Deploy only the pieces you need.

Full checklist companion: [Security](./SECURITY.md) · [Environment](./ENVIRONMENT.md) · [Stability](./STABILITY.md)

**Recipes (0.5+ / 0.6+):**

| Recipe | When | Status |
|--------|------|--------|
| [Static SPA](#option-1--static-spa-recommended-for-most-apps) | No server render | **Supported** |
| [Static pre-render](#option-5--static-pre-render-build-time-html) | HTML files at build time | **Candidate** (`cachoujs/static`) |
| [Node SSR](#option-2--node-ssr-supported) | Concurrent-safe HTML from Node | **Supported** |
| [Fetch SSR (Workers/Deno/Bun)](#option-4--fetch-ssr-workers--deno--bun) | Fetch `Request` → `Response` | **Candidate** (`cachoujs/ssr-adapters`) |

Repo demo `server.js` is **not** the supported product path — it is a proving ground.

---

## Option 1 — Static SPA (recommended for most apps)

Full walkthrough: [Deploy a static SPA](./how-to/deploy-static-spa.md) (browser vs **hash** history, host rewrites).

1. Build client assets with Vite (or any bundler that understands your entry).
2. Serve the `dist/` (or output) directory from any static host: Nginx, S3+CDN, Cloudflare Pages, Netlify, GitHub Pages, etc.
3. Implement **your own** authenticated backend separately.
4. Do **not** ship this repo’s demo SQLite/files/WebSocket endpoints.
5. Do **not** set `CACHOU_DEMO=1`.

```bash
npm run build
# upload dist/ (or your app’s output)
```

Client bootstrap:

```javascript
import { applyProductionSecurityDefaults, mount, configureRouter } from "cachoujs/browser";
import App from "./app.js";

applyProductionSecurityDefaults();
// configureRouter({ mode: "hash" }); // zero-rewrite static hosts
mount(App, document.getElementById("app"));
```

Configure a strict **Content-Security-Policy** at the edge.

---

## Option 2 — Node SSR (supported)

Use the high-level helpers + explicit per-request context. Full walkthrough:
[Deploy Node SSR](./how-to/deploy-node-ssr.md) · runnable example: `examples/node-ssr/`.

```bash
node examples/node-ssr/server.mjs
```

```javascript
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
try {
  installSSRAsyncHooks(createRequire(import.meta.url)("node:async_hooks"));
} catch { /* sequential still ok */ }

// per request
const nonce = createCSPNonce();
const { html, head, state } = await renderApplication(App, {
  path: req.url,
  request: req,
  nonce
});
applySecurityHeaders(res, buildSecurityHeaders({ nonce, allowInlineStyles: false }));
res.end(htmlDocument({ html, head, state, title: "App" }));
```

### SSR notes

- Prefer **`renderApplication`** (or `renderToStringAsync` + explicit context).
- Use **`Island` + `hydrateIslands`** when only part of the page needs client JS (candidate API).
- Implicit `dehydrate()` / `getSSRHead()` fail closed under concurrent ambiguity — always pass context (or use `renderApplication`).
- Client bundles: **`cachoujs/browser`**.
- See [SSR & hydration](./how-to/ssr-and-hydration.md).

---

## Option 4 — Fetch SSR (Workers / Deno / Bun)

Candidate adapter for runtimes that speak the Fetch API. Full walkthrough:
[Deploy Fetch SSR](./how-to/deploy-fetch-ssr.md) · smoke: `examples/fetch-ssr/` · `npm run ssr:fetch`.

```javascript
import { createFetchHandler } from "cachoujs/ssr-adapters";
import { html } from "cachoujs";

function App() {
  return () => html`<h1>Hello</h1>`;
}

export default {
  fetch: createFetchHandler(App, { title: "App" })
};
// Deno: Deno.serve(createFetchHandler(App, { title: "App" }));
```

Node remains the **primary** supported SSR recipe; use this when your host is Workers/Deno/Bun.

---

## Option 5 — Static pre-render (build-time HTML)

Generate `index.html` files for known routes with `prerenderToDir` / `prerenderRoutes`.
Full walkthrough: [Deploy static pre-render](./how-to/deploy-static-prerender.md) · `npm run ssr:static`.

```javascript
import { prerenderToDir } from "cachoujs/static";

await prerenderToDir(App, {
  routes: ["/", "/about"],
  outDir: "dist",
  title: ({ path }) => `App ${path}`,
  scripts: '<script type="module" src="/assets/client.js"></script>',
  nonce: false
});
```

Pair with a client bundle from `cachoujs/browser` when you need hydration.

---

## Option 3 — Monorepo demo server (not product)

The root `server.js` is a proving ground. Only use it if you understand demo gates.

```bash
npm run build
NODE_ENV=production CACHOU_DEMO=0 npm start
```

| Variable | Production value |
|----------|------------------|
| `NODE_ENV` | `production` |
| `CACHOU_DEMO` | unset or `0` |
| `PORT` / `CACHOU_PORT` | your listen port |

### Reverse proxy sketch (Nginx)

```nginx
server {
  listen 443 ssl;
  server_name app.example.com;

  # add CSP, HSTS, etc.
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---

## Option 3 — CRM proving ground

`crm/` is a separate application for showcasing Cachou at scale (PostgreSQL or in-memory). Deploy it with its own `server.mjs`, auth model, and database — not as “the Cachou framework server.”

```bash
npm run crm:demo
# Postgres: npm run crm:db:postgres:up && npm run crm:api:postgres && npm run crm:dev
npm run crm:build
```

---

## Production checklist

- [ ] `CACHOU_DEMO` is not enabled
- [ ] CSP (and related) headers set by reverse proxy / host
- [ ] Cookies: `Secure`, `HttpOnly`, `SameSite` as appropriate
- [ ] Authentication and authorization on all mutating APIs
- [ ] Server-side input validation
- [ ] No raw SQL endpoints exposed to browsers
- [ ] Secrets only in environment / secret manager
- [ ] `applyProductionSecurityDefaults()` (or equivalent policy) at client bootstrap
- [ ] Dependency pins and changelog review (1.0.x)

---

## What gets published on npm

`cachoujs` publishes the **runtime**, **compiler source**, **Vite plugin**, and **docs** — not the CRM, not demo databases, not benchmark competitor frameworks. Preview with:

```bash
npm run pack:dry
```
