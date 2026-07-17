/**
 * Per-request SSR isolation.
 *
 * Uses Node AsyncLocalStorage when available so concurrent SSR requests
 * do not share resource cache / head state. Falls back to a stack for
 * environments without ALS (tests, simple sequential renders).
 */

let AsyncLocalStorageCtor = null;
let als = null;
const stack = [];
const activeSSRContexts = new Set();
let contextSequence = 0;
let fallback = createEmptyContext();
/** Last completed SSR context for sequential dehydrate()/getSSRHead() after render. */
let lastCompleted = null;
let lastCompletedAmbiguous = false;
let fallbackRequest = null;

function createEmptyContext(id = null) {
  return {
    id: id || `ssr-${++contextSequence}`,
    ssrCache: Object.create(null),
    resourceCache: new Map(),
    resourceInflight: new Map(),
    resourceCounter: 0,
    resourcesStarted: 0,
    pendingResources: new Set(),
    head: { title: "", meta: [], links: [], jsonld: [], scripts: [] },
    request: null,
    path: "/",
    search: "",
    historyMode: "browser",
    memoryPath: "/",
    memorySearch: "",
    memoryEntries: [{ path: "/", search: "" }],
    memoryIndex: 0,
    routeParams: {},
    routeData: undefined,
    notFound: false
  };
}

function createSerializationSnapshot(context) {
  const snapshot = createEmptyContext(context.id);
  snapshot.ssrCache = context.ssrCache;
  snapshot.head = context.head;
  snapshot.path = context.path || "/";
  snapshot.search = context.search || "";
  snapshot.historyMode = context.historyMode || "browser";
  snapshot.memoryPath = context.memoryPath || "/";
  snapshot.memorySearch = context.memorySearch || "";
  snapshot.routeParams = context.routeParams ? { ...context.routeParams } : {};
  snapshot.notFound = context.notFound === true;
  return snapshot;
}

function isSSRContext(value) {
  return Boolean(value && value.ssrCache && value.pendingResources && value.head);
}

/** Mark a renderer as active and record overlap so implicit serialization can fail closed. */
export function beginSSRRender(context) {
  if (!isSSRContext(context)) {
    throw new TypeError("beginSSRRender requires a CachouJS SSR context.");
  }
  // A new render invalidates the implicit sequential slot until it completes.
  // This prevents a failed request from reusing a previous request's state.
  lastCompleted = null;
  lastCompletedAmbiguous = true;
  if (activeSSRContexts.size > 0) {
    context.overlapped = true;
    for (const active of activeSSRContexts) active.overlapped = true;
  }
  activeSSRContexts.add(context);
}

export function endSSRRender(context) {
  activeSSRContexts.delete(context);
}

/** Return the request context only while an SSR render is active. */
export function getActiveSSRContext() {
  const storage = ensureALS();
  if (storage) {
    const store = storage.getStore();
    if (store) return store;
  }
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/** Attach request bag (cookies, headers, url) for SSR loaders. */
export function setRequestEvent(event) {
  const activeContext = getActiveSSRContext();
  if (activeContext) {
    activeContext.request = event || null;
  } else {
    fallbackRequest = event || null;
  }
}

export function getRequestEvent() {
  const activeContext = getActiveSSRContext();
  return activeContext ? activeContext.request : fallbackRequest;
}

/** Consume a request bag set before an SSR context was entered. */
export function takeRequestEvent() {
  const event = fallbackRequest;
  fallbackRequest = null;
  return event;
}

function ensureALS() {
  if (als !== null || AsyncLocalStorageCtor === false) return als;
  if (typeof process === "undefined" || !process.versions?.node) {
    AsyncLocalStorageCtor = false;
    return null;
  }
  try {
    // Dynamic path keeps browser bundles from hard-failing on node builtins.
    // Vite SSR and Node can resolve this; client builds tree-shake SSR paths.
    const mod = globalThis.__CACHOU_ASYNC_HOOKS__ || null;
    const builtin = typeof process.getBuiltinModule === "function"
      ? process.getBuiltinModule("node:async_hooks")
      : null;
    const asyncHooks = mod?.AsyncLocalStorage ? mod : builtin;
    if (asyncHooks?.AsyncLocalStorage) {
      AsyncLocalStorageCtor = asyncHooks.AsyncLocalStorage;
      als = new AsyncLocalStorageCtor();
      return als;
    }
  } catch {
    // ignore
  }
  AsyncLocalStorageCtor = false;
  return null;
}

/** Optional: inject AsyncLocalStorage from Node entrypoints for concurrent SSR. */
export function installSSRAsyncHooks(asyncHooksModule) {
  if (asyncHooksModule?.AsyncLocalStorage) {
    globalThis.__CACHOU_ASYNC_HOOKS__ = asyncHooksModule;
    AsyncLocalStorageCtor = asyncHooksModule.AsyncLocalStorage;
    als = new AsyncLocalStorageCtor();
  }
}

export function getSSRContext() {
  const storage = ensureALS();
  if (storage) {
    const store = storage.getStore();
    if (store) return store;
  }
  if (stack.length > 0) return stack[stack.length - 1];
  if (lastCompleted) return lastCompleted;
  return fallback;
}

export function createSSRContext() {
  return createEmptyContext();
}

/** Remember context after render so dehydrate()/getSSRHead() work sequentially. */
export function setLastSSRContext(context) {
  if (!isSSRContext(context)) return;
  if (context.overlapped) {
    lastCompleted = null;
    lastCompletedAmbiguous = true;
    return;
  }
  // Implicit serialization only needs the state and head. Do not keep a
  // request object, resource cache, inflight promises, or route data alive
  // until the next SSR request arrives.
  lastCompleted = createSerializationSnapshot(context);
  lastCompletedAmbiguous = false;
}

export function getLastSSRContext() {
  return lastCompletedAmbiguous ? null : lastCompleted;
}

export function isLastSSRContextAmbiguous() {
  return lastCompletedAmbiguous;
}

export function runWithSSRContext(context, fn) {
  const storage = ensureALS();
  if (storage) {
    if (storage.getStore() === context) return fn();
    return storage.run(context, fn);
  }
  if (stack[stack.length - 1] === context) return fn();
  stack.push(context);
  try {
    return fn();
  } finally {
    stack.pop();
  }
}

export async function runWithSSRContextAsync(context, fn) {
  const storage = ensureALS();
  if (storage) {
    if (storage.getStore() === context) return fn();
    return storage.run(context, fn);
  }
  if (stack[stack.length - 1] === context) return fn();
  stack.push(context);
  try {
    return await fn();
  } finally {
    stack.pop();
  }
}

export function resetGlobalSSRFallback() {
  fallback = createEmptyContext();
  lastCompleted = null;
  lastCompletedAmbiguous = false;
  fallbackRequest = null;
}
