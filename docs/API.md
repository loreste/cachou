# API Reference

Public APIs exported from **`cachoujs`** (v0.4.3). Types also live in `src/index.d.ts`.

Subpath imports: `cachoujs/html`, `cachoujs/reactivity`, `cachoujs/router`, `cachoujs/forms`, `cachoujs/a11y`, `cachoujs/files`, `cachoujs/vite`.

---

## Table of contents

1. [Reactivity](#reactivity)
2. [Lists](#lists)
3. [Resources](#resources)
4. [Rendering & DOM](#rendering--dom)
5. [Security](#security)
6. [Components & composition](#components--composition)
7. [Router](#router)
8. [SSR](#ssr)
9. [Forms](#forms)
10. [Accessibility](#accessibility)
11. [Scheduler](#scheduler)
12. [Head](#head)
13. [Diagnostics](#diagnostics)
14. [Files](#files)
15. [Demo helpers](#demo-helpers)
16. [Vite plugin](#vite-plugin)
17. [Styles](#styles)
18. [Transitions](#transitions)
19. [Plugin System](#plugin-system)
20. [Content Collections](#content-collections)
21. [Image](#image)
22. [Router Middleware](#router-middleware)
23. [KeepAlive](#keepalive)

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
function memo<T>(fn: () => T): () => T;
```

Lazy derived value. Computes on first read; invalidates when dependencies change.

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

### `invalidateResource(key)`

Clears cached data for `key`.

### `prefetchResource(key, fetcher, options?)`

```ts
function prefetchResource<T>(
  key: string,
  fetcher: (ctx?: { signal?: AbortSignal; requestId: number }) => Promise<T>,
  options?: { force?: boolean; dedupe?: boolean; timeoutMs?: number }
): Promise<T>;
```

---

## Rendering & DOM

### `html` / `htmlStatic`

```ts
function html(strings: TemplateStringsArray, ...values: any[]): HTMLElement | HTMLElement[] | DocumentFragment;
function htmlStatic(markup: string): HTMLElement | HTMLElement[] | DocumentFragment | SafeHTML;
```

See [Templates](./TEMPLATES.md).

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
function renderToString(Component: () => any): string;
function renderToStringAsync(Component: () => any, options?: { path?: string }): Promise<string>;
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
  handler: (event: { from: string; to: string; replace: boolean }) => boolean | void
): () => void;

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
function dehydrate(): string; // <script id="__CACHOU_STATE__">…
function resolvePendingResources(): Promise<void>;
function resetResourceCounter(): void;
function getSSRHead(): string;
function resetSSRHead(): void; // internal/reset helper via reactivity

function createSSRContext(): SSRContext;
function runWithSSRContext<T>(ctx: SSRContext, fn: () => T): T;
function runWithSSRContextAsync<T>(ctx: SSRContext, fn: () => Promise<T>): Promise<T>;
function installSSRAsyncHooks(asyncHooksModule: { AsyncLocalStorage: new () => any }): void;
```

Typical server sequence:

```javascript
const appHtml = await renderToStringAsync(App, { path: url });
const stateScript = dehydrate();
const headHtml = getSSRHead();
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

```ts
function enableDebug(options?: { slowEffectThresholdMs?: number; strict?: boolean }): void;
function disableDebug(): void;
function getDebugSnapshot(): DebugSnapshot;
function assertNoReactiveLeaks(label?: string): DebugSnapshot;
function resetDebugState(): void;
function onFrameworkEvent(listener: (event: FrameworkEvent) => void): () => void;
function emitFrameworkEvent(event: { type: string; [key: string]: any }): void;
```

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
  aliasRuntime?: boolean;
}): Plugin;

export function runCachouCompiler(args?: string[], options?: { cwd?: string; runtime?: string }): Promise<void>;
export function resolveCompilerCommand(cwd?: string): { command: string; argsPrefix: string[]; cwd: string };
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
  middlewareFn: (to: string, from: string, next: (arg?: false | string) => void) => void | Promise<void>
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
// Core UI
import { signal, effect, memo, store, batch, createRoot, onCleanup, html, mount } from "cachoujs";

// Data
import { createResource, mapArray } from "cachoujs";

// Routing
import { Router, Route, Layout, Outlet, Link, navigate, guard } from "cachoujs";

// Styles
import { css, cssVar, theme, cx, keyframes, globalCSS } from "cachoujs";

// Transitions
import { fade, slide, fly, scale, swap, transition, defineTransition } from "cachoujs";

// Plugin system
import { launch, getApp } from "cachoujs";

// Content
import { defineCollection, getCollection, getEntry, z, parseFrontmatter } from "cachoujs";

// Image
import { Image, Picture } from "cachoujs";

// Components
import { Show, Switch, Match, For, Index, KeepAlive } from "cachoujs";

// SSR
import { renderToStringAsync, dehydrate, hydrate, getSSRHead } from "cachoujs";

// Safety
import { applyProductionSecurityDefaults, trustedHTML, onFrameworkEvent } from "cachoujs";
```
