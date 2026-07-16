# How-To Guides

Task-oriented recipes for CachouJS **v0.4.x** (current: **0.4.3**). Each guide assumes a basic install (`npm install cachoujs` / `npm run dev`).

| Start here | |
|------------|--|
| New to Cachou? | **[Get Started](../GETTING_STARTED.md)** |
| Concepts | [Developer guide](../GUIDE.md) |
| Signatures | [API reference](../API.md) |
| 0.4 feature recipes | **[Use 0.4 framework APIs](./use-0.4-framework-apis.md)** |
| Docs home | [docs/README.md](../README.md) |

---

## Setup & workflow

| Guide | When to use it |
|-------|----------------|
| [**Install from npm**](./install-from-npm.md) | Published packages: install, scaffold, versions |
| [Scaffold a new app](./scaffold-a-new-app.md) | Vite + file routes + 0.4.x deps |
| [Set up local development](./setup-local-development.md) | Clone the monorepo, demo/examples, compiler |
| [Use the VS Code extension](./use-vscode-extension.md) | Syntax, compile, diagnostics in VS Code / Cursor |
| [Run quality checks](./run-quality-checks.md) | Unit/browser tests, benches, `npm run check` |
| [Build and deploy](./build-and-deploy.md) | Production assets, static host vs Node SSR |
| [Build a CRM with Cachou and PostgreSQL](./build-a-crm-with-cachou-and-postgres.md) | In-repo CRM proving ground |

## Core UI

| Guide | When to use it |
|-------|----------------|
| [Create a component](./create-a-component.md) | Function components, props, mount, cleanup |
| [Manage state](./manage-state.md) | Signals, memos, stores, batch, `untrack` / owners |
| [Render keyed lists](./render-keyed-lists.md) | `For`, `Index`, `mapArray` |
| [Use templates and directives](./use-templates-and-directives.md) | Events, `class:`, `bind:`, `model`, `use:`, `ref` |
| [Use Show / Switch / Match](./use-show-switch-match.md) | Conditional control flow |
| [Use forms](./use-forms.md) | `createField` / `createForm` (including nested paths) |
| [Use accessibility helpers](./use-accessibility.md) | Live regions, focus trap, **Dialog** |
| [Use error boundaries](./use-error-boundaries.md) | Catch reactive/render errors and recover |
| [Use DevTools](./use-devtools.md) | In-page debug panel + hotkey |

## Data & routing

| Guide | When to use it |
|-------|----------------|
| [Use resources (async data)](./use-resources.md) | `createResource`, abort, cache, prefetch |
| [Use routing and lazy pages](./routing-and-lazy-pages.md) | Routes, layouts, guards, history modes, lazy |
| [Use route loaders](./use-route-loaders.md) | `load`, `redirect` / `notFound`, `useRouteData` |
| [Use file-based routing](./use-file-based-routing.md) | `fileRoutes` / `src/routes/` conventions |
| [Use 0.4 framework APIs](./use-0.4-framework-apis.md) | Mutations, actions, params, islands, composition |

## SSR, security, compiler

| Guide | When to use it |
|-------|----------------|
| [Use SSR and hydration](./ssr-and-hydration.md) | `renderToStringAsync`, stream, islands, dehydrate |
| [Configure security policy](./configure-security-policy.md) | URL/style policy, `trustedHTML`, production defaults |
| [Work with `.cachou` files](./work-with-cachou-files.md) | SFC syntax, compile, Vite plugin |

## Server-backed demos (monorepo)

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

---

## Suggested learning path

1. [Install from npm](./install-from-npm.md) or [scaffold](./scaffold-a-new-app.md)  
2. [Create a component](./create-a-component.md) + [Manage state](./manage-state.md)  
3. [Templates](./use-templates-and-directives.md) + [Keyed lists](./render-keyed-lists.md)  
4. [Resources](./use-resources.md) + [Routing](./routing-and-lazy-pages.md) + [File routes](./use-file-based-routing.md)  
5. [0.4 APIs](./use-0.4-framework-apis.md) (mutations, params, composition)  
6. [Security](./configure-security-policy.md) + [SSR](./ssr-and-hydration.md) + [Deploy](./build-and-deploy.md)  
7. Optional: [`.cachou` files](./work-with-cachou-files.md), [CRM + PostgreSQL](./build-a-crm-with-cachou-and-postgres.md)

---

## Related long-form docs

- [Getting started](../GETTING_STARTED.md)
- [Install from npm](../INSTALL.md)
- [Developer guide](../GUIDE.md)
- [API reference](../API.md)
- [Templates reference](../TEMPLATES.md)
- [Compiler reference](../COMPILER.md)
- [Architecture](../ARCHITECTURE.md)
- [Security](../SECURITY.md)
- [Deploy](../DEPLOY.md)
- [Environment variables](../ENVIRONMENT.md)
- [Roadmap](../ROADMAP.md) · [Known limitations](../KNOWN_LIMITATIONS.md)
- [Publishing (maintainers)](../PUBLISHING.md)
- [Examples](../../examples/README.md)
