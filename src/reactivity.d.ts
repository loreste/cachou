/**
 * Core reactivity primitives (deep import).
 * Prefer `import { … } from "cachoujs"` for the full surface.
 * @module cachoujs/reactivity
 */
declare module "cachoujs/reactivity" {
  import type {
    Accessor,
    CachouChild,
    EqualityOptions,
    Signal,
    SignalGetter,
    SSRContext
  } from "cachoujs";

  export type { Accessor, EqualityOptions, Signal, SignalGetter, SSRContext };

  export function signal<T>(
    initialValue: T,
    options?: EqualityOptions<T> & { name?: string }
  ): Signal<T>;
  export function effect(fn: () => void | (() => void)): () => void;
  export function createRoot<T>(fn: (dispose: () => void) => T): T;
  export function memo<T>(fn: () => T, options?: EqualityOptions<T>): SignalGetter<T>;
  export function store<T extends object>(initialValue: T): T;
  export function batch(fn: () => void): void;
  export function onCleanup(fn: () => void): void;
  export function onMount(fn: () => void | (() => void)): void;
  export function untrack<T>(fn: () => T): T;
  export function getOwner(): unknown;
  export function runWithOwner<T>(owner: unknown, fn: () => T): T;
  export function mapArray<T, U>(
    list: SignalGetter<T[]> | T[],
    mapFn: (item: T, index: number) => U,
    keyFn?: (item: T, index: number) => unknown,
    options?: { reactiveItems?: boolean; uniqueKeys?: boolean }
  ): () => U[];
  export function createResource<T>(
    fetcher: (context?: { signal?: AbortSignal; requestId: number }) => Promise<T>,
    options?: {
      key?: string;
      staleTime?: number;
      revalidateOnFocus?: boolean;
      revalidateOnReconnect?: boolean;
      cancelPrevious?: boolean;
      timeoutMs?: number;
      dedupe?: boolean;
    }
  ): [
    SignalGetter<T | undefined>,
    {
      loading: SignalGetter<boolean>;
      error: SignalGetter<any>;
      refetch: () => Promise<void>;
      mutate: (data: T) => void;
      dispose: () => void;
      invalidate: () => void;
      getRequestId: () => number;
      getLatestAppliedRequestId: () => number;
    }
  ];
  export function createResource<S, T>(
    source: SignalGetter<S>,
    fetcher: (source: S, context?: { signal?: AbortSignal; requestId: number }) => Promise<T>,
    options?: {
      key?: string | ((source: S) => string);
      staleTime?: number;
      revalidateOnFocus?: boolean;
      revalidateOnReconnect?: boolean;
      cancelPrevious?: boolean;
      timeoutMs?: number;
      dedupe?: boolean;
    }
  ): [
    SignalGetter<T | undefined>,
    {
      loading: SignalGetter<boolean>;
      error: SignalGetter<any>;
      refetch: () => Promise<void>;
      mutate: (data: T) => void;
      dispose: () => void;
      invalidate: () => void;
      getRequestId: () => number;
      getLatestAppliedRequestId: () => number;
    }
  ];
  export function createContext<T>(defaultValue?: T): {
    Provider: (props: { value: T; children: any }) => () => any;
  };
  export function useContext<T>(context: { Provider: any }): T;
  export function ErrorBoundary(props: {
    children: any;
    fallback: any | ((err: Error, reset: () => void) => any);
  }): () => any;
  export function Suspense(props: { fallback: any; children: any }): HTMLDivElement;
  export function Portal(props: { mount?: HTMLElement; children: any }): Text;
  export function onError(handler: (err: Error) => void): void;
  export function createSSRContext(): SSRContext;
  export function runWithSSRContext<T>(context: SSRContext, fn: () => T): T;
  export function runWithSSRContextAsync<T>(
    context: SSRContext,
    fn: () => Promise<T>
  ): Promise<T>;
  export function dehydrate(context?: SSRContext, options?: { nonce?: string }): string;
  export function getSSRHead(context?: SSRContext): string;
  export function installSSRAsyncHooks(asyncHooksModule: {
    AsyncLocalStorage: new () => any;
  }): void;
  export function useHead(config: {
    title?: string | (() => string);
    meta?: Array<{ name?: string; property?: string; content: string | (() => string) }>;
    links?: Array<Record<string, any>>;
    jsonld?: any[];
  }): void;
  export function enableDebug(options?: { slowEffectThresholdMs?: number; strict?: boolean }): void;
  export function disableDebug(): void;
  export function getDebugSnapshot(): {
    enabled: boolean;
    strict: boolean;
    signals: number;
    computations: number;
    roots: number;
    disposedComputations: number;
    disposedRoots: number;
    liveComputations: number;
    liveRoots: number;
    orphanComputations: number;
  };
  export function assertNoReactiveLeaks(label?: string): ReturnType<typeof getDebugSnapshot>;
  export function startTransition(
    fn: () => void,
    options?: { cancelPrevious?: boolean }
  ): Promise<void> | void;
  export function useTransition(): [SignalGetter<boolean>, (fn: () => void) => void];
  export function scheduleTask<T>(
    fn: (context: {
      signal: AbortSignal | { aborted: boolean };
      priority: "userBlocking" | "normal" | "background" | "idle";
      shouldYield: () => boolean;
      yieldNow: () => Promise<void>;
    }) => T | Promise<T>,
    options?: { priority?: string; signal?: AbortSignal }
  ): any;
  export function yieldNow(): Promise<void>;
  export function configureLogger(options?: any): any;
  export function getLoggerConfig(): any;
  export function createLogger(scope?: string): any;
  export function configureTracing(options?: any): any;
  export function getTracingConfig(): any;
  export function createTracer(scope?: string): any;
  export function startSpan(name: string, options?: any): any;
  export function runWithSpan<T>(span: any, fn: () => T): T;
  export function getActiveSpan(): any;
  export function getSpanTraceparent(span?: any): string;
  export function parseTraceparent(value: string): any;
  export function formatTraceparent(context: any): string;
  export function extractTraceparent(request: any): any;
  export function onFrameworkEvent(listener: (event: any) => void): () => void;
  export function emitFrameworkEvent(event: any): void;
  export function configureResourceCache(options?: { maxEntries?: number }): {
    maxEntries: number;
    size: number;
  };
  export function invalidateResource(key: string): void;
  export function prefetchResource<T>(
    key: string,
    fetcher: (context?: { signal?: AbortSignal; requestId: number }) => Promise<T>,
    options?: { force?: boolean; dedupe?: boolean; timeoutMs?: number; signal?: AbortSignal }
  ): Promise<T>;
  export function webSocketSignal<T>(url: string, initialValue: T): Signal<T>;
  export function dbSignal<T>(tableName: string, options?: { query?: string }): Signal<T>;
  export function resetResourceCounter(): void;
  export function resolvePendingResources(signal?: AbortSignal | null): Promise<void>;
  // CachouChild re-export for consumers typing views
  export type { CachouChild };
}
