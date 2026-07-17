# Changelog

## 0.4.5

Patch release: runtime hardening, SSR concurrency, observability, browser entry, and compiler/DOM performance work.

### Added

- **`cachoujs/browser`** — browser-safe public entry that keeps server-only content/media helpers out of client bundles; Vite plugin can target it
- **Logger** — `configureLogger`, `getLoggerConfig`, `createLogger` with level filtering and custom sinks
- **Tracing** — W3C `traceparent` spans (`configureTracing`, `startSpan`, `runWithSpan`, `createTracer`, extract/format helpers); disabled by default
- **DOM cleanup tracking** — `dom-cleanup` registration path for reliable node teardown
- **`createCompiledStatic`** — compiler/runtime boundary for direct static DOM factories
- **`configureResourceCache`** — bounded LRU for resolved resource data (`maxEntries`)
- **Resource `dispose()`** — manual dispose for unowned resources / request cancellation
- **Router history helpers** — `go`, `back`, `forward`
- **Signal/memo equality options** — `equals: false` or custom equality comparator
- **SSR options** — path/request/signal/traceparent/context/`preload` on `renderToString`, `renderToStringAsync`, `renderToStream`
- **SSR benchmarks** — `npm run bench:ssr`
- **Compiler parity check** — `scripts/check-compiler-parity.mjs` in the quality pipeline

### Fixed / improved

- **SSR concurrency** — request-scoped isolation for resource cache, head metadata, dehydrate, and memory history; fail-closed serialization; abort propagation on stream cancel
- **Navigation** — stale async guard/loader cancellation; rapid navigation commits only the final route
- **`mapArray`** — immutable keyed reuse, reverse/reorder identity preservation, lazy unique lookup
- **`store`** — array length truncation invalidates removed index subscribers
- **HTML runtime** — larger rewrite for SSR safety (URL/style sanitization, head link allowlist, island metadata escaping)
- **JS + Go compilers** — safer static factories, nested reactive CSS binds, improved diagnostics
- Competitive and memory benchmarks expanded; docs/API/how-tos updated for the new surface

### Tests

- Unit suite expanded (**514** tests), including SSR concurrency, browser entry, virtual list, mapArray, and reactivity equality paths
- Browser tests **103/103**; benchmarks, memory, competitive, and SSR benches green under `npm run check`

## 0.4.4

Patch release: validation and CI hardening.

### Fixed

- **`dateISO`**: timezone-safe calendar validation (no longer rejects valid winter dates west of UTC)
- **CI**: clear timers in `test-utils` / transitions for guardrails
- **CI**: keep optional `sharp` out of browser Vite builds; media helpers via `cachoujs/media` only
- **CI**: Safari job no longer paints the commit status red

### Tests

- Expanded `dateISO` cases (Jan 1, leap day, invalid calendar days)

## 0.4.3

Patch release expanding app primitives and media.

### Added

- **UI kit** — Toast, Drawer, Popover, Menu, DataTable, InfiniteScroll, Tabs, Accordion, Breadcrumbs, Tooltip, Avatar, Badge
- **Auth** — `createAuth` primitives and route protection helpers
- **i18n** — `createI18n` with locale loading and formatting
- **State machine** — `machine()`
- **Keys** — `hotkey`, `holdKey`
- **Utils** — `debounce`, `throttle`, `useMedia`, `useBreakpoint`, `useColorMode`, `useClipboard`, `useOnline`, `useIdle`
- **DnD** — `createDragDrop`
- **SEO** — sitemap, robots, OG tags, structured data, canonical URL helpers
- **Feedback** — Progress, Spinner, Skeleton, CommandPalette, CSV export
- **Validate / mask** — form validators, input masks
- **Upload** — `createUpload`, `DropZone`
- **Media** — image/video compress helpers, srcset, blur placeholder, `Video`
- **Test utils** — `renderTest`, `act`, `fireEvent`, `waitFor`
- Module subpath exports + dedicated `.d.ts` for several packages
- Postgres adapter and experimental adapter improvements

### Tests

- Expanded unit coverage (449 tests)

## 0.4.2

Patch release with styling, transitions, content, images, plugins, and hardening.

### Added

- **Styles** — `css`, `cssVar`, `theme`, `globalCSS`, `cx`, `keyframes` (`cachoujs/styles`)
- **Transitions** — `fade`, `slide`, `fly`, `scale`, `swap`, `transition`, `defineTransition`, easings
- **Image** — `Image`, `Picture` with lazy loading / placeholders
- **Content collections** — `defineCollection`, `getCollection`, `getEntry`, `parseFrontmatter`, `loadContent`, `z`
- **App plugins** — `launch` / `createApp`, `getApp`, `app.plug()`, provide / register APIs
- **Router** — `guard` / `addMiddleware` async navigation chain
- **KeepAlive** — LRU-cached component trees
- Compiler enhancements for new surface (see `compiler.go`)
- Docs: STYLING, TRANSITIONS, CONTENT, IMAGE, PLUGINS; expanded API/GUIDE/README/ROADMAP
- VS Code snippets and grammar updates; more unit tests (styles, transitions, content, security, …)

### Fixed / hardened

- Demo server / files / adapters security and middleware improvements
- `persist` and DevTools polish

### Docs polish (carried from 0.4.1+)

- Get Started + how-tos for 0.4; scaffold pins; CI benchmark path notes

## 0.4.1

Patch release (small-increment policy). See [docs/PUBLISHING.md](./docs/PUBLISHING.md).

### Fixed

- CI: benchmark runners use Playwright/Chromium on Linux (no Safari/`osascript` requirement); macOS Safari job is non-blocking.
- CI: perf baseline gates use looser thresholds under `CI=true` (`ratio=2.5`, `slackMs=25`) so shared Linux runners do not false-fail Safari-era baselines.

### Docs

- Document **patch-first** versioning: next after 0.4.0 is 0.4.1, then 0.4.2, …

## 0.4.0

### Reactivity & composition

- **`untrack`**, **`getOwner`**, **`runWithOwner`** for library-safe ownership and non-tracking reads.
- **`splitProps`**, **`mergeProps`**, **`Dynamic`** for component composition.
- **`For`** / **`Index`** list components (keyed and index-stable) on top of `mapArray`.

### Router & data

- **`redirect()`** / **`notFound()`** from route `load` (typed errors).
- **`createAction`** + form helper for write-path / mutations from UI.
- **`configureRouter({ history })`**: `browser` | `hash` | `memory`.
- Richer **`matchPath`**: optional `:id?`, rest `:path*`, prefix `/*`.
- **`useParams`**, **`useSearchParams`** reactive helpers.
- **`createMutation`**, query cache helpers, **`optimisticUpdate`**, **`persist`**.

### Templates & UI

- **Directives** (`directive`, `use:name`) and **`model`** two-way binding (plus existing `bind:`).
- **`useHead`** merge: meta, links, JSON-LD.
- **`Dialog`** primitive (focus trap, Esc, backdrop).
- Nested **`createForm({ nested: true })`** path fields.
- **`virtualList`** for large catalogs.

### SSR

- **`renderToStream`** (ReadableStream / async generator).
- **`Island`** + **`hydrateIslands`** partial hydration.
- **`getRequestEvent` / `setRequestEvent`** SSR request bag for loaders.

### Compiler

- Expanded generated imports (For, Index, actions, etc.).
- Section-aware source maps; pragmatic **TypeScript strip** in `<script>`.

### Docs

- Public **`docs/ROADMAP.md`**.

## 0.3.0

### Runtime

- **Route loaders:** `Route({ load, fallback, error })`, `useRouteData()`, `getRouteData()` with abort on navigation.
- **File-based routing:** `fileRoutes`, `createFileRoutes`, `filePathToRoutePath` (`cachoujs/file-routes`).
- **Control flow:** `Show`, `Switch`, `Match` (`cachoujs/flow`).
- **DevTools:** `mountDevtools()`, `installDevtoolsHotkey()` (Ctrl+Shift+D), event + snapshot panel (`cachoujs/devtools`).
- **Browser extension:** `extensions/browser-devtools` (MV3, load unpacked).

### Packages

- **`@cachoujs/compiler`**: pure JS SFC compiler (no Go required).
- **`@cachoujs/create`**: scaffold with file routes.
- npm workspaces + `compiler:build:multiarch` for optional native binaries.
- Root compiler launcher: native → dist multi-arch → JS → `go run`.

### Compiler

- Literal braces: `{{` → `{`, `}}` → `}`.
- Emits external `.js.map` with `sourcesContent` plus `sourceMappingURL`.
- Generated imports include `Show` / `Switch` / `Match` / route data helpers.

### Quality & packaging

- Unit tests for mapArray stress, store, flow, concurrent SSR contexts.
- Experimental multi-DB adapters replaced with explicit stubs.
- SSR starter example: `examples/ssr-starter/`.
- `npm run publish:prep` verification script.
- Subpath exports: `./flow`, `./devtools`.
- Docs: route loaders, Show/Switch, DevTools how-tos.

## 0.2.0

### Editor

- VS Code / Cursor extension in `vscode-cachou/`: `.cachou` grammar, snippets, completions, hover, compile commands, diagnostics, compile-on-save, docs commands.

### Security

- Demo APIs (`/api/db-query`, `/api/todos`, `/api/files`) require `CACHOU_DEMO=1`.
- Production `npm start` defaults demo mode **off**.
- `/api/db-query` only accepts simple allowlisted `SELECT` statements.
- Files API defaults to `./sandbox` instead of the full repository cwd.
- SQLite `syncTable` restricted to the `todos` table with safe columns.

### Packaging & compiler

- Versioned as **0.x** (experimental API).
- Compiler emits `import … from "cachoujs"` (override with `-runtime`).
- Directory compile **fails the process** if any file errors.
- `go.mod` added; deprecated `ioutil` removed.
- Cross-platform compiler: build from source via `postinstall` / `npm run compiler:build` (no arm64-only binary required in the package).
- Published Vite plugin: `cachoujs/vite`.
- `create-cachou` scaffold CLI.

### Runtime

- Per-request SSR isolation (`createSSRContext` + AsyncLocalStorage on Node).
- Nested routing: `Layout` + `Outlet`.
- `applyProductionSecurityDefaults()`.
- Experimental multi-DB adapters gated by `CACHOU_DB_EXPERIMENTAL=1`.

### Quality

- Node unit tests for reactivity and demo-guard.
- Browser tests prefer Playwright Chromium; Safari remains a fallback on macOS.
- Linux CI job on Ubuntu with Chromium.
- `.gitignore` and `.env.example`.
- Runnable examples under `/examples/`.
- Deploy guide: `docs/DEPLOY.md`.

## 0.1.0 (prior unreleased work)

- Added `ErrorBoundary`.
- Added form helpers: `createField` and `createForm`.
- Added accessibility helpers: live regions, focus restoration, focus-first, and focus trapping.
- Added framework event hooks with `onFrameworkEvent`.
- Added configurable DOM security policy and `trustedHTML`.
- Improved resources with source-driven refetching, invalidation, prefetching, optional dedupe, and timeouts.
- Improved router with navigation guards, decoded params, not-found helper, and scroll/focus restoration.
- Added API, security, and limitations documentation.
- Added release dry-run script: `npm run pack:dry`.
- Added competitive benchmark harness for CachouJS, React, Vue, Preact, Solid, and Svelte: `npm run bench:compare`.
