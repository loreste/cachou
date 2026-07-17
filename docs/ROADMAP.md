# CachouJS Roadmap

Public plan for where the project is going. Written for maintainers and users who need a straight answer, not a feature wishlist.

| | |
|--|--|
| **Current line** | **0.4.x** (published: **0.4.6**) |
| **Next publish** | **0.4.7** (patch by default) |
| **Next minor** | **0.5.0** when a coherent theme lands |
| **1.0** | API freeze after bake time — not scheduled by date |

Related: [Changelog](../CHANGELOG.md) · [Known limitations](./KNOWN_LIMITATIONS.md) · [Publishing](./PUBLISHING.md) · [Architecture](./ARCHITECTURE.md)

---

## Principles

1. **Library first.** Cachou is a reactive UI runtime + compiler, not a hosted platform or commerce stack.
2. **Patch-first releases.** Prefer many small `0.4.x` ships over large jumps. Same version on `cachoujs`, `@cachoujs/compiler`, `@cachoujs/create`.
3. **Core before surface area.** Harden reactivity, DOM, router, SSR, and the compiler before growing more app kits.
4. **Primitives over products.** Auth, i18n, UI, SEO helpers stay small and optional. Apps own backends and design systems.
5. **Honest status.** Demo server, CRM, and DB adapters in this repo are proving grounds — not the published product surface.
6. **Tests gate quality.** Unit + browser + benches under `npm run check` stay green; regressions block release.

---

## Where we are (0.4.6)

### Mature enough to build on

| Area | Notes |
|------|--------|
| Reactivity | Signals, effects, memos, stores, batch, ownership, equality options |
| Templates | `html` bindings, lists (`mapArray` / `For` / `Index`), control flow |
| Resources | Abort, stale-safe commits, cache bounds, dispose |
| Router | Layouts, loaders, actions, guards, file routes, history modes, cancel-on-stale nav |
| SSR | String / async / stream, islands, concurrent contexts, preload, dehydrate |
| Forms | Field/form helpers, nested paths, validators (basic) |
| Security | Escape defaults, URL/style policy, production policy helper |
| Packaging | `cachoujs` + `cachoujs/browser`, Vite plugin, scaffold, JS compiler |

### Shipped but still early

Treat these as **usable primitives**, not finished product lines:

| Area | Notes |
|------|--------|
| Styles / transitions | Works; not a full design system |
| Plugins | `launch` / `plug` / provide |
| Content collections | Node-oriented; browser entry excludes them |
| Image / media | Helpers present; no build-time optimizer plugin |
| UI / utils / auth / i18n / DnD / SEO / upload / machine | Subpath modules; expect rough edges and API churn |
| Logger / tracing | Off by default; no bundled OpenTelemetry exporter |
| DevTools / VS Code | In-repo only; not store/Marketplace published |

### Explicitly not production (repo only)

| Area | Notes |
|------|--------|
| Demo HTTP/WS server | Gated by `CACHOU_DEMO` |
| DB adapters | SQLite/memory for demos; Postgres/MySQL/Mongo/Firebase stubs |
| CRM app | Proving ground; separate from the npm package |

---

## Near term — finish the 0.4 line (`0.4.7` …)

Theme: **harden what we already ship.** No large new product surface unless it unblocks real bugs.

### Runtime & correctness

- [x] More adversarial tests for router cancellation, SSR concurrency, and resource races *(0.4.6: auth guards, middleware fail-closed, KeepAlive)*
- [x] Document and stabilize the public contract of `createSSRContext` / fail-closed dehydrate *(0.4.6)*
- [x] Audit app-primitive modules (ui, auth, i18n, …) for SSR safety and disposal leaks *(0.4.6: auth, toast, Popover/Menu timers, InfiniteScroll)*
- [x] Keep browser entry free of accidental Node pulls; tighten package `exports` as needed *(0.4.6: static import graph test)*
- [ ] Further resource/mutation abort edges and remaining UI kit dispose passes

### Compiler & tooling

- [ ] Keep JS ↔ Go compiler parity green; fix diagnostic gaps as they show up
- [ ] Improve error messages for common SFC mistakes (clear location, actionable text)
- [ ] Scaffold defaults stay aligned with published versions and browser entry
- [ ] Optional: package multi-arch native compiler binaries more cleanly for consumers who want them

### Docs & DX

- [ ] Keep README / API / how-tos in sync with each patch (modest tone)
- [ ] Fill remaining how-to gaps only where users hit real friction (SSR concurrent servers, browser entry, logger/tracing)
- [ ] Benchmark results and performance targets refreshed when numbers move for real reasons

### Repo hygiene

- [ ] CRM and demo stay examples — do not pull them into the published package
- [ ] CI: Chromium primary; Safari remains non-blocking if flaky
- [ ] No token/secret leakage; publish checklist remains manual and small

**Exit criteria for “0.4 line is done enough”:** core APIs feel boring, docs match code, `npm run check` is reliable on clean machines, no known data races in SSR/router under documented patterns.

---

## 0.5 — Production library line

Theme: **trust and deploy.** A deliberate minor when the 0.4 core is calm.

### Planned focus

| Theme | Intent | Non-goals |
|-------|--------|-----------|
| **API clarity** | Mark stable vs experimental exports; consistent `.d.ts`; deprecate or hide demos that confuse users | Freezing 1.0 early |
| **SSR deploy path** | Documented Node SSR recipe; optional thin adapters (e.g. Node HTTP, static shell) | Full meta-framework, edge runtime matrix day one |
| **Streaming depth** | Better deferred/island streaming beyond “shell then body” | Matching every React/Solid streaming edge case |
| **Compiler quality** | Better diagnostics; source maps good enough for day-to-day debugging | Full TypeScript language service inside the compiler |
| **Observability** | Documented logger + tracing bridges; sample OTel wiring in docs/examples | Shipping a vendor APM |
| **Primitives triage** | Promote a few that prove useful; demote/document the rest as experimental | Building a Material-sized component library |

### Candidate deliverables (priority order)

1. Stability labels in docs/API (`stable` / `experimental`)
2. One supported SSR deploy recipe (Node) with concurrent context examples
3. Improved streaming + island hydration story
4. Compiler diagnostics pass that developers can act on without reading source
5. Explicit experimental boundary for UI/auth/i18n/media so core trust isn’t diluted
6. Optional: first-class static export notes for SPA + hash history

**0.5 is not:** “ecommerce shell”, “full TS parser”, or “hosted Cachou cloud”.

---

## 0.6 — Ecosystem & ergonomics (pre-1.0)

Theme: **make it easier to live with**, still without becoming a platform.

| Theme | Intent |
|-------|--------|
| **Types** | Stronger public TypeScript surface; better inference for common APIs (still JS runtime) |
| **Editor** | VS Code extension publish path (Marketplace) if quality holds |
| **DevTools** | Shipable browser extension or solid in-page tooling; fewer “repo only” paths |
| **Content / images** | Optional build-time content/image pipeline if demand is real |
| **Deploy adapters** | Small, optional packages (Workers / Deno / static) only if maintained with tests |
| **Examples** | Fewer half-demos; 2–3 sharp examples (SPA, Node SSR, CRM-like app) |

Each item ships only when tests and docs ship with it.

---

## 1.0 — Freeze

1.0 means **API commitment**, not “feature complete forever”.

### Entry criteria (all required)

- [ ] Core reactivity, templates, router, resources, SSR, and forms documented as **stable**
- [ ] No silent breaking changes planned for those surfaces without a major bump
- [ ] Experimental modules clearly namespaced or documented as such
- [ ] `npm run check` green; known security issues addressed
- [ ] Install + SSR + SPA paths work from published packages alone (no monorepo required)
- [ ] Changelog discipline and version policy still hold

### What 1.0 does *not* require

- Marketplace extension or Chrome Web Store listing
- Every app primitive module
- Feature parity with React/Vue/Svelte/Solid ecosystems
- Production multi-database adapters in the monorepo

---

## Out of scope

| Item | Why |
|------|-----|
| Commerce backend (payments, inventory, carts as a product) | Application concern |
| Turning demo DB adapters into a database product | Wrong layer |
| Replacing the CRM with a private SaaS | Repo CRM is a sample |
| Full TypeScript type-checker inside the SFC compiler | Use `tsc` / editor; compiler stays pragmatic |
| Competing on ecosystem size short-term | Prefer a small correct core |
| Shipping tokens, hosted auth, or cloud dashboards as Cachou | Out of mission |

---

## Version policy (recap)

| Change type | Version |
|-------------|---------|
| Fixes, docs, CI, small APIs | **patch** (`0.4.x` → `0.4.x+1`) |
| Coherent theme (e.g. production library line) | **minor** (`0.5.0`) |
| Stable API freeze | **1.0.0** (later) |
| Packages | Bump `cachoujs`, `@cachoujs/compiler`, `@cachoujs/create` together |

Do not skip versions for marketing. Prefer boring releases.

---

## How progress is judged

| Signal | Good | Not enough |
|--------|------|------------|
| Tests | `npm run check` green on a clean machine | Green only on one laptop |
| Docs | README + API match reality | Feature lists without code |
| Perf | Benchmarks explain regressions | Marketing rankings |
| Users | Apps can ship SPA/SSR with pins | Demo flags required in production |
| Scope | Core stays small | Endless app kits without ownership |

---

## Line history (brief)

| Line | What it was for |
|------|------------------|
| **0.3.x** | Experimental core: signals, basic router load, SSR isolation |
| **0.4.x** | Library surface: composition, data, SSR path, styles, plugins, content, browser entry, observability (**current**) |
| **0.5.x** | Production library line: stability labels, deploy recipes, deeper SSR/streaming, compiler DX |
| **0.6.x** | Ergonomics and optional ecosystem packages |
| **1.0** | Stable core API commitment |

---

## Working the plan

1. File work as issues or PRs tagged by theme (`core`, `ssr`, `compiler`, `docs`, `experimental`).
2. Default merge path is **patch** on `0.4.x` until 0.5 criteria are met.
3. Update this file when a theme completes or is deferred — do not leave “shipped” tables pretending to be a future plan.
4. When unsure, prefer fixing a race or a doc over adding a new export.

Last updated for **0.4.6** (2026-07).
