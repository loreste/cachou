# Changelog

## Unreleased → 0.4.1

Patch releases only from here: accumulate fixes and small improvements under **0.4.1**, then **0.4.2**, etc. (see [docs/PUBLISHING.md](./docs/PUBLISHING.md) version policy).

### Fixed

- CI: benchmark runners use Playwright/Chromium on Linux (no Safari/`osascript` requirement); macOS Safari job is non-blocking.

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
