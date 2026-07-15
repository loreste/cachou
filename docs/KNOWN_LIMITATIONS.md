# Known Limitations

Honest gaps relative to mature ecosystems. See also [Architecture](./ARCHITECTURE.md) and the [Developer guide](./GUIDE.md).

## Maturity

- CachouJS is experimental compared with React, Vue, Svelte, Solid, Next, Nuxt, or SvelteKit. Public version is **0.x**; APIs may change.
- Ecosystem (UI kits, devtools, Stack Overflow depth) is small.

## Compiler

- The `.cachou` compiler supports a small SFC subset and is **not** a full JavaScript/TypeScript parser.
- Source maps are minimal (file pointer), not fine-grained column maps.
- Prefer `{{` / `}}` for literal braces in templates (compiler escapes them).

## Routing & app framework

- Nested layouts work via `Layout` + `Outlet`.
- Route **`load`** and **`fileRoutes`** cover data loading and file conventions; not a full meta-framework (auth, i18n, adapters).

## Tooling

- In-page DevTools panel + framework events (not a Chrome Web Store extension).
- VS Code extension under `vscode-cachou/` for `.cachou` editing.
- Browser tests default to Playwright Chromium; Safari is optional on macOS.

## Server / demo

- Filesystem access is server-backed and **demo-gated**. Browsers cannot read arbitrary local paths through the runtime alone.
- Demo multi-database adapters beyond SQLite/memory are **experimental** (`CACHOU_DB_EXPERIMENTAL=1`).
- The published package does not include a batteries-included production backend.

## SSR & deploy

- SSR supports per-request isolation; deployment conventions are intentionally minimal ([DEPLOY.md](./DEPLOY.md)).
- No islands/partial hydration API yet.

## Accessibility & HTML

- A11y helpers are primitives. Apps still need semantic markup and product-specific keyboard UX.
- `trustedHTML` bypasses escaping and must only wrap content the application already trusts.

## Compiler install

- **Default portable path:** pure JS compiler (`@cachoujs/compiler` / `packages/compiler`) — no Go required.
- Optional native binary via `npm run compiler:build` or multi-arch `npm run compiler:build:multiarch` → `bin/dist/`.
