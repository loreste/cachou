# API Reference

Public APIs exported from **`cachoujs`** (v0.4.9). Types also live in `src/index.d.ts`.

Subpath imports: `cachoujs/browser`, `cachoujs/html`, `cachoujs/reactivity`, `cachoujs/router`, `cachoujs/forms`, `cachoujs/a11y`, `cachoujs/files`, `cachoujs/styles`, `cachoujs/transitions`, `cachoujs/plugin`, `cachoujs/content`, `cachoujs/image`, `cachoujs/media`, `cachoujs/ui`, `cachoujs/utils`, `cachoujs/vite`, and more.

---

## Table of contents

1. [Package entries](#package-entries)
2. [Reactivity](#reactivity)
3. [Lists](#lists)
4. [Resources](#resources)
5. [Rendering & DOM](#rendering--dom)
6. [Security](#security)
7. [Components & composition](#components--composition)
8. [Router](#router)
9. [SSR](#ssr)
10. [Forms](#forms)
11. [Accessibility](#accessibility)
12. [Scheduler](#scheduler)
13. [Head](#head)
14. [Diagnostics](#diagnostics)
15. [Files](#files)
16. [Demo helpers](#demo-helpers)
17. [Vite plugin](#vite-plugin)
18. [Styles](#styles)
19. [Transitions](#transitions)
20. [Plugin System](#plugin-system)
21. [Content Collections](#content-collections)
22. [Image](#image)
23. [Router Middleware](#router-middleware)
24. [KeepAlive](#keepalive)

---

## Package entries

| Import | Use when |
|--------|----------|
| `cachoujs` | Full runtime, including Node-oriented content/media helpers |
| `cachoujs/browser` | Client bundles — same UI/runtime surface without server-only modules |
| `cachoujs/*` | Narrow subpaths (`reactivity`, `html`, `router`, `styles`, …) |

The Vite plugin aliases `cachoujs` to the browser entry by default so generated
`.cachou` components and app code do not pull Node built-ins into the client
graph. Override with `cachou({ runtimeEntry: "…" })` if you need the full entry.

---

## Reactivity

### `signal(initialValue, options?)`

```ts
function signal<T>(initialValue: T, options?: {
  equals?: false | ((a: T, b: T) => boolean);
  name?: string;
}): [() => T, (v: T | ((prev: T) => T)) => void];
```

Creates a reactive cell. Returns `[get, set]`.

- Default equality is `Object.is` / `===` for primitives and object identity.
- Pass `equals: false` to always notify subscribers (even when the next value is `===` the previous).
- Pass a custom `(a, b) => boolean` comparator for deep or field-level equality.
- `name` is an optional debug label used by diagnostics.

### `effect(fn)`

```ts
function effect(fn: () => void): () => void;
```

Runs `fn` immediately, tracks signal reads, re-runs on changes. Returns disposer.

### `createRoot(fn)`

```ts
function createRoot<T>(fn: (dispose: () => void) => T): T;
```

Creates an ownership root. Dispose tears down owned effects and cleanups.

### `memo(fn, options?)`

```ts
function memo<T>(fn: () => T, options?: { equals?: false | ((a: T, b: T) => boolean) }): () => T;
```

Lazy derived value. Computes on first read; invalidates when dependencies change.
When the derived result compares equal, downstream effects are not rerun.
Pass `equals: false` to always notify downstream subscribers.

### `store(initialValue)`

```ts
function store<T extends object>(initialValue: T): T;
```

Reactive deep proxy for object graphs.

### `batch(fn)`

```ts
function batch(fn: () => void): void;
```

Coalesces subscriber notifications until `fn` completes.

### `onCleanup(fn)`

```ts
function onCleanup(fn: () => void): void;
```

Registers cleanup on the active owner (effect/root).

### `onMount(fn)`

```ts
function onMount(fn: () => void): void;
```

Runs `fn` after setup (client-oriented mount timing).

---

## Lists

### `mapArray(list, mapFn, keyFn?, options?)`

```ts
function mapArray<T, U>(
  list: (() => T[]) | T[],
  mapFn: (item: T, index: number) => U,
  keyFn?: (item: T, index: number) => unknown,
  options?: { reactiveItems?: boolean; uniqueKeys?: boolean }
): () => U[];
```

Keyed list mapping with DOM-oriented reuse when used inside `html`.

| Option | Default | Purpose |
|--------|---------|---------|
| `reactiveItems` | `true` | When `false`, treat items as immutable snapshots |
| `uniqueKeys` | `false` | When `true`, skip duplicate-key bookkeeping |

When immutable keyed items keep the same array identity, `mapArray` reuses the
previous mapped result. Create a new array for inserts, removals, or reorders;
do not mutate an immutable snapshot in place.

---

## Resources

### `createResource(fetcher, options?)`

### `createResource(source, fetcher, options?)`

```ts
type ResourceControls<T> = {
  loading: () => boolean;
  error: () => any;
  refetch: () => Promise<void>;
  mutate: (data: T) => void;
  dispose: () => void;
  invalidate: () => void;
  getRequestId: () => number;
  getLatestAppliedRequestId: () => number;
};

function createResource<T>(
  fetcher: (ctx?: { signal?: AbortSignal; requestId: number }) => Promise<T>,
  options?: ResourceOptions
): [() => T | undefined, ResourceControls<T>];

function createResource<S, T>(
  source: () => S,
  fetcher: (source: S, ctx?: { signal?: AbortSignal; requestId: number }) => Promise<T>,
  options?: ResourceOptions & { key?: string | ((source: S) => string) }
): [() => T | undefined, ResourceControls<T>];
```

**Options:** `key`, `staleTime`, `cancelPrevious` (default true), `revalidateOnFocus`, `revalidateOnReconnect`, `timeoutMs`, `dedupe`.

The browser cache is bounded to 256 entries by default. Configure it at
application startup; `maxEntries: 0` disables resolved-data retention:

```ts
function configureResourceCache(options?: { maxEntries?: number }): {
  maxEntries: number;
  size: number;
};
```

This limit applies only to the process-wide browser cache. SSR resource caches
remain request-local and are discarded with their SSR context.

### `invalidateResource(key)`

Clears cached data for `key`.

### `prefetchResource(key, fetcher, options?)`

```ts
function prefetchResource<T>(
  key: string,
  fetcher: (ctx?: { signal?: AbortSignal; requestId: number }) => Promise<T>,
  options?: { force?: boolean; dedupe?: boolean; timeoutMs?: number; signal?: AbortSignal }
): Promise<T>;
```

Pass `signal` to cancel a prefetch (already-aborted signals reject immediately).

---

## Rendering & DOM

### `html` / `htmlStatic`

```ts
function html(strings: TemplateStringsArray, ...values: any[]): HTMLElement | HTMLElement[] | DocumentFragment;
function htmlStatic(markup: string): HTMLElement | HTMLElement[] | DocumentFragment | SafeHTML;
function createCompiledStatic(markup: string, factory?: () => Node | DocumentFragment): any;
```

See [Templates](./TEMPLATES.md).

`createCompiledStatic` is the runtime boundary used by the canonical `.cachou`
compiler for conservative fully static templates. It evaluates the DOM factory
only in a browser and returns the exact markup during SSR. Application code
should generally use `html` or `htmlStatic` directly; the compiler falls back
to `htmlStatic` when parsing semantics could differ.

### `render` / `mount` / `unmount` / `hydrate`

```ts
function render(Component: () => any, root: HTMLElement): void;
function mount(Component: () => any, root: HTMLElement): () => void;
function unmount(root: HTMLElement): void;
function hydrate(Component: () => any, root: HTMLElement): void;
```

### `cleanupNode` / `removeNodeWithTransition`

Low-level DOM cleanup helpers used by the reconciler and advanced integrations.

### `renderToString` / `renderToStringAsync`

```ts
function renderToString(Component: () => any, options?: { path?: string; request?: any; traceparent?: string; context?: SSRContext }): string;
function renderToStringAsync(Component: () => any, options?: { path?: string; request?: any; signal?: AbortSignal; traceparent?: string; context?: SSRContext; preload?: (ctx: { request: any; signal: AbortSignal | null }) => any | Promise<any> }): Promise<string>;
```

`options.path` sets the SSR router path.

---

## Security

### `configureSecurityPolicy(options?)` / `getSecurityPolicy()`

```ts
function configureSecurityPolicy(options?: {
  allowedURLProtocols?: string[];
  allowedDataMimeTypes?: string[];
  allowInlineStyles?: boolean;
}): SecurityPolicy;

function getSecurityPolicy(): SecurityPolicy;
```

### `applyProductionSecurityDefaults()`

Disables inline styles and tightens URL protocols to `http:`, `https:`, `mailto:`, `tel:`.

### `trustedHTML(value)`

Marks a string as intentional raw HTML (SSR/client). **Only** for already-sanitized content.

---

## Components & composition

### `createContext` / `useContext`

```ts
function createContext<T>(defaultValue?: T): {
  Provider: (props: { value: T; children: any }) => () => any;
};
function useContext<T>(context: Context<T>): T;
```

### `ErrorBoundary`

```ts
function ErrorBoundary(props: {
  children: any;
  fallback: any | ((err: Error, reset: () => void) => any);
}): () => any;
```

### `Suspense`

```ts
function Suspense(props: { fallback: any; children: any }): HTMLDivElement;
```

### `Portal`

```ts
function Portal(props: { mount?: HTMLElement; children: any }): Text;
```

### `lazy(loader)`

```ts
function lazy<T>(loader: () => Promise<{ default: T } | T>): T & { preload?: () => void };
```

### `onError(handler)`

Registers an error handler for the current reactive owner.

---

## Router

### `Router` / `Route` / `Layout` / `Outlet` / `NotFound` / `Link`

```ts
function Router(props: { children: any }): HTMLElement;
function Route(props: { path: string; component: any }): () => any;
function Layout(props: { path: string; component: any; children?: any }): () => any;
function Outlet(): () => any;
function NotFound(props?: { component?: any; children?: any }): () => any;
function Link(props: { href: string; class?: string; children: any }): HTMLElement;
```

### Navigation

```ts
function navigate(path: string, options?: {
  replace?: boolean;
  scroll?: boolean;
  focus?: boolean;
  viewTransition?: boolean;
}): boolean;

function beforeNavigate(
  handler: (event: { from: string; to: string; replace: boolean; signal: AbortSignal }) => boolean | void | Promise<boolean | void>
): () => void;

function go(delta: number): boolean;
function back(): boolean;
function forward(): boolean;

function getPath(): string;
function getQueryParams(): Record<string, string>;
function getRouteParams(): Record<string, string>;
```

### Path patterns

| Pattern | Meaning |
|---------|---------|
| `/users` | Exact |
| `/users/:id` | Param (decoded) |
| `/files/*` | Prefix wildcard |
| `*` | Not-found / catch-all |

### File-based routing

```ts
function filePathToRoutePath(filePath: string, options?: { routesDir?: string }): string;
function fileRoutes(globMap: Record<string, () => Promise<any>>, options?): any[];
function createFileRoutes(modules: Record<string, any>, options?): any[];
function createFileRoutesFromGlob(globMap, options?): any[];
```

See [use-file-based-routing](./how-to/use-file-based-routing.md).

---

## SSR

```ts
function dehydrate(context?: SSRContext): string; // <script id="__CACHOU_STATE__">…
function resolvePendingResources(): Promise<void>;
function resetResourceCounter(): void;
function getSSRHead(context?: SSRContext): string;
function renderToStream(Component: () => any, options?: {
  path?: string;
  request?: any;
  signal?: AbortSignal;
  shell?: boolean;
  traceparent?: string;
  context?: SSRContext;
  preload?: (ctx: { request: any; signal: AbortSignal | null }) => any | Promise<any>;
}): ReadableStream | AsyncGenerator<string>;
function resetSSRHead(): void; // internal/reset helper via reactivity

function createSSRContext(): SSRContext;
function runWithSSRContext<T>(ctx: SSRContext, fn: () => T): T;
function runWithSSRContextAsync<T>(ctx: SSRContext, fn: () => Promise<T>): Promise<T>;
function installSSRAsyncHooks(asyncHooksModule: { AsyncLocalStorage: new () => any }): void;
```

Typical server sequence (sequential handler — one request at a time):

```javascript
const appHtml = await renderToStringAsync(App, { path: url });
const stateScript = dehydrate();
const headHtml = getSSRHead();
```

### Concurrent SSR contract

For concurrent request handlers, treat the context as **request-scoped**:

1. `const context = createSSRContext()` once per request.
2. Pass `{ context, path, request, signal }` into `renderToStringAsync` / `renderToStream`.
3. Pass the **same** `context` into `dehydrate(context)` and `getSSRHead(context)`.
4. Do **not** rely on implicit `dehydrate()` / `getSSRHead()` while other requests may be in flight — when the last completed render is ambiguous, those helpers **fail closed** (throw) instead of returning another request’s state.
5. Abort via `signal` (or stream cancel) releases pending resource work for that context.

```javascript
const context = createSSRContext();
const appHtml = await renderToStringAsync(App, {
  path: url,
  request: req,
  signal: req.signal,
  context
});
const stateScript = dehydrate(context);
const headHtml = getSSRHead(context);
```

---

## Forms

### `createField(initialValue?, options?)`

Returns `{ value, setValue, error, setError, touched, setTouched, validating, dirty, valid, validate, reset }`.

Options: `validate` (fn or array of fns), `validateOnChange`.

### `createForm(initialValues, options?)`

Returns `{ fields, values, submitting, error, valid, dirty, validate, reset, handleSubmit }`.

Options: `fields` (per-field config), `validate` (form-level), `onSubmit`.

---

## Accessibility

```ts
function createLiveRegion(options?: { assertive?: boolean }): [(message: string) => void, HTMLElement | null];
function focusFirst(root: ParentNode): boolean;
function restoreFocusAfter<T>(fn: () => T): T;
function trapFocus(root: HTMLElement): () => void;
```

---

## Scheduler

```ts
type SchedulerPriority = "userBlocking" | "user-blocking" | "high" | "normal" | "background" | "low" | "idle";

function scheduleTask<T>(fn, options?: { priority?: SchedulerPriority; signal?: AbortSignal }): ScheduledTask<T>;
function yieldNow(): Promise<void>;
function configureScheduler(options?: { budgetMs?: number }): { budgetMs: number };
function startTransition(fn: () => void, options?: { cancelPrevious?: boolean }): Promise<void> | void;
function useTransition(): [() => boolean, (fn: () => void) => void];
```

`ScheduledTask`: `{ priority, signal, status, cancelled, finished, cancel() }`.

---

## Head

```ts
function useHead(config: {
  title?: string | (() => string);
  meta?: Array<{ name?: string; property?: string; content: string | (() => string) }>;
}): void;
```

---

## Diagnostics

### Debug mode

```ts
function enableDebug(options?: { slowEffectThresholdMs?: number; strict?: boolean }): void;
function disableDebug(): void;
function getDebugSnapshot(): DebugSnapshot;
function assertNoReactiveLeaks(label?: string): DebugSnapshot;
function resetDebugState(): void;
function onFrameworkEvent(listener: (event: FrameworkEvent) => void): () => void;
function emitFrameworkEvent(event: { type: string; [key: string]: any }): void;
```

### Logger

Logging is **silent by default** and never throws into application code.

```ts
type CachouLogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

function configureLogger(options?: {
  level?: CachouLogLevel;
  includeStack?: boolean;
  sink?: ((entry: CachouLogEntry) => void) | null;
}): { level: CachouLogLevel; includeStack: boolean; hasSink: boolean };
function getLoggerConfig(): { level: CachouLogLevel; includeStack: boolean; hasSink: boolean };
function createLogger(scope?: string): {
  error(message: string, details?: Record<string, any>): void;
  warn(message: string, details?: Record<string, any>): void;
  info(message: string, details?: Record<string, any>): void;
  debug(message: string, details?: Record<string, any>): void;
  trace(message: string, details?: Record<string, any>): void;
};
```

```javascript
import { configureLogger, createLogger } from "cachoujs";

configureLogger({ level: "debug" });
const log = createLogger("checkout");
log.info("order started", { orderId: "o-1" });
```

### Tracing

Tracing is disabled by default. It uses W3C `traceparent` IDs and emits finished
spans through an application-provided exporter. The core does not depend on an
OpenTelemetry SDK.

```ts
function configureTracing(options?: {
  enabled?: boolean;
  sampleRate?: number;
  exporter?: ((span: CachouSpanExport) => void) | { export(span: CachouSpanExport): void } | null;
}): { enabled: boolean; sampleRate: number; hasExporter: boolean };
function getTracingConfig(): { enabled: boolean; sampleRate: number; hasExporter: boolean };
function startSpan(name: string, options?: {
  parent?: CachouSpan;
  traceparent?: string | CachouSpanContext;
  attributes?: Record<string, any>;
}): CachouSpan;
function runWithSpan<T>(span: CachouSpan, fn: () => T): T;
function getActiveSpan(): CachouSpan | null;
function getSpanTraceparent(span?: CachouSpan | null): string;
function parseTraceparent(value: string): CachouSpanContext | null;
function formatTraceparent(context: CachouSpanContext | null): string;
function extractTraceparent(request: any): CachouSpanContext | null;
function createTracer(scope?: string): {
  startSpan(name: string, options?: object): CachouSpan;
  withSpan<T>(name: string, fn: () => T, options?: object): T;
};
```

Sensitive attribute keys (authorization, cookie, password, token, …) are redacted.
Pass `traceparent` / `request` into SSR helpers so concurrent requests keep separate traces.

### Framework event types (non-exhaustive)

| Type | When |
|------|------|
| `error` | Uncaught reactive error path |
| `security-block` | URL/style policy blocked a value |
| `resource-error` | Resource fetcher failed |
| `resource-stale-response` | Late response ignored |
| `slow-effect` | Effect exceeded threshold (debug) |
| `reactive-leak` | `assertNoReactiveLeaks` failed |
| `debug-warning` | e.g. effect outside owner in strict mode |

---

## Files

```ts
function listFiles(path?: string, options?: { includeHidden?: boolean }): Promise<FileDirectory>;
function readFile(path: string): Promise<FileContent>;
function createFileBrowser(initialPath?: string, options?): [getDir, controls];
function createFileContent(path: string | (() => string), options?): [getFile, controls];
function FileBrowser(props?: {
  initialPath?: string;
  includeHidden?: boolean;
  key?: string;
  contentKey?: string;
  class?: string;
  onSelect?: (entry: FileEntry) => void;
}): HTMLElement;
```

Requires demo server endpoints. See [Security](./SECURITY.md).

---

## Demo helpers

### `dbSignal(tableName, options?)` — experimental

```ts
function dbSignal<T>(tableName: string, options?: { query?: string }): Signal<T>;
```

Fetches via `/api/db-query` and optionally syncs over the demo WebSocket. Prefer application-specific `createResource` + authenticated APIs in real apps.

### `webSocketSignal(url, initialValue)`

Signal synchronized over a WebSocket URL (demo-oriented).

---

## Vite plugin

```ts
// cachoujs/vite
export function cachou(options?: {
  dirs?: string[];
  runtime?: string;
  aliasRuntime?: boolean; // default true — alias `cachoujs` in the consumer project
  runtimeEntry?: string;  // default: browser-safe entry (src/browser.js)
}): Plugin;

export function runCachouCompiler(args?: string[], options?: { cwd?: string; runtime?: string }): Promise<void>;
export function resolveCompilerCommand(cwd?: string): { command: string; argsPrefix: string[]; cwd: string };
```

| Option | Default | Purpose |
|--------|---------|---------|
| `dirs` | `src/components`, `demo/components` | Directories compiled on `buildStart` |
| `runtime` | `"cachoujs"` | Import specifier written into generated JS |
| `aliasRuntime` | `true` | Resolve `cachoujs` to this package’s runtime in Vite |
| `runtimeEntry` | browser entry | Absolute path or package subpath used for the alias |

```javascript
import { defineConfig } from "vite";
import { cachou } from "cachoujs/vite";

export default defineConfig({
  plugins: [
    cachou({
      dirs: ["src/components"],
      // Prefer the browser-safe graph for client builds (default):
      // runtimeEntry points at cachoujs/browser
    })
  ]
});
```

---

## Styles

### `css`

```ts
function css(strings: TemplateStringsArray, ...values: any[]): string;
```

Tagged template that creates a scoped `<style>` in `<head>`. Returns a scoping class name. Use `.self` in CSS to reference the scoped class. Signal getters in interpolations become reactive CSS custom properties.

### `cssVar(name, signalGetter, el?)`

```ts
function cssVar(name: string, signalGetter: () => any, el?: HTMLElement): () => void;
```

Binds a CSS custom property to a signal on `el` (defaults to `document.documentElement`). Returns a cleanup function.

### `theme(tokens)`

```ts
function theme(tokens: Record<string, string | number>): {
  vars: Record<string, string>;
  className: string;
  apply: (el: HTMLElement) => void;
};
```

Creates CSS custom properties prefixed `--cachou-` from a token map. Returns `vars` (token-to-`var()` map), `className`, and `apply(el)`.

### `cx(...args)`

```ts
function cx(...args: (string | Record<string, boolean> | any[] | null | undefined | false)[]): string;
```

Conditional class name joiner. Accepts strings, `{ className: bool }` objects, arrays, and falsy values.

### `keyframes(name, frames)`

```ts
function keyframes(name: string, frames: Record<string, string | Record<string, string>>): string;
```

Registers a `@keyframes` rule and returns the animation name. De-duplicated by name.

### `globalCSS(cssText)`

```ts
function globalCSS(cssText: string): void;
```

Injects global CSS once. De-duplicated by content hash.

See [Styling guide](./STYLING.md).

---

## Transitions

### `fade(node, options?)`

```ts
function fade(node: HTMLElement, options?: TransitionOptions): TransitionHandle;
```

Opacity 0 ↔ 1. Returns `{ enter(), leave(), destroy() }`.

### `slide(node, options?)`

```ts
function slide(node: HTMLElement, options?: TransitionOptions & { axis?: "x" | "y" }): TransitionHandle;
```

Height/width slide with overflow hidden.

### `fly(node, options?)`

```ts
function fly(node: HTMLElement, options?: TransitionOptions & { x?: number; y?: number }): TransitionHandle;
```

Translate + opacity. Defaults to `y: -20`.

### `scale(node, options?)`

```ts
function scale(node: HTMLElement, options?: TransitionOptions & { start?: number }): TransitionHandle;
```

Scale transform + opacity. `start` defaults to `0`.

### `swap(options?)`

```ts
function swap(options?: {
  duration?: number;
  delay?: number;
  easing?: (t: number) => number;
  fallback?: (node: HTMLElement) => TransitionHandle;
}): [send: (node: HTMLElement, opts: { key: any }) => any, receive: (node: HTMLElement, opts: { key: any }) => any];
```

Creates `[send, receive]` pair for FLIP-style animations between locations. Elements matched by `key`.

### `transition(node, transitionFn, options?)`

```ts
function transition(node: HTMLElement, transitionFn: Function, options?: object): () => void;
```

Directive that runs `enter()` on mount and registers `leave()` for unmount. Use as `use:transition=${[fade, opts]}`.

### `defineTransition(enterFn, leaveFn)`

```ts
function defineTransition(
  enterFn: (node: HTMLElement, opts: object) => { finished: Promise<void>; cancel: () => void },
  leaveFn: (node: HTMLElement, opts: object) => { finished: Promise<void>; cancel: () => void }
): (node: HTMLElement, options?: object) => TransitionHandle;
```

Create a custom transition from enter/leave functions.

### Easing functions

```ts
const linear: (t: number) => number;
const easeIn: (t: number) => number;
const easeOut: (t: number) => number;
const easeInOut: (t: number) => number;
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number;
```

**`TransitionOptions`**: `{ duration?: number, delay?: number, easing?: (t: number) => number, onStart?: () => void, onEnd?: () => void }`.

**`TransitionHandle`**: `{ enter(): { finished: Promise<void>, cancel(): void }, leave(): { ... }, destroy(): void }`.

See [Transitions guide](./TRANSITIONS.md).

---

## Plugin System

### `launch(rootComponent, rootProps?)`

```ts
function launch(rootComponent: Function, rootProps?: object): App;
```

Creates an application instance with plugin installation, dependency injection, and lifecycle management.

**App methods:** `plug(plugin, ...options)`, `provide(key, value)`, `component(name, fn?)`, `directive(name, fn?)`, `mount(selectorOrElement)`, `unmount()`.

**App properties:** `config` (`{ errorHandler, warnHandler, globalProperties }`), `isMounted`.

### `getApp()`

```ts
function getApp(): App | null;
```

Returns the current app instance from inside a `launch` tree.

See [Plugins guide](./PLUGINS.md).

---

## Content Collections

### `defineCollection(config)`

```ts
function defineCollection(config: {
  name: string;
  schema?: { validate(value: any): { valid: boolean; errors?: string[] } };
  directory?: string;
}): Collection;
```

### `getCollection(collection)`

```ts
function getCollection(collection: string | { name: string }): Array<{ slug: string; data: any; body?: string; rawContent?: string }>;
```

### `getEntry(collection, slug)`

```ts
function getEntry(collection: string | { name: string }, slug: string): { slug: string; data: any; body?: string } | null;
```

### `z`

Minimal schema builder: `z.string()`, `z.number()`, `z.boolean()`, `z.date()`, `z.array(inner)`, `z.object(shape)`, `z.optional(inner)`, `z.enum(values)`.

### `parseFrontmatter(content)`

```ts
function parseFrontmatter(content: string): { data: Record<string, any>; body: string };
```

Parses YAML-like frontmatter from markdown content.

### `loadContent(configs)`

```ts
function loadContent(configs: Array<{ name: string; schema?: any; directory: string }>): Promise<void>;
```

Server-side loader that reads `.md`, `.mdx`, and `.json` files from the filesystem.

### `addEntries(collection, entries)`

Manually add entries to a collection (client-side).

### `clearCollection(collection)`

Remove all entries from a collection.

See [Content guide](./CONTENT.md).

---

## Image

### `Image(props)`

```ts
function Image(props: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  loading?: "lazy" | "eager";
  decoding?: "async" | "auto" | "sync";
  srcset?: string;
  sizes?: string;
  placeholder?: "none" | "blur" | "color";
  placeholderColor?: string;
  priority?: boolean;
  aspectRatio?: string | number;
  fit?: string;
  quality?: number;
  class?: string;
  onLoad?: (event: { target: HTMLImageElement; src: string }) => void;
  onError?: (event: { target: HTMLImageElement; src: string; error: any }) => void;
}): HTMLElement;
```

Lazy-loaded image with placeholder support. Works on client and SSR.

### `Picture(props)`

```ts
function Picture(props: {
  sources: Array<{ srcset: string; type?: string; media?: string; sizes?: string }>;
  src: string;
  alt: string;
  // ...same image props as above
}): HTMLElement;
```

`<picture>` element with multiple `<source>` entries for art direction.

See [Image guide](./IMAGE.md).

---

## Router Middleware

### `guard(middlewareFn)`

```ts
function guard(
  middlewareFn: (to: string, from: string, next: (arg?: false | string) => void, signal?: AbortSignal) => void | Promise<void>
): () => void;
```

Registers a global middleware that runs before every route resolution. Call `next()` to proceed, `next(false)` to cancel, or `next('/path')` to redirect. Returns an unregister function.

---

## KeepAlive

### `KeepAlive(props)`

```ts
function KeepAlive(props: {
  max?: number;
  include?: string[];
  exclude?: string[];
  onActivate?: (key: string) => void;
  onDeactivate?: (key: string) => void;
  children: () => any;
}): HTMLElement;
```

Caches inactive component trees instead of destroying them. Uses LRU eviction when `max` is reached. `include`/`exclude` filter by component name.

---

## Import cheat sheet

```javascript
// Core UI (use "cachoujs/browser" for client-only bundles)
import { signal, effect, memo, store, batch, createRoot, onCleanup, html, mount } from "cachoujs";

// Data
import { createResource, configureResourceCache, mapArray } from "cachoujs";

// Routing
import { Router, Route, Layout, Outlet, Link, navigate, go, back, forward, guard } from "cachoujs";

// Styles
import { css, cssVar, theme, cx, keyframes, globalCSS } from "cachoujs";

// Transitions
import { fade, slide, fly, scale, swap, transition, defineTransition } from "cachoujs";

// Plugin system
import { launch, getApp } from "cachoujs";

// Content (Node / full entry — not on cachoujs/browser)
import { defineCollection, getCollection, getEntry, z, parseFrontmatter } from "cachoujs";

// Image
import { Image, Picture } from "cachoujs";

// Components
import { Show, Switch, Match, For, Index, KeepAlive } from "cachoujs";

// SSR
import { renderToStringAsync, createSSRContext, dehydrate, hydrate, getSSRHead } from "cachoujs";

// Observability
import { configureLogger, createLogger, configureTracing, startSpan, onFrameworkEvent } from "cachoujs";

// Safety
import { applyProductionSecurityDefaults, trustedHTML } from "cachoujs";
```
