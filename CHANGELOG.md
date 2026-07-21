# Changelog

## 1.0.9

Follow-up: select binding final pass + reactive form value guidance (CRM demo fixed).

### Fixed / improved

- **Select final apply** — after all template bindings run, re-apply any remembered `<select>` values once more (covers static option lists + ordering edge cases)
- **CRM demo forms** — Security / contact / company / deal / login fields bind with `() => draft().field` instead of one-shot `draft().field` reads (stops full panel remount on every keystroke and role “revert” flashes)
- **CRM user save** — holds draft for the whole request and uses busy guard so controls do not clear mid-flight

### Docs

- How-to forms: wrong vs right reactive `value=` patterns


## 1.0.8

Fix `<select>` value binding when options mount after `value=`.

### Fixed / improved

- **`<select value=${…}>` with dynamic options** — browsers ignore `select.value` until a matching `<option>` exists; Cachou now remembers the desired value and re-applies it after option children mount or change
- **`bind:value` / `model` / `use:model` on `<select>`** — same deferred matching for multi- and single-select
- **`selected=${…}` on `<option>`** — treated as a boolean property binding
- App guidance: keep selection signals outside recreated view functions; avoid optimistic UI that flashes stale roles mid-request

### Docs / tests

- How-to: [use-forms.md](./docs/how-to/use-forms.md) select section
- Browser + unit tests for select/option ordering and re-apply


## 1.0.7

Security maintenance following the 1.0.6 review (demo server + sanitizer + compiler).

### Fixed / improved

- **HTML sanitization** — applies the unsafe-URL policy to `srcset` on both the string and DOM paths
- **WebSocket upgrades** — rejects missing `Origin` by default and requires the request scheme and host to match the origin
- **WebSocket proxy handling** — ignores client-supplied `x-forwarded-proto` unless `CACHOU_TRUST_PROXY=1` explicitly enables a trusted proxy deployment
- **Files API** — keeps path checks under the configured root, omits symlink entries from listings, and uses `O_NOFOLLOW` for the final read where supported
- **Static assets** — rejects existing symlinks that resolve outside `dist/` and uses a no-follow final file descriptor where supported
- **Compiler SSR imports** — generated component CSS loads only in browser contexts, allowing raw Node SSR to import compiled components without a CSS loader

### Docs / tests

- Regression coverage for `srcset`, WebSocket origin policy, and static-asset symlink escapes
- SECURITY / environment notes for `CACHOU_TRUST_PROXY` and stricter WS origin policy


## 1.0.6

Maintenance patch: modern GitHub Actions, SSR nonce fallbacks, `publish:check`.

### Fixed / improved

- **SSR scaffold / examples** — Node recipes catch `createCSPNonce()` failure and fall back to `node:crypto` `randomBytes` (aligned with fail-closed Web Crypto policy)
- **`npm run publish:check`** — alias for `CACHOU_REQUIRE_CI=1 npm run publish:prep`

### Tooling / CI

- GitHub Actions: `checkout` / `setup-node` / `setup-go` / `upload-artifact` **@v6** (clears Node 20 action runtime deprecation warnings)

### Docs

- Version strings for 1.0.6


## 1.0.5

Maintenance patch: demo query DoS bound, CI reliability, release prep gates.

### Fixed / improved

- **Demo SQL `LIMIT`** — `sanitizeReadOnlySelect` rejects limits above **1000** (blocks huge-limit resource exhaustion on `/api/db-query`)
- **Demo server CSP nonce** — uses try/catch around `createCSPNonce()` with Node `crypto.randomBytes` fallback (matches fail-closed Web Crypto policy)

### Tooling / CI (repo)

- Linux-first CI (optional Safari after Linux); concurrency cancel-in-progress
- Wider GHA benchmark noise budget (3× / +40ms)
- `publish:prep` can require green **Verify (Linux / Chromium)** for `HEAD` (`CACHOU_REQUIRE_CI=1`)

### Docs

- Publishing notes: tag or main Linux job validates a release SHA
- Version strings / roadmap for 1.0.5


## 1.0.4

Honest maturity wording plus small security hardening for sanitizer and CSP nonces.

### Fixed / improved

- **`sanitizeHTML` slash-delimited attrs** — dangerous tags and `on*` / URL / style attributes matched after `/` as well as whitespace (`<script/onload=…>`, `<img/onerror=…>`)
- **`createCSPNonce`** — fails closed when Web Crypto is unavailable (no `Math.random` fallback)

### Docs

- Clearer API-stability vs production-maturity language (README, STABILITY, KNOWN_LIMITATIONS, SECURITY scope/non-goals)
- Benchmarks framed as project-run regression measurements, not universal rankings
- Publish checklist notes release-specific Linux/Chromium CI evidence
- Version strings updated across getting-started / API / how-to docs


## 1.0.3

Follow-up hardening after adversarial re-check of 1.0.2 residual findings.

### Fixed / improved

- **`sanitizeHTML` whitespace-in-scheme XSS** — Chromium treats `java\tscript:` / `java\nscript:` as `javascript:`; the string sanitizer now matches full quoted URL attribute values and strips control/whitespace-split schemes (confirmed non-executable via Playwright)
- **Nested `createForm().reset(nextValues)`** — walks dotted paths (`user.name`) so `reset({ user: { name: "Bob" } })` applies; omitted paths keep each field’s initial value
- **URL attribute emit** — control characters (NUL/TAB/LF/…) are stripped from allowed `href`/`src`/`srcset` values after the safety check
- **`createField.validate`** — only non-empty strings count as errors; stale async runs report current validity instead of a misleading `false`

### Docs / tests

- SECURITY residual notes for scheme-whitespace and nested form reset
- Unit tests for scheme-whitespace payloads, nested reset, URL control-char emit, validate footguns


## 1.0.2

Security patch: close SSR attribute, demo SQL, and `sanitizeHTML` gaps found in adversarial review.

### Fixed / improved

- **SSR quoted attributes** — `href="${url}"` / `style="${css}"` now apply the same URL and style security policy as unquoted bindings and the client DOM path (previously only HTML-escaped, so `javascript:` could survive SSR)
- **Demo SQL allowlist** — `sanitizeReadOnlySelect` no longer accepts `UNION` / expression smuggling via loose `ORDER BY` or column lists; only `SELECT cols FROM table [ORDER BY col [ASC|DESC], …] [LIMIT n]`
- **`sanitizeHTML`** — decodes common HTML entities before stripping; iteratively removes nested dangerous tags; drops `style` / `srcdoc` on both string and DOM paths
- **Demo todos PUT** — validates integer `id` and boolean `completed` before update

### Docs / tests

- SECURITY residual risk table notes SSR attribute + SQL tightenings
- Adversarial unit tests for quoted SSR attrs, SQL UNION/ORDER BY, and sanitizer entity/nested-tag cases


## 1.0.1

First patch on the 1.0 line: quieter deprecations and packaging hygiene.

### Fixed / improved

- **Deprecation warnings** — `addMiddleware`, `useApp`, and `createApp` warn **once** per process (not on every call)
- Deprecation comments clarify removal is a **future major**, not 1.0.0

### Docs / packaging

- npm `homepage`, `bugs`, and expanded keywords on `cachoujs`
- Roadmap **1.x maintenance** section; extension README version strings
- Unit tests for once-only deprecation warnings


## 1.0.0

**API freeze for the stable core.** Experimental and candidate surfaces keep their prior churn rules.

### Commitment

- **Stable** exports will not break without a **major** (2.0+)
- **Candidate** may refine in minors; **experimental** may refine in patches — pin tightly
- Deprecated aliases (`addMiddleware`, `useApp`, `createApp`) remain in **1.x** with warnings
- Full write-up: [docs/ONE_POINT_OH.md](./docs/ONE_POINT_OH.md)

### Added

- **`npm run freeze:check`** — verifies freeze docs, stability labels, package exports, scaffold templates
- **publish:prep** runs `freeze:check` automatically on 1.x releases

### Docs

- ONE_POINT_OH.md, STABILITY/DEPRECATIONS updated for 1.0 policy
- README / roadmap: production 1.0 line; 0.6 ecosystem theme complete

### Upgrade from 0.6.x

```bash
npm install cachoujs@^1.0.0
```

No required code changes for typical SPA/SSR apps. Prefer `cachoujs/browser` on the client and `guard()` / `launch()` / `getApp()` over deprecated aliases.


## 0.6.5

Ecosystem patch: 1.0 freeze criteria closed out, CI extension artifacts, security residual tests, how-to hygiene.

### Added

- **CI artifacts** — VS Code VSIX + browser DevTools zip uploaded from Linux verify job
- **Security residual tests** — extra `sanitizeHTML` cases; dehydrate nonce on `renderApplication`; CSP no `unsafe-inline` scripts
- **How-to** — [use-framework-apis.md](./docs/how-to/use-framework-apis.md) (replaces 0.4-named guide; stub remains)

### Docs

- SECURITY residual risk table; 1.0 checklist marks `npm run check` complete
- ROADMAP: 0.6 theme largely complete; bake time before 1.0


## 0.6.4

Ecosystem patch: 1.0 readiness — consumer surface tests, multi-template scaffold, deprecations list.

### Added

- **`@cachoujs/create` templates** — `--template spa` (default), `static` (hash + prerender), `ssr` (Node `server.mjs`)
- Scaffold defaults to **`cachoujs/browser`** for client entries
- **Consumer surface tests** — required package exports resolve; browser/main/SSR/static/vite smoke
- **[DEPRECATIONS.md](./docs/DEPRECATIONS.md)** — `addMiddleware` → `guard`, `useApp` → `getApp`, etc.
- 1.0 freeze checklist progress in ROADMAP / DEPRECATIONS

### Docs

- Create README + scaffold how-to cover templates
- STABILITY notes candidate deploy surfaces


## 0.6.3

Ecosystem patch: content build pipeline, responsive image URL helpers, experimental kit types polish.

### Added

- **Content build** — `exportContentManifest`, `writeContentManifest`, `routesFromCollection`, `buildContent` (`cachoujs/content`)
- **Image helpers** — `buildSrcSet`, `buildSizes`, `responsiveImageProps`, exported `resolveAspectRatio` (`cachoujs/image`)
- **Example** — `examples/content-site/` (markdown → manifest + static HTML)
- **How-to** — [build-content-and-images](./docs/how-to/build-content-and-images.md)

### Types

- Richer `content.d.ts` / `image.d.ts` (props, `z.date` / `z.enum`, build APIs)
- Main `index.d.ts` re-exports for content build + image helpers


## 0.6.2

Ecosystem patch: static pre-render helpers, Vite plugin types, extension packaging in CI.

### Added

- **`cachoujs/static`** — `prerenderRoutes`, `writePrerendered`, `prerenderToDir`, `routeToFilePath` for build-time HTML
- **Example** — `examples/static-prerender/` · `npm run ssr:static`
- **How-to** — [deploy-static-prerender](./docs/how-to/deploy-static-prerender.md)
- **`cachoujs/vite` types** — `plugin/vite.d.ts`
- **CI** — package VS Code VSIX + browser DevTools zip on Linux verify job

### Docs

- DEPLOY Option 5 (static pre-render); examples index updated


## 0.6.1

Ecosystem patch: residual types, Fetch SSR adapters (Workers/Deno/Bun), DevTools packaging.

### Added

- **`cachoujs/ssr-adapters`** — `createFetchHandler` / `handleFetchRequest` / `toReadableStream` for Fetch API runtimes
- **Example** — `examples/fetch-ssr/` + `npm run ssr:fetch` local smoke bridge
- **How-tos** — [deploy-fetch-ssr](./docs/how-to/deploy-fetch-ssr.md), [use-browser-devtools](./docs/how-to/use-browser-devtools.md)
- **Types** — `cachoujs/files`, `cachoujs/devtools` (and package `exports` types)
- **`npm run ext:devtools`** — zip Chromium extension for load-unpacked distribution

### Fixed

- Browser DevTools manifest removed stale `panel-inject.js` web-accessible resource; version **0.6.1**


## 0.6.0

Starts the **0.6 ecosystem & ergonomics** line: stronger public TypeScript surface for core and subpath imports.

### Added

- **Core type aliases** — `Accessor`, `MaybeAccessor`, `CachouChild`, `Component`, `MiddlewareHandler` / `MiddlewareNext`
- **Generic control flow** — `Show` / `For` / `Index` / `Match` infer item and branch types
- **Subpath `.d.ts`** — `forms`, `flow`, `router`, `reactivity`, `html`, `a11y`, `file-routes`, `plugin`, `content`, `image`
- **Package `exports` types** — every subpath that ships a declaration file now exposes a `types` condition (auth, ui, styles, …)
- **How-to:** [use-typescript.md](./docs/how-to/use-typescript.md)
- VS Code extension version aligned to **0.6.0**; Marketplace publish path documented

### Fixed

- **`KeepAlive` types** — match runtime props (`max`, `include` / `exclude`, activate hooks)
- **Styles types on main entry** — `cssVar` / `theme` / `globalCSS` / `keyframes` align with `cachoujs/styles`
- **`guard` / `addMiddleware`** — shared `MiddlewareHandler` signature

### Docs

- Examples index promotes SPA + Node SSR as primary recipes
- Roadmap: 0.6 theme open; types deliverable marked shipped


## 0.5.1

Completes the **0.5 production library** deliverables: progressive streaming, island hydration, compiler diagnostic codes, experimental boundaries, SPA static export notes, and OTel sample docs.

### Added

- **Progressive `renderToStream`** (default) — first-paint shell with loading UI, then final body/head swap + dehydrate (`progressive: false` for classic two-pass document)
- **`Island({ fallback })`** — optional SSR/static placeholder distinct from interactive children
- **`hydrateIslands(root, map, { onError, rootMargin })`** — error isolation + idle timeout / visible rootMargin
- **Compiler codes `CACHOU001`–`CACHOU013`** — catalog in COMPILER.md; duplicate script/style and empty template diagnostics
- **Docs:** [EXPERIMENTAL.md](./docs/EXPERIMENTAL.md), [stream-ssr-and-islands](./docs/how-to/stream-ssr-and-islands.md), [deploy-static-spa](./docs/how-to/deploy-static-spa.md), [bridge-opentelemetry](./docs/how-to/bridge-opentelemetry.md)

### Docs

- README / STABILITY experimental callouts for app kits
- DEPLOY static SPA + hash history linked from how-tos


## 0.5.0

Minor release: **production library line** — API stability labels and a supported Node SSR deploy path.

### Added

- **Stability labels** — `getExportStability`, `listExportsByStability`, `STABLE_EXPORTS` / `CANDIDATE_EXPORTS` / `EXPERIMENTAL_EXPORTS` (`src/stability.js`); policy in [docs/STABILITY.md](./docs/STABILITY.md)
- **`renderApplication(Component, options)`** — concurrent-safe SSR helper returning `{ html, head, state, context }`
- **`htmlDocument(parts)`** — minimal HTML document assembler
- **Supported Node SSR recipe** — `examples/node-ssr/` + how-to [deploy-node-ssr.md](./docs/how-to/deploy-node-ssr.md); `npm run ssr:node`
- API reference stability section; Deploy docs promote the Node recipe over the monorepo demo server

### Docs

- Clear **stable / candidate / experimental** boundaries so core trust is not diluted by UI/auth/i18n kits
- DEPLOY.md restructured: SPA, Node SSR (supported), monorepo demo (not product)


## 0.4.13

Patch release: finish 0.4-line hygiene — benchmarks refreshed, publish-prep hardened, Safari CI policy explicit.

### Docs

- **Benchmark results** — competitive Chromium (10 samples), SSR suite, and memory suite refreshed (2026-07-17)
- **Performance targets** — SSR reference medians table for the same machine

### Tooling / hygiene

- **`publish:prep`** — requires matching package versions, a CHANGELOG section for the release version, and a lightweight secret-pattern scan before unit/compiler/pack
- **CI** — document Chromium (Linux) as the required gate; Safari remains optional/`continue-on-error`
- Roadmap 0.4 near-term items marked complete for hygiene exit criteria


## 0.4.12

Patch release: fix SSR/control-flow view unwrapping and reactive mount roots.

### Fixed

- **SSR** — `renderToString` / `renderToStringAsync` / `renderToStream` no longer stringify function source for `Show` / `For` / `Switch` (and nested view thunks); views are unwrapped and serialized to HTML
- **Stream dehydrate** — always passes the stream's SSR `context` explicitly (safe without AsyncLocalStorage)
- **`mount` / `render`** — components that return a reactive view function (`Show`/`For`/…) stay live via an effect instead of failing `appendChild(function)`
- **`hydrate`** — unwraps view functions / arrays / `SafeHTML` into a client DOM tree before structural walk
- **`createI18n`** — accepts `locale` as an alias for `defaultLocale`; throws a clear error when neither is set

### Docs / tests

- Unit tests for Show/For/Switch SSR, stream body content, i18n locale alias
- KNOWN_LIMITATIONS notes SSR control-flow + streaming model


## 0.4.11

Patch release: close remaining security gaps with helpers, auth hardening, and SSR starter defaults.

### Added

- **`sanitizeHTML(input)`** — defense-in-depth untrusted HTML cleaner (strips script/iframe/svg/on*/javascript:)
- **`createCSPNonce()` / `buildContentSecurityPolicy()` / `buildSecurityHeaders()` / `applySecurityHeaders()`** — reusable CSP + security header helpers for Node SSR
- **`sanitizeAuthToken()`** — reject control characters, newlines, HTML-looking or oversized tokens
- **`createAuth({ persist: "session" | "local" | "none", credentials })`** — prefer sessionStorage; optional fetch credentials mode

### Fixed / improved

- **SSR starter** — production security defaults, CSP nonces on state + styles, no stack leakage on 500
- **Demo production server** — uses shared header helpers + `applyProductionSecurityDefaults()`
- Docs: configure-security-policy how-to covers sanitizeHTML, CSP helpers, auth storage

### Docs / tests

- SECURITY.md checklist expanded
- Unit tests for sanitizer, CSP helpers, auth token hardening


## 0.4.10

Patch release: security hardening for demo server, static assets, WebSocket, and runtime sinks.

### Fixed / improved

- **Static assets** — `resolveSafeAssetPath()` confines file serving to `dist/` (blocks `../` traversal)
- **WebSocket** — `/ws-api` requires demo mode; Origin must match Host; `db-sync` table allowlist + row cap
- **SSR server** — per-request `createSSRContext()`; generic 500 responses (no stack leakage)
- **CSP** — per-request nonce for dehydrate state script; `object-src 'none'`, `frame-ancestors 'none'`, COOP, Referrer-Policy
- **Rate limit** — bounded map size to resist memory growth
- **Todos API** — validates text type/length
- **`dehydrate(context, { nonce })`** — optional CSP nonce attribute (rejects unsafe nonce chars)
- **Style policy** — also blocks `-moz-binding`, `behavior:`, `@import`, `url(data:…)`
- **Event handlers** — ignore non-function handlers; block string `on*` attribute bindings

### Docs / tests

- SECURITY.md updated for server/WS/CSP nonce guidance
- Unit tests: static path traversal, WS origin, dehydrate nonce, demo mode default


## 0.4.9

Patch release: multi-arch compiler packaging policy + how-tos for browser entry, concurrent SSR, logger/tracing.

### Added

- **`npm run compiler:package-binaries`** — packages optional multi-arch launchers as versioned tarballs + `checksums.txt` under `tmp/compiler-binaries/` for GitHub release assets (not npm)
- **How-tos** — [use browser entry](./docs/how-to/use-browser-entry.md), [use logger and tracing](./docs/how-to/use-logger-and-tracing.md); concurrent SSR recipe expanded in SSR how-to
- **Package surface tests** — asserts CRM/demo/`bin/dist` stay out of the published npm `files` list

### Fixed / improved

- **Compiler launcher** — pure JS is preferred by default; set `CACHOU_COMPILER_NATIVE=1` to opt into native/`bin/dist` launchers
- **Multi-arch build** — writes `bin/dist/manifest.json` + `README.md` documenting that natives only wrap the JS compiler
- **SSR starter** — uses per-request `createSSRContext()` with explicit `dehydrate` / `getSSRHead`
- Scaffold pins **`^0.4.9`**

### Docs

- COMPILER.md multi-arch packaging policy
- How-to index updated (browser entry, logger/tracing, concurrent SSR)

## 0.4.8

Patch release: compiler diagnostics with absolute locations and actionable hints.

### Fixed / improved

- **Compiler diagnostics** — errors now use **absolute file line:column** after `<script>` / `<style>` extraction (no more “line 1” false positives for later sections)
- **Actionable hints** — common SFC mistakes print a `hint:` line (unclosed tags/expressions, empty `{ }`, CSS `bind()`, missing `</script>` / `</style>`, unclosed CSS blocks/comments)
- **`CompilerDiagnostic`** — structured error class exported from `@cachoujs/compiler` with `line`, `col`, `hint`, and source snapshot
- **Parity** — JS ↔ Go entrypoint still share the canonical JS compiler; diagnostic regression suite expanded (13 cases including absolute-line checks)

### Docs / tests

- COMPILER.md diagnostics section
- Unit tests for absolute locations and empty-expression hints
- Scaffold pins stay aligned with this release (`^0.4.8`)

## 0.4.7

Patch release: mutation/resource abort edges and remaining UI kit dispose hardening.

### Fixed / improved

- **`createMutation`** — real `AbortSignal` per call; concurrent `mutate` aborts the previous request; `reset()` aborts in-flight work; new `dispose()` freezes further mutates; external `mutate(input, { signal })`; optimistic rollback on abort without treating abort as a mutation error
- **`createResource`** — dispose clears stuck `loading`; late responses after dispose still do not commit
- **`prefetchResource`** — optional `options.signal` aborts the prefetch (including already-aborted signals)
- **UI** — toast exit timers cleared on `destroy()`; Drawer cleanup nulls trap/scroll state; InfiniteScroll aborts in-flight `load` on dispose/reset and passes `{ signal }` as the second load arg; Accordion cancels rAF / `transitionend` on effect cleanup

### Docs / tests

- API/GUIDE/how-tos for mutation abort + dispose and prefetch `signal`
- Adversarial unit tests for mutation races, resource dispose/prefetch abort, and UI dispose surfaces
- Unit suite expanded for abort/dispose edges

## 0.4.6

Patch release: correctness fixes for auth guards, middleware, KeepAlive, and UI disposal.

### Fixed

- **`createAuth.requireAuth` / `requireRole`** — now use the real `guard(to, from, next)` API; unauthenticated users redirect instead of being allowed through; redirect targets do not loop
- **Middleware chain** — fail closed when `next()` is never called (no longer open-by-default)
- **`KeepAlive`** — unmount no longer throws (`lruOrder` ReferenceError); active and cached roots dispose correctly
- **UI** — Popover/Menu clear delayed click-listener timers on cleanup; `createToast` is SSR-safe and exposes `destroy()`; `InfiniteScroll` ignores post-dispose loads

### Docs / tests

- Documented concurrent SSR contract (`createSSRContext` + explicit dehydrate/head)
- Adversarial unit tests for auth guards, middleware fail-closed, KeepAlive unmount, browser static import graph
- Unit suite: **523** tests

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
