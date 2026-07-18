declare module "cachoujs" {
  /** Reactive read: signal getter or plain value. */
  export type Accessor<T> = () => T;
  export type MaybeAccessor<T> = T | Accessor<T>;
  export type SignalGetter<T> = Accessor<T>;
  export type SignalSetter<T> = (value: T | ((prev: T) => T)) => void;
  export type Signal<T> = [SignalGetter<T>, SignalSetter<T>];
  /** DOM / view nodes returned by components and control flow. */
  export type CachouChild =
    | Node
    | string
    | number
    | boolean
    | null
    | undefined
    | CachouChild[]
    | Accessor<CachouChild>;
  export type Component<P = Record<string, never>> = (props: P) => CachouChild;
  export interface EqualityOptions<T> {
    equals?: false | ((a: T, b: T) => boolean);
  }

  export function signal<T>(initialValue: T, options?: EqualityOptions<T> & { name?: string }): Signal<T>;
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
  export function onFrameworkEvent(listener: (event: { type: string; time: number; [key: string]: any }) => void): () => void;
  export function emitFrameworkEvent(event: { type: string; [key: string]: any }): void;
  export type CachouLogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";
  export interface CachouLogEntry {
    time: number;
    level: CachouLogLevel;
    eventType: string;
    scope?: string;
    message?: string;
    error?: { name: string; message: string; stack?: string; cause?: any };
    [key: string]: any;
  }
  export function configureLogger(options?: {
    level?: CachouLogLevel;
    includeStack?: boolean;
    sink?: ((entry: CachouLogEntry) => void) | null;
  }): { level: CachouLogLevel; includeStack: boolean; hasSink: boolean };
  export function getLoggerConfig(): { level: CachouLogLevel; includeStack: boolean; hasSink: boolean };
  export function createLogger(scope?: string): {
    error(message: string, details?: Record<string, any>): void;
    warn(message: string, details?: Record<string, any>): void;
    info(message: string, details?: Record<string, any>): void;
    debug(message: string, details?: Record<string, any>): void;
    trace(message: string, details?: Record<string, any>): void;
  };
  export interface CachouSpanContext {
    traceId: string;
    spanId: string;
    traceFlags: number;
  }
  export interface CachouSpan {
    isRecording(): boolean;
    spanContext(): CachouSpanContext | null;
    setAttribute(key: string, value: any): CachouSpan;
    setAttributes(attributes: Record<string, any>): CachouSpan;
    addEvent(name: string, attributes?: Record<string, any>): CachouSpan;
    recordException(error: any): CachouSpan;
    setStatus(status?: { code?: "UNSET" | "OK" | "ERROR"; message?: string }): CachouSpan;
    end(endTime?: number): CachouSpan;
  }
  export interface CachouSpanExport {
    name: string;
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    traceFlags: number;
    startTime: number;
    endTime: number;
    durationMs: number;
    attributes: Record<string, any>;
    events: Array<{ name: string; time: number; attributes: Record<string, any> }>;
    status: { code: "UNSET" | "OK" | "ERROR"; message?: string };
  }
  export function configureTracing(options?: {
    enabled?: boolean;
    sampleRate?: number;
    exporter?: ((span: CachouSpanExport) => void) | { export: (span: CachouSpanExport) => void } | null;
  }): { enabled: boolean; sampleRate: number; hasExporter: boolean };
  export function getTracingConfig(): { enabled: boolean; sampleRate: number; hasExporter: boolean };
  export function startSpan(name: string, options?: { parent?: CachouSpan; traceparent?: string | CachouSpanContext; attributes?: Record<string, any> }): CachouSpan;
  export function runWithSpan<T>(span: CachouSpan, fn: () => T): T;
  export function getActiveSpan(): CachouSpan | null;
  export function getSpanTraceparent(span?: CachouSpan | null): string;
  export function parseTraceparent(value: string): CachouSpanContext | null;
  export function formatTraceparent(context: CachouSpanContext | null): string;
  export function extractTraceparent(request: any): CachouSpanContext | null;
  export function createTracer(scope?: string): {
    startSpan(name: string, options?: { parent?: CachouSpan; traceparent?: string | CachouSpanContext; attributes?: Record<string, any> }): CachouSpan;
    withSpan<T>(name: string, fn: () => T, options?: { parent?: CachouSpan; traceparent?: string | CachouSpanContext; attributes?: Record<string, any> }): T;
  };
  export function mapArray<T, U>(
    list: SignalGetter<T[]> | T[],
    mapFn: (item: T, index: number) => U,
    keyFn?: (item: T, index: number) => unknown,
    options?: { reactiveItems?: boolean; uniqueKeys?: boolean }
  ): () => U[];

  export function html(strings: TemplateStringsArray, ...values: any[]): HTMLElement | HTMLElement[];
  export function htmlStatic(markup: string): HTMLElement | HTMLElement[] | DocumentFragment;
  export function createCompiledStatic(markup: string, factory?: () => Node | DocumentFragment): any;

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
  export function configureResourceCache(options?: { maxEntries?: number }): { maxEntries: number; size: number };
  export function invalidateResource(key: string): void;
  export function prefetchResource<T>(
    key: string,
    fetcher: (context?: { signal?: AbortSignal; requestId: number }) => Promise<T>,
    options?: { force?: boolean; dedupe?: boolean; timeoutMs?: number; signal?: AbortSignal }
  ): Promise<T>;

  export function webSocketSignal<T>(url: string, initialValue: T): Signal<T>;

  export function dehydrate(context?: SSRContext, options?: { nonce?: string }): string;
  export function getSSRHead(context?: SSRContext): string;
  export function resetResourceCounter(): void;
  export function resolvePendingResources(): Promise<void>;
  export function hydrate(Component: () => any, root: HTMLElement): void;
  export function render(Component: () => any, root: HTMLElement): void;
  export function mount(Component: () => any, root: HTMLElement): () => void;
  export function unmount(root: HTMLElement): void;
  export function renderToString(Component: () => any, options?: {
    path?: string;
    request?: any;
    traceparent?: string;
    context?: SSRContext;
  }): string;
  export function renderToStringAsync(Component: (data?: any) => any, options?: {
    path?: string;
    request?: any;
    signal?: AbortSignal;
    traceparent?: string;
    context?: SSRContext;
    preload?: (context: { request: any; signal: AbortSignal | null }) => any | Promise<any>;
  }): Promise<string>;
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
  /** Basic untrusted-HTML sanitizer (defense-in-depth; prefer DOMPurify for rich text). */
  export function sanitizeHTML(input: string): string;
  export function sanitizeAuthToken(token: unknown, options?: { maxLength?: number }): string | null;
  export function createCSPNonce(): string;
  export function buildContentSecurityPolicy(options?: {
    nonce?: string;
    allowInlineStyles?: boolean;
    allowInlineScripts?: boolean;
    connectSrc?: string[];
    imgSrc?: string[];
    extraDirectives?: string[];
  }): string;
  export function buildSecurityHeaders(options?: {
    nonce?: string;
    allowInlineStyles?: boolean;
    allowInlineScripts?: boolean;
    connectSrc?: string[];
    imgSrc?: string[];
    extraDirectives?: string[];
    includeCOOP?: boolean;
  }): Record<string, string>;
  export function applySecurityHeaders(
    res: { setHeader: (name: string, value: string) => void },
    headers: Record<string, string>
  ): void;

  export type StabilityLabel = "stable" | "candidate" | "experimental" | "unlisted";
  export const STABLE_EXPORTS: readonly string[];
  export const CANDIDATE_EXPORTS: readonly string[];
  export const EXPERIMENTAL_EXPORTS: readonly string[];
  export function getExportStability(name: string): StabilityLabel;
  export function listExportsByStability(
    label?: StabilityLabel
  ): string[] | Array<{ name: string; stability: StabilityLabel }>;

  export function renderApplication(
    Component: any,
    options?: {
      path?: string;
      request?: any;
      signal?: AbortSignal | null;
      context?: SSRContext;
      preload?: (args: { request: any; signal?: AbortSignal | null }) => any | Promise<any>;
      traceparent?: string;
      nonce?: string;
      mode?: "async" | "stream";
    }
  ): Promise<{
    html: string;
    head: string;
    state: string;
    context: SSRContext;
    stream?: ReadableStream | AsyncGenerator<any, any, any>;
  }>;
  export function htmlDocument(parts: {
    html: string;
    head?: string;
    state?: string;
    title?: string;
    lang?: string;
    bodyAttrs?: string;
    scripts?: string;
    styles?: string;
  }): string;
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

  export function Show<T>(props: {
    when: MaybeAccessor<T | false | null | undefined>;
    children?: CachouChild | ((value: NonNullable<T>) => CachouChild);
    fallback?: MaybeAccessor<CachouChild>;
  }): Accessor<CachouChild>;
  export function Switch(props: {
    children?: CachouChild | CachouChild[];
    fallback?: MaybeAccessor<CachouChild>;
  }): Accessor<CachouChild>;
  export function Match<T>(props: {
    when: MaybeAccessor<T | false | null | undefined>;
    children?: CachouChild | ((value: NonNullable<T>) => CachouChild);
  }): Accessor<null>;
  export function For<T>(props: {
    each: MaybeAccessor<readonly T[] | T[] | null | undefined>;
    children: (item: T, index: number) => CachouChild;
    by?: (item: T, index: number) => unknown;
    fallback?: MaybeAccessor<CachouChild>;
    uniqueKeys?: boolean;
  }): Accessor<CachouChild>;
  export function Index<T>(props: {
    each: MaybeAccessor<readonly T[] | T[] | null | undefined>;
    children: (item: Accessor<T | undefined>, index: number) => CachouChild;
    fallback?: MaybeAccessor<CachouChild>;
  }): Accessor<CachouChild>;
  export function KeepAlive(props: {
    max?: number;
    include?: string[];
    exclude?: string[];
    onActivate?: (key: string) => void;
    onDeactivate?: (key: string) => void;
    children?: MaybeAccessor<CachouChild>;
  }): HTMLElement | Accessor<CachouChild>;
  export function splitProps<T extends object, K extends readonly (keyof T)[]>(
    props: T,
    ...keyGroups: K[]
  ): [...{ [I in keyof K]: Pick<T, Extract<K[I][number], keyof T>> }, Omit<T, K[number][number]>];
  export function mergeProps<T extends object>(...sources: Array<Partial<T> | null | undefined>): T;
  export function Dynamic<P extends Record<string, any> = Record<string, any>>(props: {
    component: Component<P> | string | Accessor<Component<P> | string>;
    children?: CachouChild;
  } & P): Accessor<CachouChild>;
  export function directive(
    name: string,
    handler: (el: Element, accessor: Accessor<any>) => void | (() => void)
  ): () => void;
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
    mutate: (input: TInput, mutateOptions?: { signal?: AbortSignal }) => Promise<TResult>;
    pending: SignalGetter<boolean>;
    error: SignalGetter<any>;
    data: SignalGetter<TResult | undefined>;
    reset: () => void;
    dispose: () => void;
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
  export type MiddlewareNext = (result?: false | string) => void | Promise<void>;
  export type MiddlewareHandler = (
    to: string,
    from: string,
    next: MiddlewareNext,
    signal?: AbortSignal
  ) => any | Promise<any>;
  export function guard(handler: MiddlewareHandler): () => void;
  /** @deprecated Use `guard()` instead — removal reserved for a future major. */
  export function addMiddleware(
    handler: MiddlewareHandler
  ): () => void;
  export function getHistoryMode(): string;
  export function go(delta: number): boolean;
  export function back(): boolean;
  export function forward(): boolean;
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
  export function renderToStream(Component: (data?: any) => any, options?: {
    path?: string;
    request?: any;
    signal?: AbortSignal;
    shell?: boolean;
    /** Progressive first-paint shell (default true). Set false for classic two-pass document. */
    progressive?: boolean;
    /** CSP nonce for inline dehydrate / head-update scripts. */
    nonce?: string;
    traceparent?: string;
    context?: SSRContext;
    preload?: (context: { request: any; signal: AbortSignal | null }) => any | Promise<any>;
  }): ReadableStream | AsyncGenerator<string>;
  export function Island(props: {
    hydrate?: "load" | "idle" | "visible" | "false" | false;
    id?: string;
    /** SSR/static placeholder when distinct from interactive children. */
    fallback?: any;
    children?: any;
  }): any;
  export function hydrateIslands(
    root?: ParentNode | null,
    ComponentMap?: Record<string, any>,
    options?: {
      onError?: (err: Error, id: string, node: Element) => void;
      rootMargin?: string;
    }
  ): () => void;
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
  export type SSRContext = {
    id: string;
    ssrCache: Record<string | number, any>;
    resourceCache?: Map<any, any>;
    resourceInflight?: Map<any, Promise<any>>;
    resourceCounter: number;
    resourcesStarted: number;
    pendingResources: Set<Promise<any>>;
    head: { title: string; meta: any[]; links?: any[]; jsonld?: any[]; scripts?: any[] };
    request?: any;
    signal?: AbortSignal | null;
  };
  export function createSSRContext(): SSRContext;
  export function runWithSSRContext<T>(context: SSRContext, fn: () => T): T;
  export function runWithSSRContextAsync<T>(context: SSRContext, fn: () => Promise<T>): Promise<T>;
  export function Link(props: { href: string; class?: string; children: any }): HTMLElement;
  export function navigate(path: string, options?: { replace?: boolean; scroll?: boolean; focus?: boolean; viewTransition?: boolean }): boolean;
  export function beforeNavigate(handler: (event: { from: string; to: string; replace: boolean; signal: AbortSignal }) => boolean | void | Promise<boolean | void>): () => void;
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

  // Styles (0.4.2) — match `cachoujs/styles` signatures
  export function css(strings: TemplateStringsArray, ...values: any[]): string;
  export function cssVar(
    name: string,
    signalGetter: Accessor<string | number | null | undefined>,
    el?: HTMLElement
  ): () => void;
  export function theme(tokens: Record<string, string | number>): {
    vars: Record<string, string>;
    className: string;
    apply(el: HTMLElement): void;
  };
  export function globalCSS(cssText: string): void;
  export function cx(
    ...args: Array<string | false | null | undefined | Record<string, boolean> | Array<any>>
  ): string;
  export function keyframes(
    name: string,
    frames: Record<string, string | Record<string, string>>
  ): string;

  // Transitions (0.4.2)
  export function linear(t: number): number;
  export function easeIn(t: number): number;
  export function easeOut(t: number): number;
  export function easeInOut(t: number): number;
  export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number;
  export function defineTransition(config: {
    enter?: (node: Element, options: any) => Animation | void | Promise<void>;
    leave?: (node: Element, options: any) => Animation | void | Promise<void>;
  }): (options?: any) => any;
  export function fade(options?: any): any;
  export function slide(options?: any): any;
  export function fly(options?: any): any;
  export function scale(options?: any): any;
  export function swap(options?: any): any;
  export function transition(options?: any): any;

  // Image (0.4.2+)
  export function resolveAspectRatio(
    aspectRatio: string | number | undefined,
    width: number | undefined,
    height: number | undefined
  ): { width: number | undefined; height: number | undefined };
  export function buildSrcSet(
    source: string | ((width: number) => string),
    widths: number[],
    options?: { density?: boolean; format?: (url: string, width: number) => string }
  ): string;
  export function buildSizes(
    rules: Array<{ max?: number; size: string } | string>
  ): string;
  export function responsiveImageProps(options: {
    src: string | ((width: number) => string);
    widths?: number[];
    sizes?: Array<{ max?: number; size: string } | string> | string;
    defaultWidth?: number;
    alt?: string;
    [key: string]: any;
  }): Record<string, any>;
  export function Image(props: Record<string, any>): any;
  export function Picture(props: Record<string, any>): any;
  export function Video(props: Record<string, any>): any;

  // App / plugins (0.4.2)
  export interface App {
    plug(plugin: any): App;
    provide(key: string | symbol, value: any): App;
    component(name: string, component: any): App;
    directive(name: string, handler: any): App;
    mount(target: string | HTMLElement): () => void;
    unmount(): void;
    config: Record<string, any>;
  }
  export function launch(rootComponent: any, rootProps?: object): App;
  export function createApp(rootComponent: any, rootProps?: object): App;
  export function getApp(): App | null;
  /** @deprecated Use getApp() — removal reserved for a future major. */
  export function useApp(): App | null;

  // Content collections (0.4.2 / build pipeline 0.6.3)
  export const z: {
    string(): { validate(value: any): { valid: boolean; errors?: string[] } };
    number(): { validate(value: any): { valid: boolean; errors?: string[] } };
    boolean(): { validate(value: any): { valid: boolean; errors?: string[] } };
    date(): { validate(value: any): { valid: boolean; errors?: string[] } };
    array(item?: any): { validate(value: any): { valid: boolean; errors?: string[] } };
    object(shape?: Record<string, any>): { validate(value: any): { valid: boolean; errors?: string[] } };
    optional(inner: any): { validate(value: any): { valid: boolean; errors?: string[] } };
    enum(values: readonly any[]): { validate(value: any): { valid: boolean; errors?: string[] } };
    [key: string]: any;
  };
  export function defineCollection(config: {
    name: string;
    schema?: any;
    directory?: string;
    [key: string]: any;
  }): any;
  export function getCollection(collection: string | any): any[];
  export function getEntry(collection: string | any, slug: string): any;
  export function parseFrontmatter(content: string): { data: Record<string, any>; body: string };
  export function loadContent(collectionConfigs: any[]): Promise<any>;
  export function addEntries(collection: string | any, entries: any[]): void;
  export function clearCollection(collection: string | any): void;
  export function exportContentManifest(
    names?: string | string[] | null,
    options?: { includeBody?: boolean; includeRaw?: boolean; onlyValid?: boolean }
  ): {
    version: 1;
    generatedAt: string;
    collections: Record<string, any[]>;
  };
  export function writeContentManifest(
    outPath: string,
    manifest?: any,
    options?: { pretty?: boolean }
  ): Promise<{ path: string; bytes: number; entryCount: number }>;
  export function routesFromCollection(
    collection: string | { name: string },
    options?: {
      prefix?: string;
      path?: (entry: any) => string;
      title?: (entry: any) => string | undefined;
      onlyValid?: boolean;
      includeIndex?: boolean;
      indexPath?: string;
      indexTitle?: string;
    }
  ): Array<{ path: string; title?: string; slug?: string; entry?: any }>;
  export function buildContent(
    collectionConfigs: any[],
    options?: {
      outPath?: string;
      includeBody?: boolean;
      includeRaw?: boolean;
      onlyValid?: boolean;
      pretty?: boolean;
      routeCollections?: any[];
    }
  ): Promise<{
    manifest: any;
    written: { path: string; bytes: number; entryCount: number } | null;
    routes: any[];
  }>;
}
