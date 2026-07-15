# How-To Guides

Task-oriented recipes for CachouJS **v0.4.x**. Each guide assumes a basic install (`npm install` / `npm run dev`).

For concepts, read the [Developer guide](../GUIDE.md). For signatures, see the [API reference](../API.md). Documentation home: [docs/README.md](../README.md).

---

## Setup & workflow

| Guide | When to use it |
|-------|----------------|
| [**Install from npm**](./install-from-npm.md) | Published packages: install, scaffold, versions |
| [Set up local development](./setup-local-development.md) | Clone the monorepo, run demo/examples, rebuild the compiler |
| [Use the VS Code extension](./use-vscode-extension.md) | Syntax, compile, diagnostics, snippets in VS Code / Cursor |
| [Scaffold a new app](./scaffold-a-new-app.md) | Start a standalone Vite + Cachou project |
| [Run quality checks](./run-quality-checks.md) | Unit/browser tests, benches, `npm run check`, pack dry-run |
| [Build and deploy](./build-and-deploy.md) | Production assets, static host vs Node SSR |
| [Build a CRM with Cachou and PostgreSQL](./build-a-crm-with-cachou-and-postgres.md) | Run the in-repo CRM proving ground (Postgres) |

## Frontend UI

| Guide | When to use it |
|-------|----------------|
| [Create a component](./create-a-component.md) | Function components, props, mount, cleanup |
| [Manage state](./manage-state.md) | Signals, memos, stores, batch, roots |
| [Render keyed lists](./render-keyed-lists.md) | `mapArray`, keys, reactive vs immutable rows |
| [Use templates and directives](./use-templates-and-directives.md) | Events, `class:`, `style:`, `bind:`, `ref` |
| [Use routing and lazy pages](./routing-and-lazy-pages.md) | Routes, layouts, `Outlet`, guards, lazy |
| [Use route loaders](./use-route-loaders.md) | `Route.load`, abort, `useRouteData` |
| [Use file-based routing](./use-file-based-routing.md) | `fileRoutes` / `routes/` conventions |
| [Use Show / Switch / Match](./use-show-switch-match.md) | Control-flow helpers |
| [Use DevTools](./use-devtools.md) | In-page debug panel + hotkey |
| [Use resources (async data)](./use-resources.md) | `createResource`, abort, cache, prefetch |
| [Use forms](./use-forms.md) | `createField` / `createForm` validation and submit |
| [Use error boundaries](./use-error-boundaries.md) | Catch reactive/render errors and recover |
| [Use accessibility helpers](./use-accessibility.md) | Live regions, focus trap, restore focus |
| [Use SSR and hydration](./ssr-and-hydration.md) | `renderToStringAsync`, dehydrate, hydrate |
| [Configure security policy](./configure-security-policy.md) | URL/style policy, `trustedHTML`, production defaults |

## Server-backed demos

| Guide | When to use it |
|-------|----------------|
| [Connect to server data](./connect-to-server-data.md) | Real APIs vs demo todos / `dbSignal` |
| [Browse and display files](./browse-and-display-files.md) | Files API helpers and sandbox root |
| [Use the FileBrowser component](./use-file-browser-component.md) | Ready-made browser UI |

## Reliability & diagnostics

| Guide | When to use it |
|-------|----------------|
| [Prevent leaks and races](./prevent-leaks-and-races.md) | Roots, abort, transitions, leak asserts |
| [Enable debug diagnostics](./enable-debug-diagnostics.md) | Debug snapshots, strict mode, framework events |
| [Schedule background work](./schedule-background-work.md) | `scheduleTask`, priorities, transitions |

## Compiler

| Guide | When to use it |
|-------|----------------|
| [Work with `.cachou` files](./work-with-cachou-files.md) | SFC syntax, compile, Vite plugin |

---

## Suggested learning path

1. [Install from npm](./install-from-npm.md) or [setup monorepo](./setup-local-development.md)  
2. [Create a component](./create-a-component.md) + [Manage state](./manage-state.md)  
3. [Templates](./use-templates-and-directives.md) + [Keyed lists](./render-keyed-lists.md)  
4. [Resources](./use-resources.md) + [Routing](./routing-and-lazy-pages.md)  
5. [Security](./configure-security-policy.md) + [Deploy](./build-and-deploy.md)  
6. Optional: [`.cachou` files](./work-with-cachou-files.md), [SSR](./ssr-and-hydration.md), [CRM + PostgreSQL](./build-a-crm-with-cachou-and-postgres.md)

---

## Related long-form docs

- [Install from npm](../INSTALL.md)
- [Publishing (maintainers)](../PUBLISHING.md)
- [Getting started](../GETTING_STARTED.md)
- [Developer guide](../GUIDE.md)
- [Templates reference](../TEMPLATES.md)
- [Compiler reference](../COMPILER.md)
- [Architecture](../ARCHITECTURE.md)
- [Security](../SECURITY.md)
- [Deploy](../DEPLOY.md)
- [Environment variables](../ENVIRONMENT.md)
- [Examples](../../examples/README.md)
