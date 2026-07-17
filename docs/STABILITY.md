# API Stability (0.5+)

CachouJS labels public exports so apps know what to pin against.

| Label | Meaning |
|-------|---------|
| **stable** | Core production contract. Breaking changes require a major version after 1.0; until then, avoid silent breaks and document any exception in the changelog. |
| **candidate** | Shipped and documented. May refine in **minor** releases with a clear changelog. |
| **experimental** | Usable primitives (UI kit, auth, i18n, content, …). May change in **patch** releases — pin versions tightly. |
| **unlisted** | Not classified (internal, accidental, or brand-new). Treat as experimental. |

This is **not** a 1.0 freeze. It is an honest boundary so core trust is not diluted by app kits.

## Introspection

```js
import {
  getExportStability,
  listExportsByStability,
  STABLE_EXPORTS,
  CANDIDATE_EXPORTS,
  EXPERIMENTAL_EXPORTS
} from "cachoujs";

getExportStability("signal");      // "stable"
getExportStability("createAuth");  // "experimental"
listExportsByStability("stable");  // string[]
```

Source of truth: `src/stability.js`.

## Stable core (summary)

- Reactivity: `signal`, `effect`, `createRoot`, `memo`, `store`, `batch`, ownership helpers, `mapArray`
- Templates: `html`, `mount` / `unmount` / `hydrate`, `htmlStatic`
- Control flow: `Show`, `Switch`, `Match`, `For`, `Index`
- Resources + mutations: `createResource`, `createMutation`, query cache helpers
- Router core: routes, layouts, loaders, guards, history helpers, file routes
- SSR: `renderToString` / `Async`, `createSSRContext`, `dehydrate`, `getSSRHead`, `renderApplication`
- Security helpers: policy, sanitizers, CSP header builders
- Forms: `createField`, `createForm`

## Candidate

Streaming SSR, islands, KeepAlive, Suspense, styles/transitions primitives, scheduler, logger/tracing bridges, a11y primitives, directives, middleware (deprecated alias remains).

## Experimental

`cachoujs/ui`, `createAuth`, `createI18n`, DnD, SEO helpers, upload, media/content collections, plugin `createApp`, DevTools, test-utils, demo file browser, `dbSignal` / `webSocketSignal`.

Prefer:

```js
import { signal, html, mount } from "cachoujs/browser"; // stable core, browser-safe
import { createAuth } from "cachoujs/auth";             // experimental subpath
```

## Policy

1. New **stable** APIs need tests + docs in the same PR.
2. Experimental modules should not be required to build a basic SPA/SSR app.
3. Demo server / CRM remain **repo-only** and are never part of the stability table.
