# Build and Deploy

Short recipe. Full guide: [Deploy](../DEPLOY.md).

## Build static assets

```bash
npm run build
```

Optimized assets go to `dist/` (demo, examples, tests, benchmarks entries from this repo’s Vite config).

## Run the included Node server

```bash
NODE_ENV=production CACHOU_DEMO=0 npm start
```

Serves built assets and SSR HTML. Demo APIs are **off** unless you set `CACHOU_DEMO=1` (not recommended publicly).

## Serve static assets without Node

If you only need the client runtime, upload `dist/` (or your app build) to any static host/CDN. Implement your own APIs separately.

## External backend during development

```bash
CACHOU_BACKEND_URL=http://localhost:8080 npm run dev
```

Proxies `/api` and `/ws-api`.

## Production checklist (summary)

- [ ] `CACHOU_DEMO=0`
- [ ] CSP and secure cookies
- [ ] Real auth on APIs
- [ ] `applyProductionSecurityDefaults()` on the client

See [Deploy](../DEPLOY.md), [Security](../SECURITY.md), [Environment](../ENVIRONMENT.md).
