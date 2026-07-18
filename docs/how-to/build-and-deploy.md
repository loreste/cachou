# Build and Deploy

Short recipe for apps and this monorepo. Full guide: [Deploy](../DEPLOY.md). SSR details: [SSR and hydration](./ssr-and-hydration.md).

## App built with Vite (typical)

```bash
npm run build
npm run preview   # local check
```

Upload `dist/` to any static host. Call `applyProductionSecurityDefaults()` before `mount` / `hydrate`.

## Monorepo demo build

```bash
npm run build
```

Optimized assets go to `dist/` (demo, examples, tests, benchmarks entries from this repo’s Vite config).

## Run the included Node server

```bash
NODE_ENV=production CACHOU_DEMO=0 npm start
```

Serves built assets and SSR HTML. Demo APIs are **off** unless you set `CACHOU_DEMO=1` (not recommended publicly).

## SSR (0.4+)

Prefer `renderToStringAsync` or `renderToStream` with per-request isolation. For concurrent servers, pass an explicit `createSSRContext()` to render + `dehydrate` / `getSSRHead`. Use `Island` + `hydrateIslands` when only part of the page needs client JS. Client builds should use the browser-safe entry (`cachoujs/browser` or the Vite plugin default alias).

See [SSR how-to](./ssr-and-hydration.md) and [Framework APIs](./use-framework-apis.md).

## Serve static assets without Node

If you only need the client runtime, upload `dist/` (or your app build) to any static host/CDN. Implement your own APIs separately. For SPAs without server rewrites, consider `configureRouter({ history: "hash" })`.

## External backend during development

```bash
CACHOU_BACKEND_URL=http://localhost:8080 npm run dev
```

Proxies `/api` and `/ws-api` (monorepo demo server).

## Production checklist (summary)

- [ ] `CACHOU_DEMO=0` (never enable demo APIs in public deploys)
- [ ] CSP and secure cookies
- [ ] Real auth on APIs
- [ ] `applyProductionSecurityDefaults()` on the client
- [ ] Pin `cachoujs@0.4.x` if you need stable deploys

See [Deploy](../DEPLOY.md), [Security](../SECURITY.md), [Environment](../ENVIRONMENT.md), [Get Started](../GETTING_STARTED.md).
