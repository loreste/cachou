# CachouJS 1.0 — API freeze

**1.0 means API commitment for the stable core**, not “feature complete forever”.

## Commitment

| Surface | Promise |
|---------|---------|
| **Stable** exports (`getExportStability(name) === "stable"`) | No breaking changes without a **major** version (2.0+) |
| **Candidate** | May refine in **minor** releases with changelog |
| **Experimental** | May change in **patch** releases — pin tightly |
| Deprecated aliases | Still work in **1.x** with console warnings; removal reserved for a future major |

Source of labels: `src/stability.js` · policy: [STABILITY.md](./STABILITY.md) · removals list: [DEPRECATIONS.md](./DEPRECATIONS.md)

## Stable core (summary)

- Reactivity: `signal`, `effect`, `createRoot`, `memo`, `store`, `batch`, ownership, `mapArray`
- Templates / DOM: `html`, `mount` / `unmount` / `render` / `hydrate`
- Control flow: `Show`, `Switch`, `Match`, `For`, `Index`
- Resources + mutations + forms
- Router core (routes, layouts, loaders, guards, file routes)
- SSR: `renderToString` / `Async`, `createSSRContext`, `renderApplication`, `dehydrate`
- Security helpers (policy, CSP headers, sanitizers)

## Not frozen at 1.0

- Experimental subpaths (`cachoujs/ui`, `auth`, `i18n`, …)
- Candidate deploy helpers (`ssr-adapters`, `static`, streaming/islands refinements)
- Demo server, CRM, DB adapters in this monorepo
- VS Code / browser extension store listings

## Upgrade from 0.6.x

```bash
npm install cachoujs@^1.0.0
# scaffold pins update automatically on new projects:
npx @cachoujs/create@latest my-app
```

Most 0.6 apps need **no code changes**. Prefer:

- `guard()` over `addMiddleware()`
- `getApp()` / `launch()` over `useApp()` / `createApp()`
- `cachoujs/browser` for client bundles

## Verify freeze criteria (maintainers)

```bash
npm run freeze:check   # docs + stability + exports (fast)
npm run check          # full unit + browser + benches
npm run publish:prep   # before npm publish
```

## Versioning after 1.0

| Change | Version |
|--------|---------|
| Bugfix, docs, CI | **patch** `1.0.x` |
| Backward-compatible features | **minor** `1.x.0` |
| Break stable APIs | **major** `2.0.0` |

Same version on `cachoujs`, `@cachoujs/compiler`, `@cachoujs/create`.
