# CachouJS

**v0.4.3** · experimental (0.x)

[npm](https://www.npmjs.com/package/cachoujs) · [GitHub](https://github.com/loreste/cachou) · **[Get Started](./docs/GETTING_STARTED.md)**

CachouJS is a fine-grained reactive JavaScript framework. Signals update the DOM directly — no virtual DOM, no diffing. It ships with a `.cachou` single-file component compiler, built-in styling and transitions, a router, SSR, and a plugin system. The goal is a framework that's genuinely fast without making you fight it.

## Install

```bash
npm install cachoujs

# Or scaffold a new project
npx @cachoujs/create my-app
cd my-app && npm install && npm run dev
```

Requires Node.js 20+.

| Package | Install | npm |
|---------|---------|-----|
| Runtime + Vite plugin | `npm install cachoujs` | [cachoujs](https://www.npmjs.com/package/cachoujs) |
| App scaffold | `npx @cachoujs/create my-app` | [@cachoujs/create](https://www.npmjs.com/package/@cachoujs/create) |
| `.cachou` compiler (optional) | `npm install -D @cachoujs/compiler` | [@cachoujs/compiler](https://www.npmjs.com/package/@cachoujs/compiler) |

## Quick look

### Counter

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

### Fetch data

```js
import { createResource, html, mount } from "cachoujs";

function App() {
  const [todo, { loading, error }] = createResource(async ({ signal }) => {
    const res = await fetch("/api/todo/1", { signal });
    return res.json();
  });
  return html`
    <div>
      ${() => loading() ? "Loading..." : ""}
      ${() => error() ? error().message : ""}
      ${() => todo() ? html`<p>${todo().title}</p>` : ""}
    </div>
  `;
}

mount(App, document.getElementById("app"));
```

### App with plugins

```js
import { launch, html, signal } from "cachoujs";

function App() {
  const [count, setCount] = signal(0);
  return html`
    <button onclick=${() => setCount(c => c + 1)}>
      ${() => count()}
    </button>
  `;
}

const app = launch(App);
app.plug(analyticsPlugin);
app.mount("#app");
```

More examples in [docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md#code-examples).

## What's in the box

### Core

- **Reactivity** — `signal`, `effect`, `memo`, `store`, `batch`, `createRoot`, ownership and cleanup
- **Rendering** — Tagged template `html` with events, refs, class/style bindings, two-way bind
- **Lists** — Keyed `mapArray` with stable moves and in-place updates
- **Resources** — `createResource` with abort, stale suppression, dedup, timeouts, revalidation
- **Router** — `Route`, `Layout` + `Outlet`, `Link`, `guard()`, lazy routes, file-based routing
- **Control flow** — `Show`, `Switch`, `Match`, `For`, `Index`, `KeepAlive`
- **SSR** — `renderToStringAsync`, streaming, per-request isolation, dehydration/hydration
- **Forms** — `createField`, `createForm` with validation, dirty/touched state
- **Error handling** — `ErrorBoundary`, `Suspense`, `onError`

### Styling & transitions

Built-in. No external CSS libraries needed.

- **`css`** — Tagged template for scoped styles with reactive signal bindings
- **`theme(tokens)`** — Design token system with CSS custom properties
- **`cx()`** — Conditional class joiner
- **`bind(expr)`** — Reactive CSS bindings in `.cachou` style blocks
- **`fade`, `slide`, `fly`, `scale`** — Built-in transitions using Web Animations API
- **`swap()`** — FLIP transitions between elements
- **`defineTransition()`** — Build your own transitions
- **`globalCSS()`** — Inject global styles (deduped)

### Plugin system

- **`launch(App)`** — Bootstrap your app
- **`app.plug(plugin)`** — Install plugins
- **`app.provide()` / `app.component()` / `app.directive()`** — Registration
- **`getApp()`** — Access app instance from anywhere in the tree

### Content collections

For blogs, docs, marketing pages — structured content with schema validation.

- **`defineCollection()`** — Define collections with schemas
- **`z.string()`, `z.number()`, `z.object()`, etc.** — Built-in schema validation
- **`loadContent()`** — Load markdown/JSON from the filesystem
- **`parseFrontmatter()`** — Parse `---` frontmatter blocks

### Image optimization

- **`Image`** — Lazy loading, blur/color placeholders, responsive srcset, CLS prevention
- **`Picture`** — Art direction with multiple sources

### Compiler & tooling

- `.cachou` single-file components with scoped CSS
- **Static hoisting** — Pure HTML fragments skip reactivity entirely
- **`bind()`** in style blocks — Compiled to reactive CSS custom properties
- VLQ-encoded source maps for debugger navigation
- Vite plugin: `cachoujs/vite`
- VS Code extension with syntax highlighting, snippets, compile-on-save, diagnostics

## `.cachou` component

```html
<script>
  const [color, setColor] = signal('#3b82f6');
</script>

<style scoped>
  .card {
    padding: 16px;
    border-radius: 8px;
    background: bind(color);
  }
</style>

<div class="card">
  <h3>{props.title}</h3>
  <p>{props.children}</p>
</div>
```

The compiler turns this into plain JS with scoped CSS. The `bind()` syntax creates a reactive CSS custom property that updates when the signal changes.

## Routing

```js
import { Router, Route, Layout, Outlet, Link, guard } from "cachoujs";

// Protect routes
guard(async (to, from, next) => {
  if (to.startsWith("/admin") && !isLoggedIn()) {
    next("/login");
  } else {
    next();
  }
});

function App() {
  return Router({
    children: [
      Layout({
        path: "/app",
        component: Shell,
        children: [
          Route({ path: "/app", component: Dashboard }),
          Route({ path: "/app/settings", component: Settings }),
          Route({ path: "/app/users/:id", component: UserProfile })
        ]
      })
    ]
  });
}
```

## Package exports

```
cachoujs             → full runtime
cachoujs/styles      → css, theme, cx, globalCSS, keyframes, cssVar
cachoujs/transitions → fade, slide, fly, scale, swap, transition, defineTransition
cachoujs/plugin      → launch, getApp
cachoujs/content     → defineCollection, getCollection, getEntry, z, loadContent
cachoujs/image       → Image, Picture
cachoujs/html        → html, htmlStatic, mount, unmount, render, hydrate
cachoujs/reactivity  → signal, effect, memo, store, batch, createRoot, ...
cachoujs/router      → Router, Route, Link, guard, navigate, ...
cachoujs/forms       → createField, createForm
cachoujs/a11y        → Dialog, trapFocus, createLiveRegion
cachoujs/vite        → Vite plugin
```

## Documentation

| Doc | What's in it |
|-----|-------------|
| [Get Started](./docs/GETTING_STARTED.md) | Scaffold, first app, core concepts |
| [Developer Guide](./docs/GUIDE.md) | Reactivity, rendering, SSR, styling, plugins |
| [API Reference](./docs/API.md) | Every public export |
| [Styling](./docs/STYLING.md) | Built-in CSS system, themes, reactive bindings |
| [Transitions](./docs/TRANSITIONS.md) | Animations and FLIP transitions |
| [Plugins](./docs/PLUGINS.md) | Plugin system and app bootstrap |
| [Content](./docs/CONTENT.md) | Content collections and schema validation |
| [Image](./docs/IMAGE.md) | Image optimization components |
| [Templates](./docs/TEMPLATES.md) | `html` directives and bindings |
| [Compiler](./docs/COMPILER.md) | `.cachou` SFC format and CLI |
| [How-to Guides](./docs/how-to/README.md) | Short task recipes |
| [Security](./docs/SECURITY.md) | Threat model, demo mode, policies |

## Working on the framework

For contributors:

```bash
git clone https://github.com/loreste/cachou.git
cd cachou
npm install
npx playwright install chromium
npm run dev
```

```bash
npm run test:unit        # Node unit tests
npm run test:browser     # Playwright browser tests
npm run bench            # Performance benchmarks
npm run check            # Full CI pipeline
npm run compiler:build   # Build Go compiler binary
```

## Current state

This is **0.4.x** — the API is still evolving. Things work, tests pass, but pin your version and check the changelog before upgrading. The published npm package is the runtime, Vite plugin, and compiler helpers. The demo server and CRM app in this repo are not part of the published package.

## License

MIT
