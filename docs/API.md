# API Reference

Public APIs exported from **`cachoujs`** (v0.4.1). Types also live in `src/index.d.ts`.

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

## Import cheat sheet

```javascript
// Core UI
import { signal, effect, memo, store, batch, createRoot, onCleanup, html, mount } from "cachoujs";

// Data
import { createResource, mapArray } from "cachoujs";

// Routing
import { Router, Route, Layout, Outlet, Link, navigate } from "cachoujs";

// SSR
import { renderToStringAsync, dehydrate, hydrate, getSSRHead } from "cachoujs";

// Safety
import { applyProductionSecurityDefaults, trustedHTML, onFrameworkEvent } from "cachoujs";
```
