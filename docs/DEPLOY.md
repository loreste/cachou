# Deploy

CachouJS is a **browser runtime first**. Deploy only the pieces you need.

Full checklist companion: [Security](./SECURITY.md), [Environment](./ENVIRONMENT.md).

---

## Option 1 — Static SPA (recommended for most apps)

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
import { applyProductionSecurityDefaults, mount } from "cachoujs";
import App from "./app.js";

applyProductionSecurityDefaults();
mount(App, document.getElementById("app"));
```

Configure a strict **Content-Security-Policy** at the edge.

---

## SSR notes (0.4+)

- Prefer **`renderToStringAsync`** or **`renderToStream`** with per-request isolation.
- Use **`Island` + `hydrateIslands`** when only part of the page needs client JS.
- For sequential handlers, call **`dehydrate()`** / **`getSSRHead()`** immediately after each render.
- For concurrent handlers, create **`createSSRContext()`** per request and pass it to render + serialize calls (implicit serialize fails closed under ambiguity).
- Pass **`request`**, **`signal`**, and optional **`traceparent`** / **`preload`** for abort, tracing, and one-pass data.
- Client bundles should resolve **`cachoujs/browser`** (Vite plugin default) so server-only modules stay out of the browser graph.
- See [SSR & hydration](./how-to/ssr-and-hydration.md) and [0.4 APIs](./how-to/use-0.4-framework-apis.md).

---

## Option 2 — Node SSR + static assets (this repo’s `server.js`)

Use only after you understand the demo surface area.

```bash
npm run build
NODE_ENV=production CACHOU_DEMO=0 npm start
```

| Variable | Production value |
|----------|------------------|
| `NODE_ENV` | `production` |
| `CACHOU_DEMO` | unset or `0` |
| `PORT` / `CACHOU_PORT` | your listen port |
| `CACHOU_DB_TYPE` | `sqlite` or `memory` if you still use demo DB code paths |
| `CACHOU_FILES_ROOT` | only if you intentionally enable files in a locked-down demo |

### Concurrent SSR

`renderToStringAsync` creates a per-request context. Production Node installs AsyncLocalStorage so concurrent renders do not share resource/head state.

```javascript
import { createSSRContext, renderToStringAsync, dehydrate, getSSRHead } from "cachoujs";

export async function handle(req, res) {
  const context = createSSRContext();
  const appHtml = await renderToStringAsync(App, {
    path: req.url,
    request: req,
    signal: req.signal,
    context,
    traceparent: req.headers["traceparent"]
  });
  res.end(htmlShell(appHtml, dehydrate(context), getSSRHead(context)));
}
```

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
- [ ] Dependency pins and changelog review (0.x)

---

## What gets published on npm

`cachoujs` publishes the **runtime**, **compiler source**, **Vite plugin**, and **docs** — not the CRM, not demo databases, not benchmark competitor frameworks. Preview with:

```bash
npm run pack:dry
```
