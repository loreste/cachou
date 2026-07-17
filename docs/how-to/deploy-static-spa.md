# Deploy a static SPA (hash or browser history)

**Status:** stable core (`mount`, router) · **Recipe:** static hosting without Node SSR

Related: [Deploy](../DEPLOY.md) · [Routing](./routing-and-lazy-pages.md) · [Browser entry](./use-browser-entry.md)

---

## When to use

- Marketing/SPA apps with a separate API backend  
- Static hosts: Nginx, S3+CDN, Cloudflare Pages, Netlify, GitHub Pages  
- You do **not** need first paint from `renderToStringAsync`

---

## Build

```bash
# Vite example
npm run build
# upload dist/
```

Entry:

```js
import { applyProductionSecurityDefaults, mount, configureRouter } from "cachoujs/browser";
import App from "./App.js";

applyProductionSecurityDefaults();

// Browser history (needs host rewrite rules — see below)
configureRouter({ mode: "browser" });

// Or hash history (works on any static host with zero rewrites)
// configureRouter({ mode: "hash" });

mount(App, document.getElementById("app"));
```

Use **`cachoujs/browser`** (or the Vite plugin default alias) so Node-only modules stay out of the client bundle.

---

## History modes

| Mode | URL shape | Host requirements |
|------|-----------|-------------------|
| **`browser`** (default) | `/users/42` | Rewrite all routes to `index.html` |
| **`hash`** | `/#/users/42` | None — works on pure static file hosts |

```js
import { configureRouter, Router, Route, Link } from "cachoujs";

configureRouter({ mode: "hash" });
```

`Link` and `navigate` respect the configured mode.

---

## Host rewrites (browser mode)

**Nginx**

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

**Cloudflare Pages / Netlify** — `_redirects` / `public/_redirects`:

```text
/*    /index.html   200
```

**S3 + CloudFront** — custom error response 403/404 → `/index.html` 200.

**GitHub Pages** — prefer **hash** mode, or a `404.html` copy of `index.html`.

---

## Security checklist

- [ ] `applyProductionSecurityDefaults()`
- [ ] CSP at the edge (`default-src 'self'`, no demo APIs)
- [ ] Never set `CACHOU_DEMO=1`
- [ ] Auth on **your** API only

---

## Hydration later

If you add SSR later, keep the same `App` tree and switch the server to
[Deploy Node SSR](./deploy-node-ssr.md) while the client continues to import
`cachoujs/browser`.
