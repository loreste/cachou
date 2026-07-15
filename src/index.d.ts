declare module "cachoujs" {
  export type SignalGetter<T> = () => T;
  export type SignalSetter<T> = (value: T | ((prev: T) => T)) => void;
  export type Signal<T> = [SignalGetter<T>, SignalSetter<T>];

  export function signal<T>(initialValue: T): Signal<T>;
  export function effect(fn: () => void): () => void;
  export function createRoot<T>(fn: (dispose: () => void) => T): T;
  export function memo<T>(fn: () => T): () => T;
  export function store<T extends object>(initialValue: T): T;
  export function batch(fn: () => void): void;
  export function onCleanup(fn: () => void): void;
  export function onMount(fn: () => void): void;
  export function untrack<T>(fn: () => T): T;
  export function getOwner(): any;
  export function runWithOwner<T>(owner: any, fn: () => T): T;
  export function onFrameworkEvent(listener: (event: { type: string; time: number; [key: string]: any }) => void): () => void;
  export function emitFrameworkEvent(event: { type: string; [key: string]: any }): void;
  export function mapArray<T, U>(
    list: SignalGetter<T[]> | T[],
    mapFn: (item: T, index: number) => U,
    keyFn?: (item: T, index: number) => unknown,
    options?: { reactiveItems?: boolean; uniqueKeys?: boolean }
  ): () => U[];

  export function html(strings: TemplateStringsArray, ...values: any[]): HTMLElement | HTMLElement[];
  export function htmlStatic(markup: string): HTMLElement | HTMLElement[] | DocumentFragment;

  export interface Context<T> {
    Provider: (props: { value: T; children: any }) => () => any;
  }
  export function createContext<T>(defaultValue?: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;

  export function onError(handler: (err: Error) => void): void;
  export function ErrorBoundary(props: { children: any; fallback: any | ((err: Error, reset: () => void) => any) }): () => any;

  export function Portal(props: { mount?: HTMLElement; children: any }): Text;

  export function Suspense(props: { fallback: any; children: any }): HTMLDivElement;

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
      invalidate: () => void;
      getRequestId: () => number;
      getLatestAppliedRequestId: () => number;
    }
  ];
  export function invalidateResource(key: string): void;
  export function prefetchResource<T>(
    key: string,
    fetcher: (context?: { signal?: AbortSignal; requestId: number }) => Promise<T>,
    options?: { force?: boolean; dedupe?: boolean; timeoutMs?: number }
  ): Promise<T>;

  export function webSocketSignal<T>(url: string, initialValue: T): Signal<T>;

  export function dehydrate(): string;
  export function resetResourceCounter(): void;
  export function resolvePendingResources(): Promise<void>;
  export function hydrate(Component: () => any, root: HTMLElement): void;
  export function render(Component: () => any, root: HTMLElement): void;
  export function mount(Component: () => any, root: HTMLElement): () => void;
  export function unmount(root: HTMLElement): void;
  export function renderToString(Component: () => any): string;
  export function renderToStringAsync(Component: () => any): Promise<string>;
  export function lazy<T>(loader: () => Promise<{ default: T } | T>): T;
  export function configureSecurityPolicy(options?: {
    allowedURLProtocols?: string[];
    allowedDataMimeTypes?: string[];
    allowInlineStyles?: boolean;
  }): {
    allowedURLProtocols: string[];
    allowedDataMimeTypes: string[];
    allowInlineStyles: boolean;
  };
  export function getSecurityPolicy(): {
    allowedURLProtocols: string[];
    allowedDataMimeTypes: string[];
    allowInlineStyles: boolean;
  };
  export function trustedHTML(value: string): any;
  export type RouteLoadContext = {
    params: Record<string, string>;
    path: string;
    query: Record<string, string>;
    signal?: AbortSignal;
    requestId?: number;
  };
  export type RouteLoadState<T = any> = {
    data: SignalGetter<T | undefined>;
    loading: SignalGetter<boolean>;
    error: SignalGetter<any>;
    refetch: () => Promise<void>;
    params: Record<string, string>;
  };
  export function Router(props: { children: any }): HTMLElement;
  export function Route(props: {
    path: string;
    component: any;
    load?: (ctx: RouteLoadContext) => any | Promise<any>;
    fallback?: any;
    error?: any | ((err: any, retry: () => void) => any);
  }): () => any;
  export function Layout(props: {
    path: string;
    component: any;
    children?: any[] | any;
  }): () => any;
  export function Outlet(): () => any;
  export function NotFound(props?: { component?: any; children?: any }): () => any;
  export function getRouteData(): any;
  export function useRouteData<T = any>(): RouteLoadState<T>;

  export function Show(props: {
    when: any;
    children?: any;
    fallback?: any;
  }): () => any;
  export function Switch(props: { children?: any; fallback?: any }): () => any;
  export function Match(props: { when: any; children?: any }): () => any;
  export function For(props: {
    each: any[] | (() => any[]);
    children: (item: any, index: number) => any;
    by?: (item: any, index: number) => unknown;
    fallback?: any;
    uniqueKeys?: boolean;
  }): () => any;
  export function Index(props: {
    each: any[] | (() => any[]);
    children: (item: () => any, index: number) => any;
    fallback?: any;
  }): () => any;
  export function splitProps(props: object, ...keyGroups: string[][]): object[];
  export function mergeProps(...sources: Array<object | null | undefined>): any;
  export function Dynamic(props: { component: any; children?: any; [key: string]: any }): () => any;
  export function directive(name: string, handler: (el: Element, accessor: () => any) => void | (() => void)): () => void;
  export function createMutation<TInput = any, TResult = any>(
    mutationFn: (input: TInput, ctx: { signal?: AbortSignal }) => Promise<TResult>,
    options?: {
      onMutate?: (input: TInput) => any | Promise<any>;
      onSuccess?: (data: TResult, input: TInput, context: any) => void;
      onError?: (err: any, input: TInput, context: any) => void;
      onSettled?: (data: TResult | undefined, err: any, input: TInput, context: any) => void;
      invalidateKeys?: string[];
    }
  ): {
    mutate: (input: TInput) => Promise<TResult>;
    pending: SignalGetter<boolean>;
    error: SignalGetter<any>;
    data: SignalGetter<TResult | undefined>;
    reset: () => void;
  };
  export function getQueryData(key: string): any;
  export function setQueryData(key: string, data: any): void;
  export function subscribeQuery(key: string, fn: (data: any) => void): () => void;
  export function invalidateQuery(key: string): void;
  export function optimisticUpdate(key: string, updater: any): { previous: any; rollback: () => void };
  export function persist(
    signalPair: Signal<any>,
    options: {
      key: string;
      storage?: Storage;
      serialize?: (v: any) => string;
      deserialize?: (s: string) => any;
      sync?: boolean;
    }
  ): () => void;
  export function virtualList(props: {
    each: any[] | (() => any[]);
    itemHeight: number;
    height: number;
    overscan?: number;
    children: (item: any, index: number) => any;
  }): {
    windowed: SignalGetter<any>;
    scrollTop: SignalGetter<number>;
    setScrollTop: SignalSetter<number>;
    onScroll: (event: any) => void;
  };
  export function Dialog(props: {
    open: boolean | (() => boolean);
    onClose?: () => void;
    title?: string;
    children?: any;
    modal?: boolean;
  }): () => any;
  export function configureRouter(options?: {
    history?: "browser" | "hash" | "memory";
    initialPath?: string;
  }): { history: string };
  export function getHistoryMode(): string;
  export function matchPath(routePath: string, path: string): { matches: boolean; params?: Record<string, string> };
  export function useParams(): SignalGetter<Record<string, string>>;
  export function useSearchParams(): [
    SignalGetter<Record<string, string>>,
    (next: Record<string, any> | ((prev: Record<string, string>) => Record<string, any>), options?: { replace?: boolean; replaceAll?: boolean }) => void
  ];
  export function useAction(): any;
  export function createAction(handler: (input: any, ctx?: any) => any | Promise<any>): {
    submit: (input?: any, ctx?: any) => Promise<any>;
    pending: SignalGetter<boolean>;
    error: SignalGetter<any>;
    result: SignalGetter<any>;
    Form: (props?: any) => any;
  };
  export function redirect(path: string, options?: { replace?: boolean }): never;
  export function notFound(message?: string): never;
  export function isRedirectError(err: any): boolean;
  export function isNotFoundError(err: any): boolean;
  export class RedirectError extends Error {
    path: string;
    options: any;
  }
  export class NotFoundError extends Error {}
  export function renderToStream(Component: any, options?: { path?: string; request?: any; shell?: boolean }): ReadableStream | AsyncGenerator<string>;
  export function Island(props: { hydrate?: "load" | "idle" | "visible" | "false" | false; id?: string; children?: any }): any;
  export function hydrateIslands(root?: ParentNode | null, ComponentMap?: Record<string, any>): void;
  export function getRequestEvent(): any;
  export function setRequestEvent(event: any): void;

  export function mountDevtools(options?: {
    parent?: HTMLElement;
    enableDebugMode?: boolean;
  }): () => void;
  export function unmountDevtools(): void;
  export function isDevtoolsOpen(): boolean;
  export function installDevtoolsHotkey(): () => void;

  export function filePathToRoutePath(filePath: string, options?: { routesDir?: string }): string;
  export function normalizeGlobModules(
    globMap: Record<string, any>,
    options?: { routesDir?: string }
  ): Array<{ key: string; loader: any; isLayout: boolean; path: string; depth: number }>;
  export function createFileRoutes(
    modules: Record<string, any>,
    options?: { notFound?: any }
  ): any[];
  export function createFileRoutesFromGlob(
    globMap: Record<string, () => Promise<any>>,
    options?: { notFound?: any; eager?: boolean; modules?: Record<string, any> }
  ): any[];
  export function fileRoutes(
    globMap: Record<string, () => Promise<any>>,
    options?: { notFound?: any }
  ): any[];
  export function applyProductionSecurityDefaults(): ReturnType<typeof configureSecurityPolicy>;
  export function installSSRAsyncHooks(asyncHooksModule: { AsyncLocalStorage: new () => any }): void;
  export function createSSRContext(): {
    ssrCache: Record<string | number, any>;
    resourceCounter: number;
    pendingResources: Set<Promise<any>>;
    head: { title: string; meta: any[] };
  };
  export function runWithSSRContext<T>(context: ReturnType<typeof createSSRContext>, fn: () => T): T;
  export function runWithSSRContextAsync<T>(context: ReturnType<typeof createSSRContext>, fn: () => Promise<T>): Promise<T>;
  export function Link(props: { href: string; class?: string; children: any }): HTMLElement;
  export function navigate(path: string, options?: { replace?: boolean; scroll?: boolean; focus?: boolean; viewTransition?: boolean }): boolean;
  export function beforeNavigate(handler: (event: { from: string; to: string; replace: boolean }) => boolean | void): () => void;
  export function getPath(): string;
  export function getQueryParams(): Record<string, string>;
  export function getRouteParams(): Record<string, string>;
  export function dbSignal<T>(tableName: string, options?: { query?: string }): Signal<T>;
  export type SchedulerPriority = "userBlocking" | "user-blocking" | "high" | "normal" | "background" | "low" | "idle";
  export interface ScheduledTask<T = any> {
    readonly priority: "userBlocking" | "normal" | "background" | "idle";
    readonly signal: AbortSignal | { aborted: boolean };
    status: "queued" | "running" | "completed" | "cancelled" | "failed";
    cancelled: boolean;
    finished: Promise<T | undefined>;
    cancel(): void;
  }
  export function scheduleTask<T>(
    fn: (context: {
      signal: AbortSignal | { aborted: boolean };
      priority: "userBlocking" | "normal" | "background" | "idle";
      shouldYield: () => boolean;
      yieldNow: () => Promise<void>;
    }) => T | Promise<T>,
    options?: { priority?: SchedulerPriority; signal?: AbortSignal }
  ): ScheduledTask<T>;
  export function yieldNow(): Promise<void>;
  export function configureScheduler(options?: { budgetMs?: number }): { budgetMs: number };
  export function startTransition(fn: () => void, options?: { cancelPrevious?: boolean }): Promise<void> | void;
  export function useTransition(): [SignalGetter<boolean>, (fn: () => void) => void];
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
  export function resetDebugState(): void;

  export function createField<T = string>(initialValue?: T, options?: {
    validate?: ((value: T, values?: any) => string | null | undefined | Promise<string | null | undefined>) | Array<(value: T, values?: any) => string | null | undefined | Promise<string | null | undefined>>;
    validateOnChange?: boolean;
  }): {
    value: SignalGetter<T>;
    setValue: SignalSetter<T>;
    error: SignalGetter<any>;
    setError: SignalSetter<any>;
    touched: SignalGetter<boolean>;
    setTouched: SignalSetter<boolean>;
    validating: SignalGetter<boolean>;
    dirty: SignalGetter<boolean>;
    valid: SignalGetter<boolean>;
    validate: (values?: any) => Promise<boolean>;
    reset: (nextValue?: T) => void;
  };
  export function createForm<T extends Record<string, any>>(initialValues: T, options?: {
    nested?: boolean;
    fields?: Partial<Record<string, Parameters<typeof createField>[1]>> & Partial<Record<keyof T, Parameters<typeof createField>[1]>>;
    validate?: (values: T) => any | Promise<any>;
    onSubmit?: (values: T, context: any) => any | Promise<any>;
  }): {
    fields: Record<string, ReturnType<typeof createField>>;
    field: (path: string) => ReturnType<typeof createField>;
    values: SignalGetter<T>;
    submitting: SignalGetter<boolean>;
    error: SignalGetter<any>;
    valid: SignalGetter<boolean>;
    dirty: SignalGetter<boolean>;
    validate: () => Promise<boolean>;
    reset: (nextValues?: T) => void;
    handleSubmit: (handler?: (values: T, context: any) => any | Promise<any>) => (event?: Event) => Promise<boolean>;
  };
  export function createLiveRegion(options?: { assertive?: boolean }): [(message: string) => void, HTMLElement | null];
  export function focusFirst(root: ParentNode): boolean;
  export function restoreFocusAfter<T>(fn: () => T): T;
  export function trapFocus(root: HTMLElement): () => void;

  export interface FileEntry {
    name: string;
    path: string;
    type: "directory" | "file" | "other";
    size: number;
    mtimeMs: number;
    extension: string;
  }

  export interface FileDirectory {
    root: string;
    path: string;
    parentPath: string | null;
    entries: FileEntry[];
  }

  export interface FileContent {
    name: string;
    path: string;
    size: number;
    mtimeMs: number;
    mime: string;
    kind: "text" | "binary";
    content: string;
    encoding: "utf8" | "base64";
  }

  export function listFiles(path?: string, options?: { includeHidden?: boolean }): Promise<FileDirectory>;
  export function readFile(path: string): Promise<FileContent>;
  export function createFileBrowser(initialPath?: string, options?: {
    includeHidden?: boolean;
    key?: string;
    staleTime?: number;
    revalidateOnFocus?: boolean;
  }): [
    SignalGetter<FileDirectory | undefined>,
    {
      loading: SignalGetter<boolean>;
      error: SignalGetter<any>;
      refetch: () => Promise<void>;
      mutate: (data: FileDirectory) => void;
      path: SignalGetter<string>;
      setPath: SignalSetter<string>;
      open: (path?: string) => Promise<void>;
      up: () => Promise<void>;
    }
  ];
  export function createFileContent(path: string | SignalGetter<string>, options?: {
    key?: string;
    staleTime?: number;
    revalidateOnFocus?: boolean;
  }): [
    SignalGetter<FileContent | null | undefined>,
    {
      loading: SignalGetter<boolean>;
      error: SignalGetter<any>;
      refetch: () => Promise<void>;
      mutate: (data: FileContent | null) => void;
    }
  ];

  export function FileBrowser(props?: {
    initialPath?: string;
    includeHidden?: boolean;
    key?: string;
    contentKey?: string;
    class?: string;
    onSelect?: (entry: FileEntry) => void;
  }): HTMLElement;
}
