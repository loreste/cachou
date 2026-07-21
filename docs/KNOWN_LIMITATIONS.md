# Known Limitations

Honest gaps relative to mature ecosystems. See also [Architecture](./ARCHITECTURE.md), the [Developer guide](./GUIDE.md), and the [Roadmap](./ROADMAP.md).

**Current line:** 1.0.x (patch-first; current **1.0.8**). **Stable** core is frozen; **experimental** kits may still change. See [ONE_POINT_OH.md](./ONE_POINT_OH.md).

## Maturity

- Stable core is API-stable and may be evaluated in controlled settings; the semver freeze is an API compatibility commitment, not proof of production readiness.
- Production confidence is still limited by the young 1.0.x release line, limited independent review, lack of demonstrated long-running adoption, and incomplete cross-browser/device coverage.
- Ecosystem (UI kits, community examples, Stack Overflow depth) is still small compared with React/Vue/Svelte.
- Prefer pinning `cachoujs@^1.0.8` in production apps and reading the [changelog](../CHANGELOG.md).
- TypeScript: core and most subpaths ship `.d.ts`. Runtime remains JS; `.cachou` SFCs are not type-checked by the compiler.

## Security boundaries

- `sanitizeHTML` is a defense-in-depth helper, not a complete HTML parser or a guarantee that arbitrary rich text is safe. For high-risk user content, use a well-reviewed sanitizer such as DOMPurify and keep a restrictive CSP.
- `trustedHTML` is an explicit escape hatch. It does not make its input safe and should only wrap content the application has already validated or sanitized.
- URL and inline-style policies are runtime guards. They do not replace response headers, CSP deployment, backend validation, authentication, authorization, CSRF protection, or secure cookie configuration.
- The experimental auth helpers manage client state and token transport; they are not an identity provider, session service, or authorization layer. The default local-storage mode is not appropriate for every threat model.
- The repository demo HTTP/WS server and database/filesystem helpers are proving grounds. Their gates and allowlists should not be treated as production authorization or tenancy controls.

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
- Browser tests default to Playwright Chromium; Safari automation is optional and flaky on CI. A local or release claim should identify which browser suite actually ran.

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
