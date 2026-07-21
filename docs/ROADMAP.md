# CachouJS Roadmap

Public plan for where the project is going. Written for maintainers and users who need a straight answer, not a feature wishlist.

| | |
|--|--|
| **Current line** | **1.0.x** (published: **1.0.9**) |
| **Next publish** | **1.0.10** (patch by default) |
| **Next minor** | **1.1.0** for backward-compatible features |
| **1.0** | **Shipped** — stable core frozen |

Related: [Changelog](../CHANGELOG.md) · [Known limitations](./KNOWN_LIMITATIONS.md) · [Publishing](./PUBLISHING.md) · [Architecture](./ARCHITECTURE.md)

---

## Principles

1. **Library first.** Cachou is a reactive UI runtime + compiler, not a hosted platform or commerce stack.
2. **Patch-first releases.** Prefer many small patch ships over large jumps. Same version on `cachoujs`, `@cachoujs/compiler`, `@cachoujs/create`.
3. **Core before surface area.** Harden reactivity, DOM, router, SSR, and the compiler before growing more app kits.
4. **Primitives over products.** Auth, i18n, UI, SEO helpers stay small and optional. Apps own backends and design systems.
5. **Honest status.** Demo server, CRM, and DB adapters in this repo are proving grounds — not the published product surface.
6. **Tests gate quality.** Unit + browser + benches under `npm run check` stay green; regressions block release.

---

## Where we are (1.0.0)

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

## Near term — 0.4 line complete; patches as needed (`0.4.14` …)

Theme: **harden what we already ship.** No large new product surface unless it unblocks real bugs.

### Runtime & correctness

- [x] More adversarial tests for router cancellation, SSR concurrency, and resource races *(0.4.6: auth guards, middleware fail-closed, KeepAlive)*
- [x] Document and stabilize the public contract of `createSSRContext` / fail-closed dehydrate *(0.4.6)*
- [x] Audit app-primitive modules (ui, auth, i18n, …) for SSR safety and disposal leaks *(0.4.6: auth, toast, Popover/Menu timers, InfiniteScroll)*
- [x] Keep browser entry free of accidental Node pulls; tighten package `exports` as needed *(0.4.6: static import graph test)*
- [x] Further resource/mutation abort edges and remaining UI kit dispose passes *(0.4.7: createMutation abort/dispose, prefetch signal, InfiniteScroll/Accordion/toast/Drawer)*

### Compiler & tooling

- [x] Keep JS ↔ Go compiler parity green; fix diagnostic gaps as they show up *(0.4.8: absolute locations, expanded diagnostic suite)*
- [x] Improve error messages for common SFC mistakes (clear location, actionable text) *(0.4.8: hints + CompilerDiagnostic)*
- [x] Scaffold defaults stay aligned with published versions and browser entry *(0.4.8–0.4.9: create pins)*
- [x] Optional: package multi-arch native compiler binaries more cleanly for consumers who want them *(0.4.9: JS-default launcher, manifest, GitHub-only tarballs)*

### Docs & DX

- [x] Keep README / API / how-tos in sync with each patch (modest tone) *(ongoing; 0.4.9 how-to index + new guides)*
- [x] Fill remaining how-to gaps only where users hit real friction (SSR concurrent servers, browser entry, logger/tracing) *(0.4.9)*
- [x] Benchmark results and performance targets refreshed when numbers move for real reasons *(0.5.1)*

### Repo hygiene

- [x] CRM and demo stay examples — do not pull them into the published package *(0.4.9: package-surface tests)*
- [x] CI: Chromium primary; Safari remains non-blocking if flaky *(0.5.1: documented + continue-on-error)*
- [x] No token/secret leakage; publish checklist remains manual and small *(0.5.1: publish-prep secret scan + version/changelog gates)*

**Exit criteria for “0.4 line is done enough”:** core APIs feel boring, docs match code, `npm run check` is reliable on clean machines, no known data races in SSR/router under documented patterns.

**Status (0.5.1):** Near-term 0.4 checklist is complete. Further **0.4.x** patches ship only for regressions/security. The next **theme** is **0.5 — Production library line**.

---

## 0.5 — Production library line

Theme: **trust and deploy.**

### Shipped in 0.5.0–0.5.1

- [x] Stability labels in docs/API (`stable` / `candidate` / `experimental`) *(0.5.0)*
- [x] One supported SSR deploy recipe (Node) with concurrent context examples (`renderApplication`, `examples/node-ssr`) *(0.5.0)*
- [x] Improved streaming + island hydration story *(0.5.1: progressive stream, Island fallback, hydrateIslands options)*
- [x] Compiler diagnostics pass that developers can act on without reading source *(0.5.1: CACHOU001–013 catalog)*
- [x] Explicit experimental boundary callouts *(0.5.1: EXPERIMENTAL.md + README)*
- [x] First-class static export notes for SPA + hash history *(0.5.1)*
- [x] Sample OTel wiring in docs *(0.5.1: bridge-opentelemetry how-to)*

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

1. ~~Stability labels~~ ✅ 0.5.1  
2. ~~Node SSR recipe~~ ✅ 0.5.1  
3. ~~Streaming + islands~~ ✅ 0.5.1  
4. ~~Compiler diagnostics catalog~~ ✅ 0.5.1  
5. ~~Experimental boundary docs~~ ✅ 0.5.1  
6. ~~SPA static export + hash history~~ ✅ 0.5.1  

**0.5 is not:** “ecommerce shell”, “full TS parser”, or “hosted Cachou cloud”.

**Status (0.5.1):** Production-library theme deliverables complete. Further **0.5.x** patches for regressions only.

---

## 0.6 — Ecosystem & ergonomics (pre-1.0)

Theme: **make it easier to live with**, still without becoming a platform.

### Shipped in 0.6.0–0.6.5

- [x] Stronger public TypeScript surface + package `exports` types + core generics *(0.6.0)*
- [x] TypeScript how-to + subpath `.d.ts` for forms/router/flow/html/reactivity *(0.6.0)*
- [x] VS Code extension version aligned; Marketplace publish path documented *(0.6.0)*
- [x] Residual subpath types (`files`, `devtools`) + `ssr-adapters` *(0.6.1)*
- [x] Fetch SSR adapters for Workers / Deno / Bun (`createFetchHandler`) with tests *(0.6.1)*
- [x] Browser DevTools zip packaging (`npm run ext:devtools`) + how-to *(0.6.1)*
- [x] Static pre-render (`cachoujs/static`) + Vite plugin types + extension packaging in CI *(0.6.2)*
- [x] Content build pipeline (`buildContent` / manifest / routes) + image srcset helpers + types polish *(0.6.3)*
- [x] Consumer surface tests + create templates (`spa` / `ssr` / `static`) + DEPRECATIONS / 1.0 checklist progress *(0.6.4)*
- [x] CI extension artifacts + security residual tests + framework how-to rename + `npm run check` green *(0.6.5)*

### Planned (optional, out-of-band)

| Theme | Intent |
|-------|--------|
| **Editor** | Marketplace publish when publisher account is ready (VSIX built + uploaded in CI) |
| **DevTools** | Chrome Web Store listing when quality holds (zip built + uploaded in CI) |
| **Content / images** | External optimizer plugins only if demand is real |

Each item ships only when tests and docs ship with it.

**Status (1.0+):** 0.6 ecosystem theme complete; stable core frozen. Optional store publishes remain out-of-band.

---

## 1.x — Maintenance (post-freeze)

Theme: **boring patches**, optional minors.

| Track | Intent |
|-------|--------|
| **1.0.x** | Bug fixes, docs, CI, security residual — no stable API breaks |
| **1.1+** | Backward-compatible features only when tests + docs ship with them |
| **2.0** | Only if a stable API must break |

### Shipped in 1.0.1

- [x] Once-only deprecation warnings; npm package metadata; 1.x roadmap *(1.0.1)*

### Shipped in 1.0.2

- [x] SSR quoted-attribute URL/style policy; demo SQL UNION/ORDER BY hardening; `sanitizeHTML` entity/nested-tag fixes *(1.0.2)*

### Shipped in 1.0.3

- [x] `sanitizeHTML` whitespace-in-scheme (Chromium-validated); nested `createForm().reset(nextValues)`; URL control-char emit *(1.0.3)*

### Shipped in 1.0.4

- [x] Slash-delimited sanitizer attrs; CSP nonce fail-closed without Web Crypto; honest maturity/security docs *(1.0.4)*

### Shipped in 1.0.5

- [x] Demo SQL `LIMIT` cap (1000); CI Linux-first + bench noise budget; publish-prep GHA check *(1.0.5)*

### Shipped in 1.0.6

- [x] Actions @v6; SSR nonce Node fallback in scaffold/examples; `npm run publish:check` *(1.0.6)*

---

## 1.0 — Freeze (**shipped 1.0.0**)

1.0 means **API commitment**, not “feature complete forever”. See [ONE_POINT_OH.md](./ONE_POINT_OH.md).

### Entry criteria (all required)

- [x] Core reactivity, templates, router, resources, SSR, and forms documented as **stable** *(labels + STABILITY.md)*
- [x] No silent breaking changes planned for those surfaces without a major bump *(policy + DEPRECATIONS.md)*
- [x] Experimental modules clearly namespaced or documented as such *(EXPERIMENTAL.md + subpaths)*
- [x] `npm run check` green; known security issues addressed *(0.6.5: check green on clean CI path; residual risk table in SECURITY.md)*
- [x] Install + SSR + SPA paths work from published packages alone *(create templates spa/ssr/static + consumer-surface tests; 0.6.4)*
- [x] Changelog discipline and version policy still hold

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
| Coherent theme (e.g. production library line) | **minor** (`0.5.1`) |
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
| **0.4.x** | Library surface: composition, data, SSR path, styles, plugins, content, browser entry, observability |
| **0.5.x** | Production library line: stability labels, deploy recipes, deeper SSR/streaming, compiler DX |
| **0.6.x** | Ergonomics and optional ecosystem packages |
| **1.0.x** | Stable core API freeze (**current**) |

---

## Working the plan

1. File work as issues or PRs tagged by theme (`core`, `ssr`, `compiler`, `docs`, `experimental`).
2. Default merge path is **patch** on `0.4.x` until 0.5 criteria are met.
3. Update this file when a theme completes or is deferred — do not leave “shipped” tables pretending to be a future plan.
4. When unsure, prefer fixing a race or a doc over adding a new export.
5. **Always add a changelog** under the target version in [CHANGELOG.md](../CHANGELOG.md) for every shipped change set (required before publish).

Last updated for **1.0.1** (2026-07).
