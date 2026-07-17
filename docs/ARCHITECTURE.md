# Architecture

How CachouJS is structured and how data flows through the system.

---

## Layers

```text
┌─────────────────────────────────────────────────────────────┐
│  Application (demo, examples, CRM, your app)                │
├─────────────────────────────────────────────────────────────┤
│  .cachou compiler (Go)  →  generated JS modules             │
├─────────────────────────────────────────────────────────────┤
│  Runtime (published as cachoujs)                            │
│    reactivity · html · reconcile · router · forms · a11y    │
├─────────────────────────────────────────────────────────────┤
│  Optional demo server (NOT the core product surface)        │
│    demo-guard · files · db adapters · websocket · SSR host  │
└─────────────────────────────────────────────────────────────┘
```

| Layer | Publish? | Role |
|-------|----------|------|
| `src/*` | Yes | Browser / isomorphic runtime |
| `plugin/vite.js` | Yes (`cachoujs/vite`) | Dev/build integration |
| `compiler.go` | Yes (source) | SFC compile |
| `server/*` | No (repo only) | Demo APIs |
| `crm/*` | No | CRM proving ground (PostgreSQL) |
| `demo/`, `examples/` | No | Learning surfaces |

The npm package is intentionally small (~60KB packed): runtime + compiler source + plugin + docs, not the CRM or `node_modules` competitors used only for benchmarks.

---

## Reactive graph

```text
signal ──► subscribers (effects, memos, template bindings)
              │
              ├── owned children (nested effects)
              └── cleanups (onCleanup)

createRoot / mount
   └── owns the top-level owner tree
```

1. **Signals** hold a value and a `Set` of subscriber computations.  
2. **Active effect** is a thread-local (module-level) pointer. Reading a signal while an effect runs registers the effect.  
3. **Batching** queues subscribers and flushes once when `batchDepth` returns to 0.  
4. **Disposal** walks owned children and cleanups; subscribers are removed from dependency sets.

Delegated and direct DOM event listeners execute inside a synchronous batch, so
one user event cannot trigger duplicate intermediate renders when it writes
multiple signals or store properties.

Template bindings create small effects (or one-shot static assigns) that write to DOM nodes. List updates go through `mapArray` + `reconcile` for keyed moves.

---

## Rendering pipeline

### Client `html` templates

1. Template strings → compile bindings (paths into cloned DOM) → cache on `WeakMap`.  
2. Clone template content.  
3. Resolve target nodes by path.  
4. For each binding: attach effect / listener / property.  
5. Register node cleanups for disposal when the node leaves the tree.

### List reconciliation

`mapArray` maintains a map from key → row. On update:

- Reuse rows with the same key  
- Move DOM nodes to match order  
- Dispose removed rows  
- Create rows for new keys  

Options `uniqueKeys` and `reactiveItems` select faster paths when the app guarantees invariants.

### Mount roots

`mount` / `render` / `hydrate` create a reactive root and store a disposer on the container. Re-rendering the same container disposes the previous tree first.

---

## SSR pipeline

```text
request
  → createSSRContext()
  → runWithSSRContextAsync (ALS when available)
      → reset head + resource counter
      → run component (resources populate context.ssrCache)
      → resolvePendingResources()
      → render string
  → setLastSSRContext(context)
  → dehydrate() / getSSRHead() read last context
  → HTML response with state script + head tags
client
  → window.__CACHOU_STATE__
  → hydrate() reuses resource indices / markup
```

**Isolation:** each async render has its own cache/counter/head. Concurrent Node requests use AsyncLocalStorage when `installSSRAsyncHooks` has been called (production `server.js` and Vite config do this).

**Sequential API:** after `await renderToStringAsync()`, `dehydrate()` uses the last completed context for the common sequential case. Concurrent handlers should pass an explicit context to rendering, `dehydrate(context)`, and `getSSRHead(context)`; implicit serialization fails closed if overlapping renders make the last context ambiguous.

---

## Router model

```text
path signal (router-state)
   │
   ├─ Route: match exact / :params / * / /*
   ├─ Layout: match prefix + provide OutletContext
   │     └─ child Route(s) scored by path length
   └─ Link / navigate / beforeNavigate / history popstate
```

The router is intentionally minimal: no file routes, no loaders, no nested URL layout conventions beyond `Layout` + `Outlet`.

---

## Security boundaries

```text
Browser runtime
  - escape text
  - sanitize URL/style attrs
  - trustedHTML explicit opt-out

Demo HTTP (CACHOU_DEMO=1 only)
  - todos CRUD
  - allowlisted SELECT only
  - files under sandbox root

Production app APIs (your code)
  - real authn/z, validation, CSP
```

See [Security](./SECURITY.md).

---

## Package module graph

```text
index.js
  ├─ reactivity.js  ← ssr-context.js
  ├─ html.js        ← reactivity, reconcile, router-state
  ├─ router.js      ← reactivity, html, router-state
  ├─ forms.js
  ├─ a11y.js
  ├─ files.js
  └─ components/FileBrowser.js
```

Subpath exports allow importing only `cachoujs/reactivity` etc., but the root entry re-exports the full surface for convenience. Bundlers may tree-shake unused exports when side-effect free; prefer subpaths for minimal apps if size is critical.

---

## Compiler placement

```text
.cachou source
    → Go compiler
    → Component.js + Component.css
    → import from "cachoujs"
    → Vite/Rollup bundles with app
```

The compiler does not embed the runtime; it only generates imports and setup/render functions. Runtime behavior always comes from `cachoujs`.

---

## Testing architecture

| Suite | Mechanism |
|-------|-----------|
| Unit | `node --test` on pure modules + demo-guard |
| Browser | Vite serves `/tests/`; Playwright (or Safari) reads `window.__CACHOU_TEST_RESULTS__` |
| Compiler | Fixture compile + diagnostic negative cases |
| Perf | Safari/Chromium harnesses writing timings; baselines in `benchmarks/baselines.json` |
| Competitive | Multi-framework adapters under `benchmarks/compare` |

CI primary path: Ubuntu + Chromium. See [how-to: quality checks](./how-to/run-quality-checks.md).

---

## Extension points for app authors

| Need | Extension |
|------|-----------|
| Data loading | `createResource` + your API |
| Auth | Your middleware; do not use demo APIs |
| Global state | `signal` / `store` modules |
| Nested chrome | `Layout` + `Outlet` |
| Observability | Structured logger, `onFrameworkEvent`, optional OpenTelemetry-compatible spans |
| Design system | `.cachou` components + scoped CSS |
| Meta framework | Compose Vite plugin + your file router if needed |

CachouJS aims to stay a **library**, not a full meta-framework. The CRM in-repo proves the runtime can host real apps; it is not the framework kernel.
