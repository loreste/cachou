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

### P2 — Template + DOM

| Feature | Status | API |
|---------|--------|-----|
| Directives | shipped | `directive(name, fn)`, `use:name` |
| Two-way binding | shipped | `model` / built-in model directive |
| Head merge | shipped | `useHead` multi-source title/meta/link/jsonld |
| Dialog | shipped | `Dialog` primitive |

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

## Later (post-0.4)

- Full TypeScript parser inside the SFC compiler
- Deploy adapters (Workers, Deno, static)
- Official UI kit
- Marketplace VS Code / browser DevTools listing
- Streaming interleaving of deferred boundaries (beyond shell stream)

## Out of scope

- Commerce backend (payments, inventory) — app concern
- Replacing Postgres CRM with a private DB product

## Versioning

- **0.3.x** — experimental core (signals, router load, SSR isolation)
- **0.4.x** — library + data + SSR production primitives
- **1.0** — API freeze after production bake time
