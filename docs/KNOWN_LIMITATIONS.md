# Known Limitations

Honest gaps relative to mature ecosystems. See also [Architecture](./ARCHITECTURE.md), the [Developer guide](./GUIDE.md), and the [Roadmap](./ROADMAP.md).

**Current line:** 1.0.x (patch-first; current **1.0.2**). **Stable** core is frozen; **experimental** kits may still change. See [ONE_POINT_OH.md](./ONE_POINT_OH.md).

## Maturity

- Stable core is production-ready with a semver freeze commitment.
- Ecosystem (UI kits, community examples, Stack Overflow depth) is still small compared with React/Vue/Svelte.
- Prefer pinning `cachoujs@^1.0.2` in production apps and reading the [changelog](../CHANGELOG.md).
- TypeScript: core and most subpaths ship `.d.ts`. Runtime remains JS; `.cachou` SFCs are not type-checked by the compiler.

## Compiler

- The `.cachou` compiler supports a practical SFC subset — **not** a full JavaScript/TypeScript parser.
- TypeScript in `<script>` is **pragmatic strip** for simple annotations, not full type-checking.
- Source maps are **section-aware** (script / style / template regions), not fine-grained column maps.
- Prefer `{{` / `}}` for literal braces in templates (compiler escapes them).
- **Default portable path:** pure JS compiler (`@cachoujs/compiler`). Optional native binary via `npm run compiler:build` or multi-arch builds → `bin/dist/`.

## Routing & app framework

- Nested layouts work via `Layout` + `Outlet`.
- Route **`load`**, **`action`**, **`fileRoutes`**, `redirect` / `notFound`, and history modes are available.
- Not a meta-framework: no cloud deploy adapters, hosting, or battery-included app shell.
- **Auth / i18n / UI kit / SEO / upload / …** exist as small primitives under subpath exports. They are not full product systems — wire your own backend, locale files, and design system.

## SSR & deploy

- Per-request isolation, `renderToStringAsync`, **`renderToStream`**, **`Island` / `hydrateIslands`**, request context (`getRequestEvent`), concurrent **`createSSRContext`**, and **`preload`** are shipped.
- Implicit `dehydrate()` / `getSSRHead()` fail closed under ambiguous concurrent renders — pass an explicit context in concurrent servers.
- Streaming SSR (`renderToStream`) emits a fast head shell, then body after resources settle (two-pass). Nested boundary interleaving beyond that shell model is still limited.
- Control-flow helpers (`Show` / `For` / `Switch`) are unwrapped correctly on SSR and as mount roots (1.0.1+).
- Deployment conventions are intentionally minimal — see [DEPLOY.md](./DEPLOY.md). **Node SSR** is the primary supported recipe; **Fetch adapters** (`cachoujs/ssr-adapters`) and **static pre-render** (`cachoujs/static`) are candidate surfaces.

## Bundling

- Prefer **`cachoujs/browser`** (or the Vite plugin default alias) for client bundles.
- The full `cachoujs` entry includes content/media helpers that may pull Node APIs — fine for SSR/Node, not for naive CDN browser builds.

## Tooling

- In-page DevTools panel + framework events (`Ctrl+Shift+D` when installed).
- Structured **logger** and optional W3C **tracing** (off by default); no bundled OTel exporter.
- Optional browser extension under `extensions/browser-devtools/` (not on the Chrome Web Store yet).
- VS Code extension under `vscode-cachou/` for `.cachou` editing (not Marketplace-published yet).
- Browser tests default to Playwright Chromium; Safari automation is optional and flaky on CI.

## Server / demo (this monorepo)

- Filesystem access is server-backed and **demo-gated**. Browsers cannot read arbitrary local paths through the runtime alone.
- Demo multi-database adapters beyond SQLite/memory are **experimental** (`CACHOU_DB_EXPERIMENTAL=1`).
- The published **npm package** is runtime + Vite plugin + compiler helpers — not the CRM or demo server.

## Accessibility & HTML

- A11y helpers (`Dialog`, live regions, focus utilities) are primitives. Apps still need semantic markup and product-specific keyboard UX.
- `trustedHTML` bypasses escaping and must only wrap content the application already trusts.

## What is intentionally out of scope

- Commerce backends (payments, inventory) — build in the app.
- Replacing a real database product with the demo adapters.
