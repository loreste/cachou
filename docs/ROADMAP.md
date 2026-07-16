# CachouJS Roadmap

Public plan for framework completeness. Status reflects the **0.4** line.

## 0.4 — Framework completeness + ecommerce shell

### P0 — Library foundations

| Feature | Status | API |
|---------|--------|-----|
| `untrack` + owner APIs | shipped | `untrack`, `getOwner`, `runWithOwner` |
| Composition | shipped | `splitProps`, `mergeProps`, `Dynamic` |
| Lists | shipped | `For`, `Index` (plus existing `mapArray`) |

### P1 — Data layer + router

| Feature | Status | API |
|---------|--------|-----|
| Route control flow | shipped | `redirect()`, `notFound()` from `load` |
| Route actions | shipped | `createAction`, route `action`, `useAction` |
| History modes | shipped | `configureRouter({ history })` — browser / hash / memory |
| Richer path patterns | shipped | optional `:id?`, rest `:path*` |
| Search / route params | shipped | `useParams`, `useSearchParams` |
| Router middleware | shipped | `guard` — async chain with redirect/cancel |

### P2 — Template + DOM

| Feature | Status | API |
|---------|--------|-----|
| Directives | shipped | `directive(name, fn)`, `use:name` |
| Two-way binding | shipped | `model` / built-in model directive |
| Head merge | shipped | `useHead` multi-source title/meta/link/jsonld |
| Dialog | shipped | `Dialog` primitive |
| KeepAlive | shipped | `KeepAlive` — LRU cached component trees |

### P3 — SSR production path

| Feature | Status | API |
|---------|--------|-----|
| Streaming SSR | shipped | `renderToStream` |
| Islands / partial hydrate | shipped | `Island`, `hydrateIslands` |
| Request context | shipped | `getRequestEvent` / SSR request bag |

### P4 — Mutations + ecommerce shell

| Feature | Status | API |
|---------|--------|-----|
| Mutations | shipped | `createMutation` (optimistic + rollback) |
| Query cache | shipped | shared key helpers |
| Persist | shipped | `persist` |
| Array forms | shipped | nested paths in `createForm` |
| Virtual list | shipped | `virtualList` |

### P5 — Compiler

| Feature | Status | Notes |
|---------|--------|-------|
| Better source maps | shipped | section-aware maps |
| Directives in SFC | shipped | `use:` / model emit where supported |
| TS in SFC (pragmatic) | shipped | type-strip for simple annotations |

### P6 — Styling, transitions, and content

| Feature | Status | API |
|---------|--------|-----|
| Scoped CSS | shipped | `css` tagged template, `.self` scoping |
| Reactive CSS bindings | shipped | signal interpolations in `css`, `cssVar` |
| Theme system | shipped | `theme` — design tokens as custom properties |
| Global styles | shipped | `globalCSS` (de-duplicated) |
| Conditional classes | shipped | `cx` — clsx-like class joiner |
| Keyframe animations | shipped | `keyframes` (de-duplicated) |
| Transitions | shipped | `fade`, `slide`, `fly`, `scale`, `swap` |
| Transition directive | shipped | `transition` — mount/unmount animations via `use:` |
| Custom transitions | shipped | `defineTransition` |
| Easing functions | shipped | `linear`, `easeIn`, `easeOut`, `easeInOut`, `cubicBezier` |
| Content collections | shipped | `defineCollection`, `getCollection`, `getEntry` |
| Schema validation | shipped | `z` — mini Zod-like schema builder |
| Frontmatter parser | shipped | `parseFrontmatter` |
| Server-side content loading | shipped | `loadContent` |
| Image component | shipped | `Image` — lazy loading, placeholders, priority |
| Picture component | shipped | `Picture` — art direction with `<source>` |

### P7 — Plugin system

| Feature | Status | API |
|---------|--------|-----|
| App bootstrap | shipped | `launch`, `app.mount`, `app.unmount` |
| Plugin installation | shipped | `app.plug(plugin)` — function or object form |
| Dependency injection | shipped | `app.provide(key, value)` |
| Global components | shipped | `app.component(name, fn)` |
| Global directives | shipped | `app.directive(name, fn)` |
| App config | shipped | `app.config.errorHandler`, `app.config.warnHandler` |
| App context access | shipped | `getApp()` |

## Next (0.5+)

- Full TypeScript parser inside the SFC compiler
- Deploy adapters (Workers, Deno, static)
- Official UI kit / component library
- VS Code extension with SFC language support
- Browser DevTools panel
- Streaming interleaving of deferred boundaries (beyond shell stream)
- Image build plugin for automatic optimization (generate WebP/AVIF, thumbnails)
- SSR content preloading for content collections

## Out of scope

- Commerce backend (payments, inventory) — app concern
- Replacing Postgres CRM with a private DB product

## Versioning

Releases after **0.4.0** use **small increments** (patch-first):

- **Current:** `0.4.3` · **Next ship:** `0.4.4`, …
- **Default:** patch for fixes, docs, CI, and incremental APIs
- **Minor** (`0.5.0`) only for a deliberate feature-line jump
- All published packages share the same version

Line history:

- **0.3.x** — experimental core (signals, router load, SSR isolation)
- **0.4.x** — library + data + SSR production primitives + styling + transitions + plugins + content + image (current line)
- **1.0** — API freeze after production bake time
