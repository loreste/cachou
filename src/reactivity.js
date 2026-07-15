import { getSSRContext, createSSRContext, runWithSSRContext, runWithSSRContextAsync, installSSRAsyncHooks, resetGlobalSSRFallback, setLastSSRContext } from "./ssr-context.js";

export { installSSRAsyncHooks, createSSRContext, runWithSSRContext, runWithSSRContextAsync, setLastSSRContext };

let activeEffect = null;
let activeOwner = null;
const effectStack = [];
let batchDepth = 0;
const batchedUpdates = new Set();
let activeErrorHandlers = [];
const frameworkEventListeners = new Set();
const scheduledQueues = {
  userBlocking: [],
  normal: [],
  background: [],
  idle: []
};
const schedulerPriorities = ["userBlocking", "normal", "background", "idle"];
const schedulerPriorityRank = {
  userBlocking: 0,
  normal: 1,
  background: 2,
  idle: 3
};
let schedulerFlushPending = false;
let schedulerFlushing = false;
let schedulerChannel = null;
let schedulerBudgetMs = 5;
let debugEnabled = false;
const debugState = {
  signals: new Set(),
  computations: new Set(),
  roots: new Set(),
  slowEffectThresholdMs: 8,
  strict: false
};

const resourceInflight = new Map();

function ssrCache() {
  return getSSRContext().ssrCache;
}

function pendingResources() {
  return getSSRContext().pendingResources;
}

export function onFrameworkEvent(listener) {
  frameworkEventListeners.add(listener);
  return () => frameworkEventListeners.delete(listener);
}

export function emitFrameworkEvent(event) {
  const normalized = {
    time: Date.now(),
    ...event
  };
  for (const listener of Array.from(frameworkEventListeners)) {
    try {
      listener(normalized);
    } catch (err) {
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("⚡ [CachouJS Event]: framework event listener failed.", err);
      }
    }
  }
}

export function resetResourceCounter() {
  getSSRContext().resourceCounter = 0;
}

export function dehydrate() {
  const cache = ssrCache();
  const json = JSON.stringify(cache)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  for (const k in cache) {
    delete cache[k];
  }
  return `<script id="__CACHOU_STATE__">window.__CACHOU_STATE__ = ${json};</script>`;
}

export async function resolvePendingResources() {
  const pending = pendingResources();
  while (pending.size > 0) {
    await Promise.all(Array.from(pending));
  }
}

export function onError(handler) {
  activeErrorHandlers.push(handler);
  onCleanup(() => {
    const idx = activeErrorHandlers.indexOf(handler);
    if (idx !== -1) {
      activeErrorHandlers.splice(idx, 1);
    }
  });
}

export function handleError(err) {
  emitFrameworkEvent({ type: "error", error: err });
  if (activeErrorHandlers.length > 0) {
    activeErrorHandlers[activeErrorHandlers.length - 1](err);
  } else {
    console.error("⚡ [CachouJS Uncaught Reactive Error]:", err);
    throw err;
  }
}

export function enableDebug(options = {}) {
  debugEnabled = true;
  if (typeof options.slowEffectThresholdMs === "number") {
    debugState.slowEffectThresholdMs = options.slowEffectThresholdMs;
  }
  if (typeof options.strict === "boolean") {
    debugState.strict = options.strict;
  }
}

export function disableDebug() {
  debugEnabled = false;
  debugState.strict = false;
}

export function getDebugSnapshot() {
  const computations = Array.from(debugState.computations);
  const roots = Array.from(debugState.roots);
  const liveComputations = computations.filter(item => !item.disposed);
  const liveRoots = roots.filter(item => !item.disposed);
  return {
    enabled: debugEnabled,
    strict: debugState.strict,
    signals: debugState.signals.size,
    computations: computations.length,
    roots: roots.length,
    disposedComputations: computations.filter(item => item.disposed).length,
    disposedRoots: roots.filter(item => item.disposed).length,
    liveComputations: liveComputations.length,
    liveRoots: liveRoots.length,
    orphanComputations: liveComputations.filter(item => !item.owner).length
  };
}

export function assertNoReactiveLeaks(label = "reactive leak check") {
  const snapshot = getDebugSnapshot();
  const leakingRoots = Array.from(debugState.roots).filter(item => !item.disposed);
  const leakingComputations = Array.from(debugState.computations).filter(item => !item.disposed && !item.owner);
  if (leakingRoots.length > 0 || leakingComputations.length > 0) {
    const error = new Error(
      `CachouJS ${label} failed: ${leakingRoots.length} live root(s), ${leakingComputations.length} orphan computation(s).`
    );
    emitFrameworkEvent({ type: "reactive-leak", label, snapshot, error });
    throw error;
  }
  return snapshot;
}

export function resetDebugState() {
  debugState.signals.clear();
  debugState.computations.clear();
  debugState.roots.clear();
}

function normalizeSchedulerPriority(priority) {
  if (priority === "high" || priority === "user-blocking" || priority === "userBlocking") return "userBlocking";
  if (priority === "low" || priority === "background") return "background";
  if (priority === "idle") return "idle";
  return "normal";
}

function scheduleFlush() {
  if (schedulerFlushPending) return;
  schedulerFlushPending = true;

  if (typeof scheduler !== "undefined" && typeof scheduler.postTask === "function") {
    scheduler.postTask(flushScheduledTasks, { priority: "user-visible" }).catch(() => {});
    return;
  }

  if (typeof MessageChannel !== "undefined") {
    if (!schedulerChannel) {
      schedulerChannel = new MessageChannel();
      schedulerChannel.port1.onmessage = flushScheduledTasks;
    }
    schedulerChannel.port2.postMessage(0);
    return;
  }

  setTimeout(flushScheduledTasks, 0);
}

function getNextScheduledTask() {
  for (const priority of schedulerPriorities) {
    const queue = scheduledQueues[priority];
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task.cancelled) return task;
      task.resolve(undefined);
    }
  }
  return null;
}

function hasScheduledTasks() {
  return schedulerPriorities.some(priority => scheduledQueues[priority].some(task => !task.cancelled));
}

function flushScheduledTasks() {
  schedulerFlushPending = false;
  if (schedulerFlushing) return;
  schedulerFlushing = true;
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    let task;
    while ((task = getNextScheduledTask())) {
      runScheduledTask(task);
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - start >= schedulerBudgetMs && hasScheduledTasks()) {
        scheduleFlush();
        break;
      }
    }
  } finally {
    schedulerFlushing = false;
  }
}

function runScheduledTask(task) {
  if (task.cancelled || task.signal.aborted) {
    task.cancel();
    return;
  }
  task.status = "running";
  const context = {
    signal: task.signal,
    priority: task.priority,
    shouldYield: () => shouldYieldToScheduler(task.priority),
    yieldNow
  };

  Promise.resolve()
    .then(() => task.fn(context))
    .then(
      value => {
        if (task.signal.aborted) {
          task.status = "cancelled";
          task.resolve(undefined);
        } else {
          task.status = "completed";
          task.resolve(value);
        }
      },
      err => {
        if (task.signal.aborted || (err && err.name === "AbortError")) {
          task.status = "cancelled";
          task.resolve(undefined);
        } else {
          task.status = "failed";
          task.reject(err);
        }
      }
    );
}

function shouldYieldToScheduler(priority = "normal") {
  const currentRank = schedulerPriorityRank[normalizeSchedulerPriority(priority)];
  for (const candidate of schedulerPriorities) {
    if (schedulerPriorityRank[candidate] < currentRank && scheduledQueues[candidate].some(task => !task.cancelled)) {
      return true;
    }
  }
  return false;
}

export function yieldNow() {
  return new Promise(resolve => {
    if (typeof scheduler !== "undefined" && typeof scheduler.postTask === "function") {
      scheduler.postTask(resolve, { priority: "user-visible" }).catch(() => setTimeout(resolve, 0));
      return;
    }
    setTimeout(resolve, 0);
  });
}

export function configureScheduler(options = {}) {
  if (typeof options.budgetMs === "number" && options.budgetMs > 0) {
    schedulerBudgetMs = options.budgetMs;
  }
  return { budgetMs: schedulerBudgetMs };
}

export function scheduleTask(fn, options = {}) {
  const transition = activeTransition;
  const priority = normalizeSchedulerPriority(options.priority || (transition ? "background" : "normal"));
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const signal = controller ? controller.signal : { aborted: false };
  let resolveFinished;
  let rejectFinished;
  const task = {
    fn,
    priority,
    signal,
    status: "queued",
    cancelled: false,
    resolve: value => resolveFinished(value),
    reject: err => rejectFinished(err),
    cancel() {
      if (task.cancelled) return;
      task.cancelled = true;
      task.status = "cancelled";
      if (controller && !controller.signal.aborted) {
        controller.abort();
      }
      resolveFinished(undefined);
    }
  };
  task.finished = new Promise((resolve, reject) => {
    resolveFinished = resolve;
    rejectFinished = reject;
  });

  if (options.signal) {
    if (options.signal.aborted) {
      task.cancel();
      return task;
    }
    options.signal.addEventListener("abort", task.cancel, { once: true });
  }
  if (transition) {
    transition.tasks.add(task);
    transition.promises.add(task.finished);
    if (transition.signal.aborted) {
      task.cancel();
      return task;
    }
    transition.signal.addEventListener("abort", task.cancel, { once: true });
  }

  scheduledQueues[priority].push(task);
  scheduleFlush();
  return task;
}

export function signal(initialValue, options = {}) {
  let value = initialValue;
  const subscribers = new Set();
  const equals = options.equals !== undefined ? options.equals : (a, b) => a === b;
  const debugInfo = {
    type: "signal",
    name: options.name || "",
    subscribers
  };
  if (debugEnabled) {
    debugState.signals.add(debugInfo);
  }

  const getter = () => {
    if (activeEffect) {
      subscribers.add(activeEffect);
      activeEffect.dependencies.add(subscribers);
    }
    return value;
  };
  getter.$$cachouSignal = { subscribers };

  const setter = (newValue) => {
    if (typeof newValue === 'function') {
      newValue = newValue(value);
    }
    if (!equals(value, newValue)) {
      value = newValue;
      if (batchDepth > 0) {
        for (const sub of subscribers) {
          batchedUpdates.add(sub);
        }
      } else {
        const subs = Array.from(subscribers);
        for (const sub of subs) {
          runSubscriber(sub);
        }
      }
    }
  };

  return [getter, setter];
}

export function effect(fn) {
  if (debugEnabled && debugState.strict && !activeOwner && !activeEffect) {
    emitFrameworkEvent({ type: "debug-warning", message: "effect created outside a root or owner scope" });
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn("⚡ [CachouJS Debug]: effect created outside a root or owner scope.");
    }
  }

  const effectObj = {
    type: "effect",
    dependencies: new Set(),
    cleanups: new Set(),
    owned: new Set(),
    owner: activeOwner,
    disposed: false,
    run() {
      if (this.disposed) return;
      const start = debugEnabled && typeof performance !== "undefined" ? performance.now() : 0;
      cleanupEffect(this);

      effectStack.push(this);
      const prevEffect = activeEffect;
      const prevOwner = activeOwner;
      activeEffect = this;
      activeOwner = this;

      try {
        fn();
      } catch (err) {
        handleError(err);
      } finally {
        activeEffect = prevEffect;
        activeOwner = prevOwner;
        effectStack.pop();
        if (debugEnabled && start) {
          const duration = performance.now() - start;
          if (duration > debugState.slowEffectThresholdMs) {
            emitFrameworkEvent({ type: "slow-effect", duration, threshold: debugState.slowEffectThresholdMs });
            console.warn(`⚡ [CachouJS Debug]: slow effect took ${duration.toFixed(2)}ms.`);
          }
        }
      }
    }
  };
  if (debugEnabled) {
    debugState.computations.add(effectObj);
  }

  if (activeOwner) {
    ensureOwned(activeOwner).add(effectObj);
  }

  effectObj.run();
  
  // Return a cleanup function for the effect
  return () => disposeEffect(effectObj);
}

export function createRoot(fn) {
  const root = {
    type: "root",
    dependencies: null,
    cleanups: null,
    owned: null,
    owner: activeOwner,
    disposed: false
  };
  if (debugEnabled) {
    debugState.roots.add(root);
  }
  const prevOwner = activeOwner;
  activeOwner = root;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    disposeEffect(root);
  };
  dispose._owner = root;
  dispose._debugTracked = debugEnabled;

  try {
    return fn(dispose);
  } finally {
    activeOwner = prevOwner;
  }
}

function cleanupEffect(eff) {
  // Dispose child computations owned by this effect before re-running it.
  if (eff.owned) {
    for (const child of eff.owned) {
      disposeEffect(child, false);
    }
    eff.owned.clear();
  }

  // Unsubscribe from all signals
  if (eff.dependencies) {
    for (const subscribers of eff.dependencies) {
      subscribers.delete(eff);
    }
    eff.dependencies.clear();
  }

  // Run registered cleanup callbacks
  if (eff.cleanups) {
    for (const cleanupFn of eff.cleanups) {
      try {
        cleanupFn();
      } catch (err) {
        console.error("Error in cleanup callback:", err);
      }
    }
    eff.cleanups.clear();
  }
}

function disposeEffect(eff, detachFromOwner = true) {
  if (eff.disposed) return;
  eff.disposed = true;
  cleanupEffect(eff);
  if (detachFromOwner && eff.owner) {
    eff.owner.owned?.delete(eff);
  }
}

export function onCleanup(fn) {
  const owner = activeOwner || activeEffect;
  if (owner) {
    ensureCleanups(owner).add(fn);
  } else {
    const message = "onCleanup must be called inside an active effect or root context.";
    if (debugEnabled && debugState.strict) {
      throw new Error(message);
    }
    console.warn(message);
  }
}

export function memo(fn, options = {}) {
  let value;
  let initialized = false;
  let dirty = true;
  const subscribers = new Set();
  const equals = options.equals !== undefined ? options.equals : (a, b) => a === b;

  const memoObj = {
    type: "memo",
    dependencies: new Set(),
    cleanups: new Set(),
    owned: new Set(),
    owner: activeOwner,
    disposed: false,
    run() {
      if (this.disposed || dirty) return;
      dirty = true;
      const subs = Array.from(subscribers);
      for (const sub of subs) {
        sub.run();
      }
    }
  };
  if (debugEnabled) {
    debugState.computations.add(memoObj);
  }

  if (activeOwner) {
    ensureOwned(activeOwner).add(memoObj);
  }

  const read = () => {
    if (activeEffect) {
      subscribers.add(activeEffect);
      activeEffect.dependencies.add(subscribers);
    }
    if (!dirty && initialized) {
      return value;
    }

    cleanupEffect(memoObj);

    const prevEffect = activeEffect;
    const prevOwner = activeOwner;
    activeEffect = memoObj;
    activeOwner = memoObj;
    try {
      const next = fn();
      if (!initialized || !equals(value, next)) {
        value = next;
      }
      initialized = true;
      dirty = false;
      return value;
    } catch (err) {
      handleError(err);
      return value;
    } finally {
      activeEffect = prevEffect;
      activeOwner = prevOwner;
    }
  };

  return read;
}

function ensureOwned(owner) {
  if (!owner.owned) {
    owner.owned = new Set();
  }
  return owner.owned;
}

function ensureCleanups(owner) {
  if (!owner.cleanups) {
    owner.cleanups = new Set();
  }
  return owner.cleanups;
}

export function batch(fn) {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      const updates = Array.from(batchedUpdates);
      batchedUpdates.clear();
      for (const sub of updates) {
        runSubscriber(sub);
      }
    }
  }
}

function runSubscriber(subscriber) {
  if (typeof subscriber === "function") {
    subscriber();
  } else {
    subscriber.run();
  }
}

const storeSignalsMap = new WeakMap();
const rawToStoreProxy = new WeakMap();
const storeProxyToRaw = new WeakMap();

function getSignalForProp(target, prop) {
  let props = storeSignalsMap.get(target);
  if (!props) {
    props = new Map();
    storeSignalsMap.set(target, props);
  }
  let sig = props.get(prop);
  if (!sig) {
    const [get, set] = signal(undefined, { equals: (a, b) => a === b });
    sig = { get, set };
    props.set(prop, sig);
  }
  return sig;
}

export function store(rawObj) {
  if (typeof rawObj !== "object" || rawObj === null) {
    return rawObj;
  }

  // If already reactive, return it
  if (storeProxyToRaw.has(rawObj)) return rawObj;

  const cachedProxy = rawToStoreProxy.get(rawObj);
  if (cachedProxy) return cachedProxy;

  const proxy = new Proxy(rawObj, {
    get(target, prop) {
      if (prop === "__isStore") return true;
      if (prop === "__raw") return target;

      const sig = getSignalForProp(target, prop);
      sig.get(); // Register dependency

      const val = Reflect.get(target, prop);
      if (typeof val === "object" && val !== null) {
        return store(val);
      }
      return val;
    },
    set(target, prop, value) {
      const oldVal = Reflect.get(target, prop);
      if (oldVal === value) return true;

      const success = Reflect.set(target, prop, value);
      if (success) {
        const sig = getSignalForProp(target, prop);
        sig.set(value); // Trigger subscribers
      }
      return success;
    },
    deleteProperty(target, prop) {
      const exists = Reflect.has(target, prop);
      const success = Reflect.deleteProperty(target, prop);
      if (exists && success) {
        const sig = getSignalForProp(target, prop);
        sig.set(undefined); // Trigger subscribers
      }
      return success;
    }
  });

  rawToStoreProxy.set(rawObj, proxy);
  storeProxyToRaw.set(proxy, rawObj);
  return proxy;
}

export function mapArray(listSignal, mapFn, keyFn, options = {}) {
  let cache = new Map();
  let uniqueCache = new Map();
  let uniqueKeysSnapshot = [];
  let uniqueEntriesSnapshot = [];
  let warnedMissingKey = false;
  let warnedDuplicateUniqueKey = false;
  const reactiveItems = options.reactiveItems !== false;
  const uniqueKeys = keyFn && options.uniqueKeys === true;

  return () => {
    const list = (typeof listSignal === "function" ? listSignal() : listSignal) || [];
    if (!keyFn && debugEnabled && debugState.strict && !warnedMissingKey && list.some(item => typeof item === "object" && item !== null)) {
      warnedMissingKey = true;
      const message = "mapArray received object items without an explicit key function; reorders may reuse the wrong row.";
      emitFrameworkEvent({ type: "debug-warning", message });
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn(`⚡ [CachouJS Debug]: ${message}`);
      }
    }

    if (uniqueKeys) {
      const keys = new Array(list.length);
      let isReverse = list.length > 1 && uniqueKeysSnapshot.length === list.length;
      for (let i = 0, j = list.length - 1; i < list.length; i++, j--) {
        const key = keyFn(list[i], i);
        keys[i] = key;
        if (isReverse && key !== uniqueKeysSnapshot[j]) {
          isReverse = false;
        }
      }
      if (debugEnabled && debugState.strict && !warnedDuplicateUniqueKey) {
        const seen = new Set();
        for (const key of keys) {
          if (seen.has(key)) {
            warnedDuplicateUniqueKey = true;
            const message = "mapArray uniqueKeys received duplicate keys; DOM reuse can become incorrect.";
            emitFrameworkEvent({ type: "debug-warning", message });
            if (typeof console !== "undefined" && typeof console.warn === "function") {
              console.warn(`⚡ [CachouJS Debug]: ${message}`);
            }
            break;
          }
          seen.add(key);
        }
      }

      if (isReverse) {
        const newUniqueCache = new Map();
        const result = new Array(list.length);
        const entries = new Array(list.length);
        let canReuseReverse = true;

        for (let i = 0, j = list.length - 1; i < list.length; i++, j--) {
          const item = list[i];
          const entry = uniqueEntriesSnapshot[j];

          if (reactiveItems && entry.item !== item) {
            if (entry.reactiveItem && typeof item === "object" && item !== null) {
              syncStoreObject(entry.reactiveItem, item);
            } else {
              canReuseReverse = false;
              break;
            }
          }

          entry.item = item;
          result[i] = entry.mapped;
          entries[i] = entry;
          newUniqueCache.set(keys[i], entry);
        }

        if (canReuseReverse) {
          uniqueCache = newUniqueCache;
          uniqueKeysSnapshot = keys;
          uniqueEntriesSnapshot = entries;
          return result;
        }
      }

      const newUniqueCache = new Map();
      const result = new Array(list.length);
      const entries = new Array(list.length);

      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const key = keys[i];
        let entry = uniqueCache.get(key);

        if (entry && reactiveItems && entry.item !== item) {
          if (entry.reactiveItem && typeof item === "object" && item !== null) {
            syncStoreObject(entry.reactiveItem, item);
            entry.item = item;
          } else {
            entry = undefined;
          }
        }

        let mapped = entry && entry.mapped;
        let mappedItem = entry && entry.mappedItem;
        let reactiveItem = entry && entry.reactiveItem;
        if (mapped === undefined) {
          mappedItem = reactiveItems && typeof item === "object" && item !== null ? store({ ...item }) : item;
          reactiveItem = mappedItem !== item ? mappedItem : null;
          mapped = runWithDetachedOwner(() => mapFn(mappedItem, i));
        }

        result[i] = mapped;
        entry = { item, mapped, mappedItem, reactiveItem };
        entries[i] = entry;
        newUniqueCache.set(key, entry);
      }

      uniqueCache = newUniqueCache;
      uniqueKeysSnapshot = keys;
      uniqueEntriesSnapshot = entries;
      return result;
    }

    const newCache = new Map();
    const result = [];
    const usedEntries = new Map();
    
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const key = keyFn ? keyFn(item, i) : item;
      const bucket = cache.get(key);
      let used = usedEntries.get(key);
      if (!used) {
        used = new Set();
        usedEntries.set(key, used);
      }

      const matchIndex = findMapEntryIndex(bucket, used, item, keyFn);
      let entry = matchIndex === -1 ? undefined : bucket[matchIndex];
      if (matchIndex !== -1) {
        used.add(matchIndex);
      }

      if (entry && keyFn && reactiveItems && entry.item !== item) {
        if (entry.reactiveItem && typeof item === "object" && item !== null) {
          syncStoreObject(entry.reactiveItem, item);
          entry.item = item;
        } else {
          entry = undefined;
        }
      }

      let mapped = entry && entry.mapped;
      let mappedItem = entry && entry.mappedItem;
      let reactiveItem = entry && entry.reactiveItem;
      if (mapped === undefined) {
        mappedItem = reactiveItems && keyFn && typeof item === "object" && item !== null ? store({ ...item }) : item;
        reactiveItem = mappedItem !== item ? mappedItem : null;
        mapped = runWithDetachedOwner(() => mapFn(mappedItem, i));
      }

      result.push(mapped);

      let newBucket = newCache.get(key);
      if (!newBucket) {
        newBucket = [];
        newCache.set(key, newBucket);
      }
      newBucket.push({ item, mapped, mappedItem, reactiveItem });
    }

    cache = newCache;
    
    return result;
  };
}

function runWithDetachedOwner(fn) {
  const prevOwner = activeOwner;
  activeOwner = null;
  try {
    return fn();
  } finally {
    activeOwner = prevOwner;
  }
}

function runWithoutTracking(fn) {
  const prevEffect = activeEffect;
  activeEffect = null;
  try {
    return fn();
  } finally {
    activeEffect = prevEffect;
  }
}

function findMapEntryIndex(bucket, used, item, keyFn) {
  if (!bucket) return -1;

  if (keyFn && typeof item === "object" && item !== null) {
    for (let i = 0; i < bucket.length; i++) {
      if (!used.has(i) && bucket[i].item === item) {
        return i;
      }
    }
  }

  for (let i = 0; i < bucket.length; i++) {
    if (!used.has(i)) {
      return i;
    }
  }

  return -1;
}

function syncStoreObject(target, source) {
  const nextKeys = new Set(Object.keys(source));
  for (const key of Object.keys(target.__raw || target)) {
    if (!nextKeys.has(key)) {
      delete target[key];
    }
  }
  for (const key of nextKeys) {
    target[key] = source[key];
  }
}

const resourceCache = new Map();
const focusListeners = new Set();
const reconnectListeners = new Set();

if (typeof window !== "undefined") {
  window.addEventListener("focus", () => {
    for (const listener of focusListeners) {
      listener();
    }
  });

  window.addEventListener("online", () => {
    for (const listener of reconnectListeners) {
      listener();
    }
  });
}

function makeTimeoutError(timeoutMs) {
  const err = new Error(`CachouJS resource timed out after ${timeoutMs}ms.`);
  err.name = "TimeoutError";
  return err;
}

function getCachedResource(key) {
  return resourceCache.get(key);
}

export function invalidateResource(key) {
  resourceCache.delete(key);
  resourceInflight.delete(key);
  emitFrameworkEvent({ type: "resource-invalidate", key });
}

export async function prefetchResource(key, fetcher, options = {}) {
  if (resourceCache.has(key) && options.force !== true) {
    return resourceCache.get(key).data;
  }
  if (options.dedupe !== false && resourceInflight.has(key)) {
    return resourceInflight.get(key);
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutId = null;
  const context = controller ? { signal: controller.signal, requestId: 0 } : { requestId: 0 };
  const promise = (async () => {
    if (options.timeoutMs && controller) {
      timeoutId = setTimeout(() => controller.abort(makeTimeoutError(options.timeoutMs)), options.timeoutMs);
    }
    try {
      const res = await fetcher(context);
      resourceCache.set(key, { data: res, timestamp: Date.now() });
      emitFrameworkEvent({ type: "resource-prefetch", key });
      return res;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      resourceInflight.delete(key);
    }
  })();
  resourceInflight.set(key, promise);
  return promise;
}

export function createResource(sourceOrFetcher, fetcherOrOptions = {}, maybeOptions = {}) {
  const hasSource = typeof fetcherOrOptions === "function";
  const source = hasSource ? sourceOrFetcher : null;
  const fetcher = hasSource ? fetcherOrOptions : sourceOrFetcher;
  const options = hasSource ? maybeOptions : fetcherOrOptions;
  const ctx = getSSRContext();
  const resourceIndex = ctx.resourceCounter++;
  const key = options.key || `res-${resourceIndex}`;
  const staleTime = options.staleTime ?? 0;
  let sourceInitialized = false;
  let lastSourceValue = hasSource ? runWithoutTracking(source) : undefined;
  const readKey = () => typeof key === "function" ? key(lastSourceValue) : key;
  const initialKey = readKey();
  
  let initialData = undefined;
  let initialLoading = true;
  const cache = ssrCache();
  
  if (typeof window !== "undefined" && !globalThis.__MOCK_SSR__ && window.__CACHOU_STATE__ && window.__CACHOU_STATE__[resourceIndex] !== undefined) {
    initialData = window.__CACHOU_STATE__[resourceIndex];
    initialLoading = false;
    resourceCache.set(initialKey, { data: initialData, timestamp: Date.now() });
  } else if (cache[resourceIndex] !== undefined) {
    initialData = cache[resourceIndex];
    initialLoading = false;
  } else if (resourceCache.has(initialKey)) {
    const cache = resourceCache.get(initialKey);
    initialData = cache.data;
    const age = Date.now() - cache.timestamp;
    if (age < staleTime) {
      initialLoading = false;
    }
  }

  const [data, setData] = signal(initialData);
  const [loading, setLoading] = signal(initialLoading);
  const [error, setError] = signal(null);
  const cancelPrevious = options.cancelPrevious !== false;
  let requestId = 0;
  let latestAppliedRequestId = 0;
  let activeController = null;

  const suspense = useContext(SuspenseContext);
  if (suspense) {
    const resourceId = Symbol();
    effect(() => {
      suspense.registerLoader(resourceId, loading());
    });
  }

  const mutate = (newData) => {
    requestId++;
    latestAppliedRequestId = requestId;
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    setData(() => newData);
    setLoading(false);
    setError(null);
    resourceCache.set(readKey(), { data: newData, timestamp: Date.now() });
  };

  const refetch = async () => {
    const transition = activeTransition;
    const showLoading = !transition;
    const currentRequestId = ++requestId;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const requestKey = readKey();
    let timeoutId = null;

    if (cancelPrevious && activeController) {
      activeController.abort();
    }
    activeController = controller;
    if (transition && controller) {
      if (transition.signal.aborted) {
        controller.abort();
      } else {
        transition.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    
    const promise = (async () => {
      try {
        const context = controller ? { signal: controller.signal, requestId: currentRequestId } : { requestId: currentRequestId };
        let fetchPromise;
        if (options.dedupe === true && resourceInflight.has(requestKey)) {
          fetchPromise = resourceInflight.get(requestKey);
        } else {
          fetchPromise = Promise.resolve(hasSource ? fetcher(lastSourceValue, context) : fetcher(context));
          if (options.timeoutMs) {
            fetchPromise = Promise.race([
              fetchPromise,
              new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                  if (controller) controller.abort();
                  reject(makeTimeoutError(options.timeoutMs));
                }, options.timeoutMs);
              })
            ]);
          }
          if (options.dedupe === true) {
            resourceInflight.set(requestKey, fetchPromise.finally(() => resourceInflight.delete(requestKey)));
          }
        }
        const res = await fetchPromise;
        if (currentRequestId < requestId) {
          emitFrameworkEvent({ type: "resource-stale-response", key: requestKey, requestId: currentRequestId, latestRequestId: requestId });
          return;
        }
        latestAppliedRequestId = currentRequestId;
        setData(() => res);
        resourceCache.set(requestKey, { data: res, timestamp: Date.now() });
        if (typeof window === "undefined" || !!globalThis.__MOCK_SSR__) {
          ssrCache()[resourceIndex] = res;
        }
      } catch (err) {
        if (err && err.name === "AbortError") {
          return;
        }
        if (currentRequestId >= requestId) {
          setError(err);
          emitFrameworkEvent({ type: "resource-error", key: requestKey, requestId: currentRequestId, error: err });
        }
      }
    })();
    
    pendingResources().add(promise);
    if (transition) {
      transition.promises.add(promise);
    }
    
    try {
      await promise;
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
      if (timeoutId) clearTimeout(timeoutId);
      if (showLoading && currentRequestId >= requestId) {
        setLoading(false);
      }
      pendingResources().delete(promise);
    }
  };

  if (typeof window !== "undefined") {
    if (options.revalidateOnFocus !== false) {
      const onFocus = () => {
        const cache = getCachedResource(readKey());
        if (!cache || Date.now() - cache.timestamp >= staleTime) {
          refetch();
        }
      };
      focusListeners.add(onFocus);
      onCleanup(() => focusListeners.delete(onFocus));
    }
    if (options.revalidateOnReconnect !== false) {
      const onReconnect = () => {
        refetch();
      };
      reconnectListeners.add(onReconnect);
      onCleanup(() => reconnectListeners.delete(onReconnect));
    }
  }

  if (initialLoading) {
    refetch();
  }

  if (hasSource) {
    effect(() => {
      const nextSourceValue = source();
      if (!sourceInitialized) {
        sourceInitialized = true;
        return;
      }
      lastSourceValue = nextSourceValue;
      refetch();
    });
  }

  return [data, { loading, error, refetch, mutate, invalidate: () => invalidateResource(readKey()), getRequestId: () => requestId, getLatestAppliedRequestId: () => latestAppliedRequestId }];
}

export function ErrorBoundary(props) {
  const [error, setError] = signal(null);
  const reset = () => setError(null);
  onError((err) => setError(err));

  return () => {
    const currentError = error();
    if (currentError) {
      return typeof props.fallback === "function" ? props.fallback(currentError, reset) : props.fallback;
    }
    try {
      return typeof props.children === "function" ? props.children() : props.children;
    } catch (err) {
      setError(err);
      return typeof props.fallback === "function" ? props.fallback(err, reset) : props.fallback;
    }
  };
}

export const SuspenseContext = createContext(null);

export function Suspense(props) {
  const loaders = new Set();
  const [isPending, setIsPending] = signal(false);

  const contextValue = {
    registerLoader(resourceId, isLoading) {
      if (isLoading) {
        loaders.add(resourceId);
      } else {
        loaders.delete(resourceId);
      }
      setIsPending(loaders.size > 0);
    }
  };

  const childrenContextValue = SuspenseContext.Provider({
    value: contextValue,
    children: () => typeof props.children === "function" ? props.children() : props.children
  });
  const childrenVal = childrenContextValue();

  const container = document.createElement("div");
  container.style.display = "contents";

  effect(() => {
    let val = isPending()
      ? (typeof props.fallback === "function" ? props.fallback() : props.fallback)
      : (typeof childrenVal === "function" ? childrenVal() : childrenVal);

    const nodes = [];
    if (val !== null && val !== undefined && val !== false) {
      if (Array.isArray(val)) {
        for (const item of val) {
          nodes.push(item instanceof Node ? item : document.createTextNode(String(item)));
        }
      } else {
        nodes.push(val instanceof Node ? val : document.createTextNode(String(val)));
      }
    }
    container.replaceChildren(...nodes);
  });

  return container;
}

export function Portal(props) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return typeof props.children === "function" ? props.children() : props.children;
  }

  const mount = props.mount || document.body;
  const container = document.createElement("div");
  container.style.display = "contents";

  effect(() => {
    let val = typeof props.children === "function" ? props.children() : props.children;
    const nodes = [];
    if (val !== null && val !== undefined && val !== false) {
      if (Array.isArray(val)) {
        for (const item of val) {
          nodes.push(item instanceof Node ? item : document.createTextNode(String(item)));
        }
      } else {
        nodes.push(val instanceof Node ? val : document.createTextNode(String(val)));
      }
    }
    container.replaceChildren(...nodes);
  });

  mount.appendChild(container);

  onCleanup(() => {
    container.remove();
  });

  return document.createTextNode("");
}

let currentContexts = new Map();
const contextStack = [];

export function createContext(defaultValue) {
  const contextObj = {
    defaultValue,
    Provider(props) {
      return () => {
        const prevContexts = new Map(currentContexts);
        currentContexts.set(contextObj, props.value);
        contextStack.push(prevContexts);
        
        try {
          const res = typeof props.children === "function" ? props.children() : props.children;
          return res;
        } finally {
          currentContexts = contextStack.pop();
        }
      };
    }
  };
  return contextObj;
}

export function useContext(context) {
  return currentContexts.has(context) ? currentContexts.get(context) : context.defaultValue;
}

export function webSocketSignal(url, options = {}) {
  const [message, setMessage] = signal(options.initialValue !== undefined ? options.initialValue : null);
  const [status, setStatus] = signal("CONNECTING");
  let ws;
  let reconnectDelay = 1000;
  let heartbeatTimer;
  let pingTimeoutTimer;
  const sendQueue = [];
  const eventListeners = new Map();

  const sendPing = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send("__ping__");
      pingTimeoutTimer = setTimeout(() => {
        console.warn("⚡ [CachouJS Client WS] Ping timeout. Reconnecting.");
        ws.close();
      }, 5000);
    }
  };

  const connect = () => {
    if (typeof window === "undefined") return;
    try {
      ws = new WebSocket(url);
      
      ws.onopen = () => {
        setStatus("OPEN");
        reconnectDelay = 1000;
        
        while (sendQueue.length > 0) {
          ws.send(sendQueue.shift());
        }

        clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(sendPing, 15000);
      };
      
      ws.onclose = () => {
        setStatus("CLOSED");
        clearInterval(heartbeatTimer);
        clearTimeout(pingTimeoutTimer);

        if (options.reconnect !== false) {
          const delay = reconnectDelay;
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          setTimeout(connect, delay);
        }
      };

      ws.onerror = () => setStatus("ERROR");

      ws.onmessage = (e) => {
        const dataStr = e.data;
        if (dataStr === "__pong__") {
          clearTimeout(pingTimeoutTimer);
          return;
        }

        let parsed = null;
        try {
          parsed = JSON.parse(dataStr);
        } catch (err) {}

        if (parsed && typeof parsed === "object") {
          const eventName = parsed.event || parsed.type;
          if (eventName) {
            const listeners = eventListeners.get(eventName);
            if (listeners) {
              const eventData = parsed.data !== undefined ? parsed.data : parsed;
              for (const cb of listeners) {
                cb(eventData);
              }
            }
          }
        }

        setMessage(parsed !== null ? parsed : dataStr);
      };
    } catch (err) {
      setStatus("ERROR");
    }
  };

  if (typeof window !== "undefined") {
    connect();
  }

  const send = (data) => {
    const payload = typeof data === "object" ? JSON.stringify(data) : data;
    if (typeof window !== "undefined" && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    } else {
      sendQueue.push(payload);
    }
  };

  const emit = (event, data) => {
    send({ event, data });
  };

  const on = (event, callback) => {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    eventListeners.get(event).add(callback);
    return () => {
      eventListeners.get(event)?.delete(callback);
    };
  };

  onCleanup(() => {
    clearInterval(heartbeatTimer);
    clearTimeout(pingTimeoutTimer);
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  });

  return [
    message,
    {
      send,
      emit,
      on,
      status,
      close: () => ws && ws.close(),
      getRawSocket: () => ws
    }
  ];
}

export function onMount(fn) {
  if (typeof window !== "undefined" && typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(() => {
      fn();
    });
  } else {
    fn();
  }
}

let sharedSocket = null;
const dbSignalListeners = new Map();
const socketQueue = [];
let sharedReconnectDelay = 1000;
let sharedHeartbeatTimer;
let sharedPingTimeoutTimer;

function getSharedSocket() {
  if (typeof window === "undefined") return null;
  if (sharedSocket) return sharedSocket;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  sharedSocket = new WebSocket(`${protocol}//${window.location.host}/ws-api`);

  const sendPing = () => {
    if (sharedSocket && sharedSocket.readyState === WebSocket.OPEN) {
      sharedSocket.send("__ping__");
      sharedPingTimeoutTimer = setTimeout(() => {
        console.warn("⚡ [CachouJS Shared WS] Ping timeout. Reconnecting.");
        sharedSocket.close();
      }, 5000);
    }
  };

  sharedSocket.onopen = () => {
    sharedReconnectDelay = 1000;
    while (socketQueue.length > 0) {
      sharedSocket.send(socketQueue.shift());
    }
    clearInterval(sharedHeartbeatTimer);
    sharedHeartbeatTimer = setInterval(sendPing, 15000);
  };

  sharedSocket.onmessage = (e) => {
    const dataStr = e.data;
    if (dataStr === "__pong__") {
      clearTimeout(sharedPingTimeoutTimer);
      return;
    }

    try {
      const msg = JSON.parse(dataStr);
      if (msg.type === "db-sync" && msg.table) {
        const listeners = dbSignalListeners.get(msg.table);
        if (listeners) {
          for (const mutate of listeners) {
            mutate(() => msg.data);
          }
        }
      }
    } catch (err) {}
  };

  sharedSocket.onclose = () => {
    sharedSocket = null;
    clearInterval(sharedHeartbeatTimer);
    clearTimeout(sharedPingTimeoutTimer);

    const delay = sharedReconnectDelay;
    sharedReconnectDelay = Math.min(sharedReconnectDelay * 2, 30000);
    setTimeout(getSharedSocket, delay);
  };

  return sharedSocket;
}

/**
 * @experimental Demo helper. Prefer application-specific fetch + createResource.
 * Requires demo-mode server endpoints (CACHOU_DEMO=1).
 */
export function dbSignal(tableName, options = {}) {
  const initialQuery = options.query || `SELECT * FROM ${tableName}`;

  const [data, { mutate }] = createResource(async () => {
    const res = await fetch(`/api/db-query?table=${encodeURIComponent(tableName)}&query=${encodeURIComponent(initialQuery)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `dbSignal request failed (${res.status})`);
    }
    return res.json();
  });

  if (typeof window !== "undefined") {
    if (!dbSignalListeners.has(tableName)) {
      dbSignalListeners.set(tableName, new Set());
    }
    dbSignalListeners.get(tableName).add(mutate);
    getSharedSocket();
  }

  const setter = (newValue) => {
    const current = data() || [];
    const next = typeof newValue === "function" ? newValue(current) : newValue;

    mutate(() => next);

    if (typeof window !== "undefined") {
      const socket = getSharedSocket();
      const payload = JSON.stringify({
        type: "db-sync",
        table: tableName,
        data: next
      });

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      } else {
        socketQueue.push(payload);
      }
    }
  };

  return [data, setter];
}

let activeTransition = null;
let latestTransition = null;

export function startTransition(fn, options = {}) {
  if (latestTransition && !latestTransition.done && options.cancelPrevious !== false) {
    latestTransition.abort();
  }
  const prevTransition = activeTransition;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const transition = {
    promises: new Set(),
    tasks: new Set(),
    done: false,
    signal: controller ? controller.signal : { aborted: false },
    abort() {
      if (transition.done) return;
      transition.done = true;
      if (controller && !controller.signal.aborted) {
        controller.abort();
      }
      for (const task of transition.tasks) {
        task.cancel();
      }
    }
  };
  latestTransition = transition;
  activeTransition = transition;

  try {
    fn();
  } finally {
    activeTransition = prevTransition;
  }

  if (transition.promises.size > 0) {
    return Promise.all(Array.from(transition.promises)).then(() => {
      transition.done = true;
      if (latestTransition === transition) {
        latestTransition = null;
      }
    });
  } else {
    transition.done = true;
    if (latestTransition === transition) {
      latestTransition = null;
    }
  }
}

const [globalTransitionPending, setGlobalTransitionPending] = signal(false);

export function useTransition() {
  const start = (fn) => {
    setGlobalTransitionPending(true);
    const p = startTransition(fn);
    if (p instanceof Promise) {
      p.finally(() => setGlobalTransitionPending(false));
    } else {
      setGlobalTransitionPending(false);
    }
  };
  return [globalTransitionPending, start];
}

export function resetSSRHead() {
  const head = getSSRContext().head;
  head.title = "";
  head.meta = [];
}

export function getSSRHead() {
  const currentHeadData = getSSRContext().head;
  let headHtml = "";
  if (currentHeadData.title) {
    headHtml += `<title>${currentHeadData.title}</title>\n`;
  }
  if (currentHeadData.meta) {
    for (const m of currentHeadData.meta) {
      const keyAttr = m.name ? `name="${m.name}"` : `property="${m.property}"`;
      headHtml += `<meta ${keyAttr} content="${m.content}">\n`;
    }
  }
  return headHtml;
}

export function useHead(config) {
  if (typeof window !== "undefined") {
    effect(() => {
      if (config.title) {
        const titleVal = typeof config.title === "function" ? config.title() : config.title;
        document.title = titleVal;
      }
      if (config.meta) {
        for (const item of config.meta) {
          const name = item.name || item.property;
          const content = typeof item.content === "function" ? item.content() : item.content;
          const selector = item.name ? `meta[name="${name}"]` : `meta[property="${name}"]`;
          let el = document.head.querySelector(selector);
          if (!el) {
            el = document.createElement("meta");
            if (item.name) el.setAttribute("name", name);
            if (item.property) el.setAttribute("property", name);
            document.head.appendChild(el);
          }
          el.setAttribute("content", content);
        }
      }
    });
  } else {
    const currentHeadData = getSSRContext().head;
    if (config.title) {
      currentHeadData.title = typeof config.title === "function" ? config.title() : config.title;
    }
    if (config.meta) {
      currentHeadData.meta = config.meta.map(m => ({
        name: m.name,
        property: m.property,
        content: typeof m.content === "function" ? m.content() : m.content
      }));
    }
  }
}

/** Reset module-level SSR fallback context (tests only). */
export function resetSSRStateForTests() {
  resetGlobalSSRFallback();
}
