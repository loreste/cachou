# Developer Guide

Complete conceptual guide to CachouJS. For exhaustive signatures, see [API reference](./API.md). For template syntax, see [Templates](./TEMPLATES.md).

---

## Table of contents

1. [Philosophy](#1-philosophy)
2. [Reactivity](#2-reactivity)
3. [Ownership and cleanup](#3-ownership-and-cleanup)
4. [Rendering and lifecycle](#4-rendering-and-lifecycle)
5. [Lists](#5-lists)
6. [Resources and async data](#6-resources-and-async-data)
7. [Context, suspense, portals, errors](#7-context-suspense-portals-errors)
8. [Routing](#8-routing)
9. [SSR and hydration](#9-ssr-and-hydration)
10. [Forms](#10-forms)
11. [Accessibility](#11-accessibility)
12. [Security](#12-security)
13. [Scheduler and transitions](#13-scheduler-and-transitions)
14. [Head management](#14-head-management)
15. [Debug and observability](#15-debug-and-observability)
16. [Filesystem helpers](#16-filesystem-helpers)
17. [Demo server features](#17-demo-server-features)
18. [Testing strategy](#18-testing-strategy)
19. [Performance practices](#19-performance-practices)
20. [Styling and themes](#20-styling-and-themes)
21. [Transitions and animations](#21-transitions-and-animations)
22. [Plugin system](#22-plugin-system)
23. [Content collections](#23-content-collections)
24. [Image optimization](#24-image-optimization)
25. [Router middleware](#25-router-middleware)
26. [KeepAlive](#26-keepalive)

---

## 1. Philosophy

Traditional VDOM frameworks rebuild a virtual tree and diff it when state changes. CachouJS takes a **fine-grained** approach:

1. Component setup functions run **once**.
2. Reactive expressions register **dependencies** when they read signals.
3. When a signal changes, **only subscribed effects/bindings** re-run.
4. Updates write directly to text nodes, attributes, or list slots.

CachouJS takes this fine-grained approach and additionally offers an optional `.cachou` SFC compiler (pure JS by default; native binary optional) and optional demo server adapters in this repository. The **0.4** line adds owner/`untrack`, `For`/`Index`, route actions, streaming SSR/islands, mutations, and more — see [Get Started](./GETTING_STARTED.md) and [0.4 APIs](./how-to/use-0.4-framework-apis.md).

**Design priorities** (see also [Performance targets](./PERFORMANCE_TARGETS.md)):

1. Correctness  
2. Memory safety and cleanup  
3. Input/update latency  
4. Initial render  
5. Bundle size  
6. API convenience  

---

## 2. Reactivity

### `signal`

```javascript
import { signal } from "cachoujs";

const [count, setCount] = signal(0);
const [user, setUser] = signal({ name: "Ada" }, {
  equals: (a, b) => a.name === b.name, // custom equality
  name: "user" // debug label
});
```

- `get()` subscribes the active effect (if any) and returns the value.
- `set(value)` or `set(prev => next)` notifies subscribers when not equal.
- Default equality is `===`.

### `effect`

```javascript
import { effect } from "cachoujs";

const stop = effect(() => {
  console.log(count());
});
stop(); // dispose this effect
```

Effects re-run when any signal read during the last run changes. They should be created under a root (or another owned computation) so disposal is automatic.

### `memo`

```javascript
import { memo } from "cachoujs";

const doubled = memo(() => count() * 2);
doubled(); // computes on first read, caches until deps change
```

Memos are **lazy**: they do not compute until read.

### `store`

```javascript
import { store, effect } from "cachoujs";

const state = store({ user: { name: "Ada" }, items: [] });
effect(() => console.log(state.user.name));
state.user.name = "Grace"; // reactive
```

Stores are reactive object proxies for nested mutation style. Prefer signals when a single value is enough.

### `batch`

```javascript
import { batch } from "cachoujs";

batch(() => {
  setA(1);
  setB(2);
}); // dependent effects flush once after the batch
```

---

## 3. Ownership and cleanup

### `createRoot`

```javascript
import { createRoot, effect, onCleanup } from "cachoujs";

const dispose = createRoot(dispose => {
  effect(() => { /* … */ });
  onCleanup(() => { /* timers, listeners */ });
  return dispose; // often createRoot returns the dispose from the callback pattern
});
```

Actually `createRoot(fn)` calls `fn(dispose)` and returns `fn`'s return value. Typical:

```javascript
const dispose = createRoot(dispose => {
  effect(() => {});
  return dispose;
});
```

Or simply rely on `mount`, which creates a root for you.

### `onCleanup` / `onMount`

```javascript
onMount(() => {
  const id = setInterval(tick, 1000);
  onCleanup(() => clearInterval(id));
});
```

`onMount` schedules work after the reactive setup (client-oriented). Always pair timers and listeners with `onCleanup`.

### Why this matters

Leaked effects hold signal subscribers forever. Use `enableDebug({ strict: true })` and `assertNoReactiveLeaks()` in tests. See [prevent leaks how-to](./how-to/prevent-leaks-and-races.md).

---

## 4. Rendering and lifecycle

```javascript
import { html, mount, render, unmount, hydrate } from "cachoujs";

function App() {
  return html`<div>Hello</div>`;
}

const stop = mount(App, document.getElementById("app"));
stop();

render(App, root);   // replaces previous root on same element
unmount(root);
hydrate(App, root);  // attach to SSR HTML
```

| API | Role |
|-----|------|
| `mount` | Render + return disposer |
| `render` | Render into root (dispose previous) |
| `unmount` | Dispose + clear |
| `hydrate` | Bind to existing DOM from SSR |

Components are functions that return DOM nodes, fragments, or reactive functions/null.

---

## 5. Lists

```javascript
import { mapArray, html, signal } from "cachoujs";

const [todos, setTodos] = signal([
  { id: 1, text: "Write docs" },
  { id: 2, text: "Ship 0.2" }
]);

const list = html`
  <ul>
    ${mapArray(
      todos,
      todo => html`<li>${todo.text}</li>`,
      todo => todo.id,
      { uniqueKeys: true }
    )}
  </ul>
`;
```

| Option | Meaning |
|--------|---------|
| `keyFn` | Stable identity for DOM reuse |
| `uniqueKeys: true` | Faster path when keys are guaranteed unique |
| `reactiveItems: false` | Treat items as immutable snapshots (benchmark/hot path) |

Without keys, reconciliation falls back to index-based behavior and moves can be wrong when reordering.

---

## 6. Resources and async data

### Basic resource

```javascript
import { createResource } from "cachoujs";

const [data, { loading, error, refetch, mutate, invalidate }] = createResource(
  async ({ signal, requestId }) => {
    const res = await fetch(`/api/items?r=${requestId}`, { signal });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  },
  {
    key: "items",
    staleTime: 30_000,
    cancelPrevious: true, // default
    timeoutMs: 10_000,
    dedupe: true,
    revalidateOnFocus: true,
    revalidateOnReconnect: true
  }
);
```

### Source-driven resource

```javascript
const [query, setQuery] = signal("cachou");

const [result, controls] = createResource(
  query,
  async (q, { signal }) => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
    return res.json();
  }
);
```

When `query()` changes, the resource refetches and aborts the previous request (by default).

### Cache helpers

```javascript
import { invalidateResource, prefetchResource } from "cachoujs";

await prefetchResource("items", fetcher);
invalidateResource("items");
```

### Stale response safety

Each refetch has a monotonic `requestId`. Only the latest applied id can commit. Abort signals are provided when `AbortController` exists. This prevents classic race bugs when typing quickly in search UIs.

---

## 7. Context, suspense, portals, errors

### Context

```javascript
import { createContext, useContext } from "cachoujs";

const Theme = createContext("light");

Theme.Provider({
  value: "dark",
  children: () => {
    const theme = useContext(Theme);
    return html`<div class=${theme}>…</div>`;
  }
});
```

### Suspense

```javascript
import { Suspense, lazy } from "cachoujs";

const Admin = lazy(() => import("./Admin.js"));

Suspense({
  fallback: () => html`<p>Loading…</p>`,
  children: () => Admin({})
});
```

Resources under Suspense can register loading state so fallback shows while pending.

### Portal

```javascript
import { Portal } from "cachoujs";

Portal({
  mount: document.body,
  children: () => html`<div class="modal">…</div>`
});
```

### Error boundary

```javascript
import { ErrorBoundary, onError } from "cachoujs";

ErrorBoundary({
  fallback: (err, reset) => html`
    <div>
      <p>${err.message}</p>
      <button onclick=${reset}>Retry</button>
    </div>
  `,
  children: () => Risky()
});
```

`onError(handler)` registers a handler in the current owner scope.

---

## 8. Routing

### Flat routes

```javascript
import { Router, Route, NotFound, Link, navigate, getPath, getQueryParams, getRouteParams, beforeNavigate } from "cachoujs";

Router({
  children: [
    Route({ path: "/", component: Home }),
    Route({ path: "/users/:id", component: params => User(params) }),
    NotFound({ component: () => html`<h1>404</h1>` })
  ]
});

Link({ href: "/users/1", children: "Ada" });
navigate("/users/1", { replace: false, scroll: true, focus: true, viewTransition: false });
```

### Nested layouts

```javascript
import { Layout, Outlet } from "cachoujs";

function Shell() {
  return html`
    <div class="app">
      <nav>…</nav>
      <main data-cachou-route-focus>${Outlet()}</main>
    </div>
  `;
}

Layout({
  path: "/app",
  component: Shell,
  children: [
    Route({ path: "/app", component: Dashboard }),
    Route({ path: "/app/settings", component: Settings }),
    Route({ path: "/app/users/:id", component: p => UserPage(p) })
  ]
});
```

- `Layout` matches the path prefix (wildcard under the layout path).
- The most specific child `Route` wins.
- `Outlet()` renders the matched child inside the layout.
- Params merge layout + child params; `getRouteParams()` returns the latest match.

### Guards

```javascript
const stop = beforeNavigate(({ from, to, replace }) => {
  if (dirty() && !confirm("Leave?")) return false;
});
```

### Lazy routes

```javascript
const Settings = lazy(() => import("./pages/Settings.js"));
// Link preloads on mouseenter when the target route component has preload()
```

There is **no file-based routing** or built-in data loaders. Compose with `createResource` yourself.

---

## 9. SSR and hydration

```javascript
import {
  renderToStringAsync,
  dehydrate,
  getSSRHead,
  hydrate,
  useHead
} from "cachoujs";

// Server
useHead({ title: "Home", meta: [{ name: "description", content: "…" }] });
const appHtml = await renderToStringAsync(App, { path: req.url });
const stateScript = dehydrate();
const headHtml = getSSRHead();

// Client
hydrate(App, document.getElementById("app"));
```

### Isolation

Each `renderToStringAsync` creates a fresh SSR context (resource cache, resource counter, head). On Node, AsyncLocalStorage is installed when available so concurrent requests do not share state.

After render returns, `dehydrate()` / `getSSRHead()` use the **last completed** context so the common sequential pattern works:

```javascript
const html = await renderToStringAsync(App);
const state = dehydrate();
const head = getSSRHead();
```

For fully concurrent custom pipelines, use `createSSRContext` + `runWithSSRContextAsync` and pass the same context intentionally (advanced).

### Safety

Dynamic SSR text/attributes are escaped. Use `trustedHTML` only for sanitized markup.

---

## 10. Forms

```javascript
import { createForm, html } from "cachoujs";

const form = createForm(
  { email: "", name: "" },
  {
    fields: {
      email: {
        validate: v => (!v.includes("@") ? "Invalid email" : null),
        validateOnChange: true
      },
      name: {
        validate: v => (!String(v).trim() ? "Required" : null)
      }
    },
    validate: values => {
      // cross-field validation optional
    },
    onSubmit: async values => {
      await api.save(values);
    }
  }
);

html`
  <form onsubmit=${form.handleSubmit()}>
    <input
      value=${() => form.fields.email.value()}
      oninput=${e => form.fields.email.setValue(e.target.value)}
      onblur=${() => form.fields.email.setTouched(true)}
    />
    ${() => form.fields.email.touched() && form.fields.email.error()
      ? html`<span>${form.fields.email.error()}</span>`
      : ""}
    <button disabled=${() => form.submitting()}>Save</button>
  </form>
`;
```

Async validation/submit is race-safe: stale results do not overwrite newer state. See also [use-forms how-to](./how-to/use-forms.md).

---

## 11. Accessibility

```javascript
import { createLiveRegion, focusFirst, restoreFocusAfter, trapFocus } from "cachoujs";

const [announce, regionEl] = createLiveRegion({ assertive: false });
announce("Item saved");

focusFirst(dialogEl);
const stopTrap = trapFocus(dialogEl);
restoreFocusAfter(() => openModal());
```

These are primitives — you still need semantic HTML, labels, and keyboard patterns in the product UI.

---

## 12. Security

```javascript
import {
  configureSecurityPolicy,
  applyProductionSecurityDefaults,
  getSecurityPolicy,
  trustedHTML,
  onFrameworkEvent
} from "cachoujs";

applyProductionSecurityDefaults();

configureSecurityPolicy({
  allowInlineStyles: false,
  allowedURLProtocols: ["https:", "http:", "mailto:", "tel:"]
});

onFrameworkEvent(e => {
  if (e.type === "security-block") console.warn(e);
});
```

- Prefer CSP at the reverse proxy.
- Never put secrets in client bundles.
- Demo APIs require `CACHOU_DEMO=1` and must stay off in production.

Full details: [Security](./SECURITY.md).

---

## 13. Scheduler and transitions

```javascript
import { scheduleTask, yieldNow, configureScheduler, startTransition, useTransition } from "cachoujs";

configureScheduler({ budgetMs: 5 });

const task = scheduleTask(
  async ({ signal, shouldYield, yieldNow }) => {
    for (const chunk of chunks) {
      if (signal.aborted) return;
      process(chunk);
      if (shouldYield()) await yieldNow();
    }
  },
  { priority: "background" }
);
task.cancel();

startTransition(() => {
  setHeavyFilter(next);
});

const [pending, start] = useTransition();
start(() => setTab("reports"));
```

Priorities: `userBlocking` (aliases: `high`, `user-blocking`), `normal`, `background` (`low`), `idle`.

Transitions mark scheduled work and resources as interruptible; a newer transition can cancel older pending transition tasks (default).

---

## 14. Head management

```javascript
import { useHead } from "cachoujs";

useHead({
  title: () => `${pageTitle()} · My App`,
  meta: [
    { name: "description", content: () => description() },
    { property: "og:title", content: "My App" }
  ]
});
```

On the client, updates `document.title` and meta tags. On the server, accumulates into SSR head output via `getSSRHead()`.

---

## 15. Debug and observability

```javascript
import {
  enableDebug,
  disableDebug,
  getDebugSnapshot,
  assertNoReactiveLeaks,
  resetDebugState,
  onFrameworkEvent,
  emitFrameworkEvent
} from "cachoujs";

enableDebug({ slowEffectThresholdMs: 8, strict: true });

onFrameworkEvent(event => {
  // types include: error, security-block, resource-error, resource-stale-response,
  // slow-effect, reactive-leak, debug-warning, …
  analytics.track(event.type, event);
});

assertNoReactiveLeaks("after unmount");
```

`getDebugSnapshot()` reports signal/computation/root counts and orphans.

---

## 16. Filesystem helpers

Browser helpers call demo `/api/files` endpoints (require demo mode + server):

```javascript
import { listFiles, readFile, createFileBrowser, createFileContent, FileBrowser } from "cachoujs";

const dir = await listFiles("");
const file = await readFile("hello.txt");

const [directory, browser] = createFileBrowser("", { includeHidden: false });
const [content] = createFileContent(() => browser.path());

FileBrowser({ initialPath: "", onSelect: entry => console.log(entry) });
```

Default server root is `./sandbox`. See [browse files how-to](./how-to/browse-and-display-files.md).

---

## 17. Demo server features

These exist for demos and the monorepo — **not** a production backend product.

| Feature | Endpoint / API | Gate |
|---------|----------------|------|
| Todos CRUD | `/api/todos` | `CACHOU_DEMO=1` |
| Read-only SQL | `/api/db-query` | demo + allowlisted SELECT |
| Files | `/api/files`, `/api/files/content` | demo + sandbox root |
| WebSocket | `/ws-api` | demo server |
| `dbSignal(table)` | client helper over query + WS | experimental / demo |

Database adapters: `sqlite` and `memory` supported; postgres/mysql/mongodb/firebase need `CACHOU_DB_EXPERIMENTAL=1`. See [adapters README](../server/adapters/README.md) and [Environment](./ENVIRONMENT.md).

---

## 18. Testing strategy

| Layer | Command | Notes |
|-------|---------|-------|
| Unit | `npm run test:unit` | Node, no DOM browser |
| Browser | `npm run test:browser` | Playwright Chromium default |
| Full | `npm run check` | syntax, unit, compiler, build, browser, benches |
| Memory | `npm run bench:memory` | leak stress |
| Competitive | `npm run bench:compare` | multi-framework |

Safari: `CACHOU_TEST_BROWSER=safari` on macOS.

Write unit tests for pure reactive logic. Use browser tests for DOM bindings and SSR mock paths.

---

## 19. Performance practices

1. Keep components setup-once; put dynamic work in signals/effects/bindings.  
2. Key lists; use `uniqueKeys: true` when safe.  
3. Abort/cancel resources on input.  
4. Batch multi-signal updates.  
5. Prefer class toggles over large inline style strings.  
6. Lazy-load routes with `lazy`.  
7. Measure with `npm run bench` / `bench:compare` before micro-optimizing.  
8. Do not optimize away cleanup for synthetic bench wins in real apps.

---

## 20. Styling and themes

Cachou has a built-in CSS system. No extra packages needed.

### Scoped styles

The `css` tagged template creates a `<style>` block and returns a scoping class name. Use `.self` to reference the scoped class:

```javascript
import { css, html } from "cachoujs";

const cardClass = css`
  .self { padding: 16px; border-radius: 8px; background: white; }
  .self:hover { box-shadow: 0 4px 12px rgba(0,0,0,.1); }
`;

html`<div class=${cardClass}>Content</div>`;
```

### Reactive CSS

Signal getters in `css` interpolations become reactive CSS custom properties. When the signal changes, the style updates — no re-render:

```javascript
const [color, setColor] = signal("#3b82f6");
const cls = css`.self { border-color: ${color}; }`;
```

### Themes

`theme` turns a token map into CSS custom properties. Swap themes by switching a class:

```javascript
const light = theme({ bg: "#fff", text: "#1e293b" });
const dark = theme({ bg: "#0f172a", text: "#f1f5f9" });

html`<div class=${() => isDark() ? dark.className : light.className}>...</div>`;
```

### Conditional classes and keyframes

`cx` joins class names conditionally. `keyframes` registers animations. `globalCSS` adds global CSS (de-duplicated).

Full details: [Styling guide](./STYLING.md).

---

## 21. Transitions and animations

Cachou includes built-in transitions that use the Web Animations API.

### Built-in transitions

```javascript
import { fade, slide, fly, scale } from "cachoujs";

const t = fade(element, { duration: 200 });
t.enter();  // animate in
t.leave();  // animate out
```

- `fade` — opacity
- `slide` — height/width with overflow hidden
- `fly` — translate + opacity
- `scale` — scale transform + opacity

### Transition directive

Use `transition` as a `use:` directive to auto-animate on mount/unmount:

```javascript
html`<div use:transition=${[fly, { y: -20, duration: 300 }]}>Content</div>`;
```

### Swap

`swap` creates `[send, receive]` pairs for FLIP animations between two locations (e.g. moving a todo from "active" to "done").

### Custom transitions

`defineTransition(enterFn, leaveFn)` lets you define transitions from scratch using the Web Animations API.

Full details: [Transitions guide](./TRANSITIONS.md).

---

## 22. Plugin system

`launch` gives you a structured bootstrap for your application — install plugins, register globals, and inject dependencies before anything renders.

```javascript
import { launch } from "cachoujs";

const app = launch(App, { title: "My App" });
app.plug(authPlugin, { apiUrl: "/api" });
app.plug(analyticsPlugin);
app.provide(ThemeContext, "dark");
app.mount("#app");
```

### Plugins

A plugin is a function or an object with an `install(app, ...options)` method. Each plugin is installed once, even if `plug` is called multiple times.

### Dependency injection

`app.provide(key, value)` registers values that components access with `useContext`. This is how plugins make services available without prop drilling.

### App config

```javascript
app.config.errorHandler = (err, instance, info) => {
  Sentry.captureException(err);
};
```

### `getApp()`

Returns the app instance from inside any component in the tree. Useful for library code that needs the registry.

Full details: [Plugins guide](./PLUGINS.md).

---

## 23. Content collections

Content collections provide structured content management for blogs, docs, and other file-based content. Define a schema, load files, query with validation.

```javascript
import { defineCollection, getCollection, z } from "cachoujs";

const posts = defineCollection({
  name: "posts",
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string())
  }),
  directory: "./content/posts"
});

const allPosts = getCollection("posts");
const post = getEntry("posts", "hello-world");
```

### Schema builder

The `z` object provides basic validation: `z.string()`, `z.number()`, `z.boolean()`, `z.date()`, `z.array()`, `z.object()`, `z.optional()`, `z.enum()`.

### Server-side loading

`loadContent` reads `.md`, `.mdx`, and `.json` files from the filesystem and populates collections. Frontmatter is parsed automatically.

### Client-side

Use `addEntries` to populate collections from API responses.

Full details: [Content guide](./CONTENT.md).

---

## 24. Image optimization

The `Image` and `Picture` components handle lazy loading, placeholders, responsive images, and CLS prevention.

```javascript
import { Image, Picture } from "cachoujs";

Image({
  src: "/hero.jpg",
  alt: "Hero image",
  width: 1200,
  height: 600,
  placeholder: "blur",
  priority: true
});

Picture({
  sources: [
    { srcset: "/hero.webp", type: "image/webp" },
    { srcset: "/hero.avif", type: "image/avif" }
  ],
  src: "/hero.jpg",
  alt: "Hero image",
  width: 1200,
  height: 600
});
```

Key features:
- `loading="lazy"` by default with IntersectionObserver fallback
- `placeholder="blur"` or `"color"` for loading states
- `priority` sets eager loading + `fetchpriority="high"`
- `aspectRatio` auto-calculates missing dimensions
- Works in SSR

Full details: [Image guide](./IMAGE.md).

---

## 25. Router middleware

`guard` registers a function that runs before every route change. Middleware can proceed, cancel, or redirect.

```javascript
import { guard } from "cachoujs";

const removeMiddleware = guard(async (to, from, next) => {
  const user = getUser();
  if (to.startsWith("/admin") && !user?.isAdmin) {
    next("/login"); // redirect
    return;
  }
  next(); // proceed
});
```

Middleware receives three arguments:
- `to` — the target path
- `from` — the current path
- `next` — call with no args to proceed, `false` to cancel, or a string to redirect

The return value of `guard` is an unregister function. Call it to remove the middleware.

This is different from `beforeNavigate`, which is a simpler guard. Middleware runs in sequence, supports async operations, and can redirect. Guards just return `true`/`false`.

---

## 26. KeepAlive

`KeepAlive` caches inactive component trees instead of destroying and recreating them. When a component is deactivated, its DOM is moved to a DocumentFragment. When it's activated again, the cached DOM is restored — no setup functions re-run.

```javascript
import { KeepAlive, signal } from "cachoujs";

const [currentPage, setCurrentPage] = signal(Dashboard);

KeepAlive({
  max: 5,
  children: () => currentPage()
});
```

### Options

| Prop | Default | Description |
|------|---------|-------------|
| `max` | `Infinity` | Maximum cached entries (LRU eviction) |
| `include` | — | Only cache components with these names |
| `exclude` | — | Never cache components with these names |
| `onActivate` | — | Called when a cached view is restored |
| `onDeactivate` | — | Called when a view is moved to cache |

### When to use it

KeepAlive is useful for tab interfaces, wizard forms, and dashboard layouts where the user switches between views frequently. Without it, each switch destroys and recreates the component — losing scroll position, input state, and fetched data.

Don't use it everywhere. Each cached view holds onto its DOM and signal subscriptions. Set `max` to a reasonable number and use `include`/`exclude` to be selective.

---

## Next steps

- [API reference](./API.md)  
- [Compiler](./COMPILER.md)  
- [Architecture](./ARCHITECTURE.md)  
- [How-to index](./how-to/README.md)  
- [Styling](./STYLING.md)  
- [Transitions](./TRANSITIONS.md)  
- [Plugins](./PLUGINS.md)  
- [Content](./CONTENT.md)  
- [Image](./IMAGE.md)  
