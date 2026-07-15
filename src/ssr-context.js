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
let fallback = createEmptyContext();
/** Last completed SSR context for sequential dehydrate()/getSSRHead() after render. */
let lastCompleted = null;

function createEmptyContext() {
  return {
    ssrCache: Object.create(null),
    resourceCounter: 0,
    pendingResources: new Set(),
    head: { title: "", meta: [] }
  };
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
    if (mod?.AsyncLocalStorage) {
      AsyncLocalStorageCtor = mod.AsyncLocalStorage;
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
  lastCompleted = context;
}

export function getLastSSRContext() {
  return lastCompleted;
}

export function runWithSSRContext(context, fn) {
  const storage = ensureALS();
  if (storage) {
    return storage.run(context, fn);
  }
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
    return storage.run(context, fn);
  }
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
}
