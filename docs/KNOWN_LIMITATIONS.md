# Known Limitations

Honest gaps relative to mature ecosystems. See also [Architecture](./ARCHITECTURE.md), the [Developer guide](./GUIDE.md), and the [Roadmap](./ROADMAP.md).

**Current line:** 0.4.x (patch-first). Public APIs may still change before 1.0.

## Maturity

- CachouJS is experimental compared with established frameworks.
- Ecosystem (UI kits, community examples, Stack Overflow depth) is small.
- Prefer pinning `cachoujs@0.4.x` in production apps and reading the [changelog](../CHANGELOG.md).

## Compiler

- The `.cachou` compiler supports a practical SFC subset — **not** a full JavaScript/TypeScript parser.
- TypeScript in `<script>` is **pragmatic strip** for simple annotations, not full type-checking.
- Source maps are **section-aware** (script / style / template regions), not fine-grained column maps.
- Prefer `{{` / `}}` for literal braces in templates (compiler escapes them).
- **Default portable path:** pure JS compiler (`@cachoujs/compiler`). Optional native binary via `npm run compiler:build` or multi-arch builds → `bin/dist/`.

## Routing & app framework

- Nested layouts work via `Layout` + `Outlet`.
- Route **`load`**, **`action`**, **`fileRoutes`**, `redirect` / `notFound`, and history modes are available.
- Not a full meta-framework: no built-in **auth**, **i18n**, or cloud **deploy adapters** (document patterns yourself or wait for later releases).

## SSR & deploy

- Per-request isolation, `renderToStringAsync`, **`renderToStream`**, **`Island` / `hydrateIslands`**, and request context (`getRequestEvent`) are shipped.
- Deferred streaming **interleaving** of nested boundaries (beyond shell stream) is still limited.
- Deployment conventions are intentionally minimal — see [DEPLOY.md](./DEPLOY.md). No first-class Workers/Deno/static adapters yet.

## Tooling

- In-page DevTools panel + framework events (`Ctrl+Shift+D` when installed).
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
