# CachouJS

**v0.3.0** · experimental (0.x) · [npm: cachoujs](https://www.npmjs.com/package/cachoujs)

CachouJS is a small fine-grained reactive JavaScript framework: signals update the DOM directly (no virtual DOM), with an optional `.cachou` SFC compiler, Vite plugin, SSR/hydration, and a lightweight router.

Privileged features in **this monorepo** (demo DB, files API, WebSockets) are **demo-gated** (`CACHOU_DEMO=1`) and are not part of a normal app install.

## Install (npm)

```bash
# New app
npx @cachoujs/create my-app
cd my-app && npm install && npm run dev

# Or add to an existing project
npm install cachoujs
```

| Package | Role |
|---------|------|
| [`cachoujs`](https://www.npmjs.com/package/cachoujs) | Runtime + Vite plugin |
| [`@cachoujs/compiler`](https://www.npmjs.com/package/@cachoujs/compiler) | `.cachou` compiler (optional) |
| [`@cachoujs/create`](https://www.npmjs.com/package/@cachoujs/create) | Project scaffold |

**Full install guide:** [docs/INSTALL.md](./docs/INSTALL.md)

### Minimal example

```js
import { signal, html, mount } from "cachoujs";

function App() {
  const [count, setCount] = signal(0);
  return html`
    <button type="button" onclick=${() => setCount(c => c + 1)}>
      Count: ${() => count()}
    </button>
  `;
}

mount(App, document.getElementById("app"));
```

## Why CachouJS

| | CachouJS | Typical VDOM framework |
|---|---------|------------------------|
| Update model | Fine-grained signals → exact DOM bindings | Rerun / diff trees |
| Component setup | Runs once | Re-executes on state change |
| Hooks | None (no ordering rules) | Hook rules apply |
| Compiler | Small Go `.cachou` SFC compiler | Usually large / framework-specific |
| Scope | Runtime-first; demo server is optional | Often full app platforms |

Closest relatives: **Solid** (reactive model) and **Svelte** (compile + direct DOM). CachouJS is younger and smaller; treat the public API as evolving under 0.x.

## Features

**Runtime**

- `signal`, `effect`, lazy `memo`, `store`, `batch`, `createRoot`, cleanup ownership
- Tagged-template `html` with events, refs, class/style, two-way bind, transitions
- Keyed `mapArray` with stable moves and in-place row updates
- Race-safe `createResource` (abort, stale suppression, dedupe, timeouts)
- Router: `Route` (+ optional `load`), `Layout` + `Outlet`, `Link`, guards, lazy routes
- File-based routes: `fileRoutes` / `routes/` conventions (`[id]`, layouts, groups)
- Control flow: `Show`, `Switch`, `Match`
- SSR: `renderToStringAsync`, per-request isolation, `dehydrate` / `hydrate`
- Forms, a11y helpers, error boundaries, security policy, framework events
- Debug snapshots, leak assertions, in-page **DevTools** (`mountDevtools`)

**Compiler & tooling**

- `.cachou` single-file components with scoped CSS (`:host`, `:global`, nested at-rules)
- Emits `import … from "cachoujs"` (override with `-runtime`)
- Vite plugin: `cachoujs/vite` (watch + recompile)
- Cross-platform compiler build via Go (`npm run compiler:build` / postinstall when Go is present)
- `create-cachou` app scaffold

**This repo also includes**

- Demo app and runnable `/examples/`
- Optional demo server APIs (SQLite, files, WS) behind `CACHOU_DEMO`
- FayDB CRM proving ground (`npm run crm:demo`) — not part of the published package surface

## Requirements

- **Node.js 20+**
- **Go** to build the `.cachou` compiler (optional if you only use the JS runtime)
- **Playwright Chromium** for default browser tests: `npx playwright install chromium`

Static production assets can be served without Node. Use Node only for SSR or demo APIs. **Never set `CACHOU_DEMO=1` on a public host.**

## Quick start (this monorepo)

For contributors working on the framework itself:

```bash
git clone https://github.com/cachoujs/cachou.git
cd cachou
npm install
npx playwright install chromium   # once, for browser tests
npm run dev                       # CACHOU_DEMO enabled automatically in Vite
```

| URL / command | What you get |
|---------------|--------------|
| `/demo` | Main demo |
| `/examples/` | Copy-paste examples |
| `npm run crm:demo` | Full CRM showcase |

```bash
npm run build
NODE_ENV=production CACHOU_DEMO=0 npm start
```

## Vite plugin (apps using npm package)

```js
import { defineConfig } from "vite";
import { cachou } from "cachoujs/vite";

export default defineConfig({
  plugins: [cachou({ dirs: ["src/components"], runtime: "cachoujs" })]
});
```

## Documentation

**Start at the [documentation home](./docs/README.md).**

| Doc | Contents |
|-----|----------|
| [**Install from npm**](./docs/INSTALL.md) | User install, scaffold, imports |
| [Publishing](./docs/PUBLISHING.md) | Maintainer release steps |
| [Documentation home](./docs/README.md) | Full map of all docs |
| [Getting started](./docs/GETTING_STARTED.md) | Monorepo / contributor setup |
| [Developer guide](./docs/GUIDE.md) | Concepts: reactivity → SSR → scheduler |
| [API reference](./docs/API.md) | Every public export |
| [Templates](./docs/TEMPLATES.md) | `html` directives and bindings |
| [Compiler](./docs/COMPILER.md) | `.cachou` SFC format and CLI |
| [Architecture](./docs/ARCHITECTURE.md) | Internals and package layers |
| [How-to guides](./docs/how-to/README.md) | Short task recipes |
| [Security](./docs/SECURITY.md) | Threat model, demo mode, policies |
| [Deploy](./docs/DEPLOY.md) | Static SPA and Node SSR |
| [Environment](./docs/ENVIRONMENT.md) | All environment variables |
| [Known limitations](./docs/KNOWN_LIMITATIONS.md) | Gaps vs mature frameworks |
| [Performance targets](./docs/PERFORMANCE_TARGETS.md) | Benchmark contract |
| [Benchmark results](./docs/BENCHMARK_RESULTS.md) | Competitive notes |
| [Examples](./examples/README.md) | Runnable `/examples/` |
| [VS Code extension](./vscode-cachou/README.md) | `.cachou` language support, compile, diagnostics |
| [Browser DevTools extension](./extensions/browser-devtools/README.md) | Chrome/Edge unpacked extension |
| [Packages](./packages/README.md) | `@cachoujs/compiler`, `@cachoujs/create` |
| [Changelog](./CHANGELOG.md) | Release history |

## Core reactivity

```javascript
import { signal, effect, createRoot, memo, store, batch } from "cachoujs";

const [count, setCount] = signal(0);

effect(() => {
  console.log("Count:", count());
});

const doubled = memo(() => count() * 2); // lazy; recomputes when read

const state = store({ user: { name: "Ada" } });
effect(() => console.log(state.user.name));
state.user.name = "Grace";

batch(() => {
  setCount(1);
  setCount(2);
});

const dispose = createRoot(() => {
  effect(() => console.log(doubled()));
});
dispose();
```

## Rendering and lifecycle

```javascript
import { html, mount, render, unmount } from "cachoujs";

function App() {
  const [n, setN] = signal(0);
  return html`
    <button onclick=${() => setN(v => v + 1)}>
      Count: ${() => n()}
    </button>
  `;
}

const dispose = mount(App, document.getElementById("app"));
dispose();

render(App, root);
unmount(root);
```

`render`, `mount`, and `hydrate` create owned roots and dispose any previous root on the same container.

## Lists

```javascript
import { html, mapArray } from "cachoujs";

const view = html`
  <ul>
    ${mapArray(todos, todo => html`<li>${todo.text}</li>`, todo => todo.id, {
      uniqueKeys: true
    })}
  </ul>
`;
```

Use a key function for stable DOM moves. Prefer `uniqueKeys: true` when every key is unique (skips duplicate-key bookkeeping).

## Resources

```javascript
import { createResource, html } from "cachoujs";

const [todos, { loading, error, refetch }] = createResource(async ({ signal, requestId }) => {
  const res = await fetch(`/api/todos?r=${requestId}`, { signal });
  return res.json();
});

const view = html`
  <section>
    ${() => (loading() ? "Loading…" : "")}
    ${() => (error() ? error().message : "")}
    ${() => JSON.stringify(todos() || [])}
  </section>
`;
```

By default a new refetch aborts the previous request; older responses are ignored even if abort is ignored by the fetcher.

## Routing (including nested layouts)

```javascript
import { html, Router, Route, Layout, Outlet, Link, navigate } from "cachoujs";

function Shell() {
  return html`
    <nav>
      ${Link({ href: "/app", children: "Home" })}
      ${Link({ href: "/app/settings", children: "Settings" })}
    </nav>
    <main>${Outlet()}</main>
  `;
}

function App() {
  return Router({
    children: [
      Layout({
        path: "/app",
        component: Shell,
        children: [
          Route({ path: "/app", component: () => html`<h1>Dashboard</h1>` }),
          Route({ path: "/app/settings", component: () => html`<h1>Settings</h1>` }),
          Route({ path: "/app/users/:id", component: p => html`<h1>User ${p.id}</h1>` })
        ]
      })
    ]
  });
}

navigate("/app/settings", { replace: true });
```

## SSR and hydration

```javascript
import { renderToStringAsync, dehydrate, hydrate, getSSRHead } from "cachoujs";
import App from "./app.js";

const appHtml = await renderToStringAsync(App, { path: "/demo" });
const stateScript = dehydrate(); // sequential after render; per-request isolated
const headHtml = getSSRHead();

// Client
hydrate(App, document.getElementById("app"));
```

Each `renderToStringAsync` uses an isolated SSR context (AsyncLocalStorage on Node when available). Call `dehydrate()` / `getSSRHead()` right after the matching render.

## Security

```javascript
import {
  configureSecurityPolicy,
  applyProductionSecurityDefaults,
  trustedHTML,
  onFrameworkEvent
} from "cachoujs";

applyProductionSecurityDefaults(); // stricter URL protocols, no inline styles

onFrameworkEvent(event => {
  if (event.type === "security-block") {
    console.warn(event.message);
  }
});

// Explicit only — never pass unsanitized user HTML
const markup = trustedHTML(alreadySanitizedHtml);
```

**Demo APIs** (`/api/todos`, `/api/db-query`, `/api/files`) require `CACHOU_DEMO=1`.  
`/api/db-query` only allows simple read-only `SELECT`s on allowlisted tables.  
Files default to `./sandbox` (`CACHOU_FILES_ROOT`), not the full repository.

See [docs/SECURITY.md](./docs/SECURITY.md).

## Filesystem API (demo)

Read-only server endpoints (demo mode only):

- `GET /api/files?path=...`
- `GET /api/files/content?path=...`

```javascript
import { createFileBrowser, createFileContent, FileBrowser, signal, mapArray, html } from "cachoujs";

const [directory, files] = createFileBrowser("");
const [selectedPath, setSelectedPath] = signal("");
const [file] = createFileContent(selectedPath);

// Or the packaged component:
const browser = FileBrowser({ initialPath: "", onSelect: e => console.log(e.path) });
```

- Confined to `CACHOU_FILES_ROOT` (default `./sandbox`)
- Hidden files excluded unless requested
- Size limit via `CACHOU_FILES_MAX_BYTES` (default 1 MB)

## `.cachou` components

```html
<script>
  const value = props.value;
</script>

<style scoped>
  :host { display: block; }
  .card { padding: 12px; }
  :global(.theme) { color: teal; }
</style>

<div class="card">
  <h3>{props.title}</h3>
  <span>{value}</span>
</div>
```

```bash
npm run compile              # demo components
npm run compiler:build       # rebuild native binary when Go is installed
node scripts/run-compiler.mjs -dir src/components -out src/components -runtime cachoujs
```

The compiler fails the process if any file in a directory walk errors. Source comments and a minimal source map URL are emitted for navigation back to the `.cachou` file.

## Demo server & adapters

| Variable | Purpose |
|----------|---------|
| `CACHOU_DEMO` | `1` enables demo APIs; off for production start |
| `CACHOU_DB_TYPE` | `sqlite` (default) or `memory` |
| `CACHOU_DB_EXPERIMENTAL` | `1` to try postgres/mysql/mongodb/firebase adapters |
| `CACHOU_FILES_ROOT` | Files API root (default `./sandbox`) |
| `CACHOU_BACKEND_URL` | Proxy `/api` and `/ws-api` to another backend in Vite |

Supported adapters for demos: **sqlite**, **memory**. Others are experimental stubs and need optional deps — see `server/adapters/README.md`.

```bash
CACHOU_BACKEND_URL=http://localhost:8080 npm run dev
```

## Debug mode

```javascript
import { enableDebug, getDebugSnapshot, assertNoReactiveLeaks, disableDebug } from "cachoujs";

enableDebug({ slowEffectThresholdMs: 8, strict: true });
console.log(getDebugSnapshot());
assertNoReactiveLeaks("after route unmount");
disableDebug();
```

## Quality checks

```bash
npm run test:unit       # Node unit tests (reactivity, guards, files)
npm run test:browser    # Playwright Chromium (default)
CACHOU_TEST_BROWSER=safari npm run test:browser   # macOS Safari fallback

npm run bench           # regression vs baselines
npm run bench:memory    # leak / memory stress
npm run bench:compare   # vs React, Vue, Preact, Solid, Svelte, DOM floor
CACHOU_COMPARE_SAMPLES=30 npm run bench:compare   # publishable local runs

npm run check           # full pipeline used in CI
npm run pack:dry        # inspect publish tarball (~60KB runtime package)
npm run crm:ci          # CRM QA + evidence bundle under faydb-crm/artifacts/ci/
```

CI runs on **Ubuntu + Chromium**. Optional Safari job on macOS for `main` pushes.

## Project layout

```text
cachou/
├── src/                 # Browser runtime (published)
│   ├── reactivity.js
│   ├── html.js
│   ├── router.js
│   ├── ssr-context.js
│   ├── forms.js
│   ├── a11y.js
│   ├── files.js
│   └── index.js
├── plugin/vite.js       # Vite plugin (cachoujs/vite)
├── compiler.go          # .cachou compiler
├── create-cachou/       # App scaffold
├── server/              # Demo APIs + adapters (not the main package surface)
├── sandbox/             # Default files API root
├── demo/                # Demo app
├── examples/            # Runnable examples
├── tests/               # Browser + unit tests
├── benchmarks/          # Perf + competitive suite
├── docs/                # Canonical documentation
├── faydb-crm/           # CRM proving ground (separate app)
├── scripts/             # check, compiler, browser tests
└── package.json         # cachoujs@0.2.0
```

## Package exports

```text
cachoujs            → full runtime
cachoujs/html
cachoujs/reactivity
cachoujs/router
cachoujs/forms
cachoujs/a11y
cachoujs/files
cachoujs/vite       → Vite plugin
```

## Current notes

- Public version is **0.x** — APIs may change; pin carefully and read the changelog.
- The published npm package is the **runtime + compiler source + Vite plugin**, not the CRM or demo server.
- Demo APIs are for local development only.
- Nested layouts exist; file-based routing and data loaders do not (yet).
- Devtools are framework events + debug snapshots, not a browser extension.

## License

See the repository license file if present; otherwise treat as source-available until a license is added.
```
