import { getSSRContext, getActiveSSRContext, createSSRContext, runWithSSRContext, runWithSSRContextAsync, installSSRAsyncHooks, resetGlobalSSRFallback, setLastSSRContext, getLastSSRContext, isLastSSRContextAmbiguous, beginSSRRender, endSSRRender } from "./ssr-context.js";
import { writeLog, configureLogger, getLoggerConfig, createLogger, isLoggingEnabled } from "./logger.js";
import { configureTracing, getTracingConfig, createTracer, startSpan, runWithSpan, getActiveSpan, getSpanTraceparent, parseTraceparent, formatTraceparent, extractTraceparent } from "./tracing.js";
import { cleanupNode } from "./dom-cleanup.js";

export { installSSRAsyncHooks, createSSRContext, runWithSSRContext, runWithSSRContextAsync, setLastSSRContext, beginSSRRender, endSSRRender, configureLogger, getLoggerConfig, createLogger, configureTracing, getTracingConfig, createTracer, startSpan, runWithSpan, getActiveSpan, getSpanTraceparent, parseTraceparent, formatTraceparent, extractTraceparent };

let activeEffect = null;
let activeOwner = null;
const effectStack = [];
let batchDepth = 0;
let batchedUpdates = new Set();
let batchedValues = new Map();
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
const resourceInflightTokens = new WeakMap();

function registerResourceInflight(inflight, key, promise) {
  const previous = inflight.get(key);
  if (previous) {
    const previousToken = resourceInflightTokens.get(previous);
    if (previousToken) previousToken.invalidated = true;
  }
  const token = { invalidated: false };
  resourceInflightTokens.set(promise, token);
  inflight.set(key, promise);
  return token;
}

function invalidateResourceInflight(inflight, key) {
  const promise = inflight.get(key);
  if (promise) {
    const token = resourceInflightTokens.get(promise);
    if (token) token.invalidated = true;
  }
  inflight.delete(key);
}

function normalizeEquals(equals) {
  if (equals === false) return () => false;
  if (typeof equals === "function") return equals;
  return (a, b) => a === b;
}

function ssrCache() {
  return getSSRContext().ssrCache;
}

function pendingResources() {
  return getSSRContext().pendingResources;
}

function getSerializationContext(explicitContext = null) {
  if (explicitContext) {
    if (!explicitContext.ssrCache || !explicitContext.pendingResources || !explicitContext.head) {
      throw new TypeError("CachouJS serialization requires a valid SSR context.");
    }
    return explicitContext;
  }
  const activeContext = getActiveSSRContext();
  if (activeContext) return activeContext;
  const completedContext = getLastSSRContext();
  if (completedContext) return completedContext;
  if (isLastSSRContextAmbiguous()) {
    throw new Error("CachouJS has no unambiguous completed SSR output context; pass the request's SSR context to dehydrate() or getSSRHead().");
  }
  return getSSRContext();
}

export function onFrameworkEvent(listener) {
  frameworkEventListeners.add(listener);
  return () => frameworkEventListeners.delete(listener);
}

export function emitFrameworkEvent(event) {
  const activeSpan = getActiveSpan();
  const loggingEnabled = isLoggingEnabled();
  if (frameworkEventListeners.size === 0 && !activeSpan?.isRecording() && !loggingEnabled) return;
  const activeContext = getActiveSSRContext();
  const normalized = {
    time: Date.now(),
    ...(activeContext?.id ? { ssrContextId: activeContext.id } : {}),
    ...(activeContext?.path && !event.path ? { path: activeContext.path } : {}),
    ...event
  };
  if (loggingEnabled) writeLog(normalized);
  if (activeSpan?.isRecording()) {
    const attributes = {};
    for (const [key, value] of Object.entries(normalized)) {
      if (["time", "type", "error", "node", "message"].includes(key)) continue;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        attributes[key] = value;
      }
    }
    activeSpan.addEvent(`cachou.${normalized.type || "event"}`, attributes);
    if (normalized.error) activeSpan.recordException(normalized.error);
  }
  for (const listener of frameworkEventListeners) {
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
  const context = getSSRContext();
  context.resourceCounter = 0;
  context.resourcesStarted = 0;
}

export function dehydrate(context = null) {
  const cache = getSerializationContext(context).ssrCache;
  const json = JSON.stringify(cache)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  for (const k in cache) {
    delete cache[k];
  }
  return `<script id="__CACHOU_STATE__">window.__CACHOU_STATE__ = ${json};</script>`;
}

export async function resolvePendingResources(signal = null) {
  const pending = pendingResources();
  while (pending.size > 0) {
    if (signal?.aborted) return;
    const waitForResources = Promise.all(Array.from(pending));
    if (!signal) {
      await waitForResources;
      continue;
    }
    let onAbort;
    const aborted = new Promise(resolve => {
      onAbort = resolve;
      if (signal.aborted) resolve();
      else signal.addEventListener("abort", resolve, { once: true });
    });
    try {
      await Promise.race([waitForResources, aborted]);
    } finally {
      signal.removeEventListener?.("abort", onAbort);
    }
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
    if (!hasScheduledTasks() && schedulerChannel) {
      schedulerChannel.port1.onmessage = null;
      schedulerChannel.port1.close?.();
      schedulerChannel.port2.close?.();
      schedulerChannel = null;
    }
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

  try {
    const result = task.fn(context);
    if (result && typeof result.then === "function") {
      Promise.resolve(result).then(
        value => completeScheduledTask(task, value),
        err => failScheduledTask(task, err)
      );
    } else {
      completeScheduledTask(task, result);
    }
  } catch (err) {
    failScheduledTask(task, err);
  }
}

function completeScheduledTask(task, value) {
  if (task.signal.aborted) {
    task.status = "cancelled";
    task.resolve(undefined);
  } else {
    task.status = "completed";
    task.resolve(value);
  }
}

function failScheduledTask(task, err) {
  if (task.signal.aborted || (err && err.name === "AbortError")) {
    task.status = "cancelled";
    task.resolve(undefined);
  } else {
    task.status = "failed";
    task.reject(err);
  }
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
  let removeSourceAbortListener = null;
  let removeTransitionAbortListener = null;
  let settled = false;
  const task = {
    fn,
    priority,
    signal,
    status: "queued",
    cancelled: false,
    resolve: value => resolveFinished(value),
    reject: err => rejectFinished(err),
    cancel() {
      if (task.cancelled || settled) return;
      task.cancelled = true;
      task.status = "cancelled";
      if (controller && !controller.signal.aborted) {
        controller.abort();
      }
      resolveFinished(undefined);
    }
  };
  const settle = () => {
    if (settled) return;
    settled = true;
    removeSourceAbortListener?.();
    removeTransitionAbortListener?.();
    transition?.tasks.delete(task);
    transition?.promises.delete(task.finished);
  };
  task.finished = new Promise((resolve, reject) => {
    resolveFinished = value => {
      settle();
      resolve(value);
    };
    rejectFinished = err => {
      settle();
      reject(err);
    };
  });

  if (activeOwner || activeEffect) {
    onCleanup(() => task.cancel());
  }

  if (options.signal) {
    if (options.signal.aborted) {
      task.cancel();
      return task;
    }
    options.signal.addEventListener("abort", task.cancel, { once: true });
    removeSourceAbortListener = () => options.signal.removeEventListener("abort", task.cancel);
  }
  if (transition) {
    transition.tasks.add(task);
    transition.promises.add(task.finished);
    if (transition.signal.aborted) {
      task.cancel();
      return task;
    }
    transition.signal.addEventListener("abort", task.cancel, { once: true });
    removeTransitionAbortListener = () => transition.signal.removeEventListener("abort", task.cancel);
  }

  scheduledQueues[priority].push(task);
  scheduleFlush();
  return task;
}

export function signal(initialValue, options = {}) {
  let value = initialValue;
  const subscribers = new Set();
  const directSubscribers = new Set();
  const directSubscriberList = [];
  const directSubscriberIndexes = new Map();
  let directDispatchDepth = 0;
  let directHoles = 0;
  const directClassSubscribers = new Set();
  const directClassSubscriberList = [];
  const directClassSubscriberIndexes = new Map();
  let directClassDispatchDepth = 0;
  let directClassHoles = 0;
  const equals = normalizeEquals(options.equals);
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
  const setter = (newValue) => {
    if (typeof newValue === 'function') {
      newValue = newValue(value);
    }
    if (!equals(value, newValue)) {
      value = newValue;
      if (batchDepth > 0) {
        for (const sub of subscribers) {
          batchedUpdates.add(sub);
          if (directSubscribers.has(sub)) batchedValues.set(sub, newValue);
        }
      } else {
        if (directClassSubscribers.size === subscribers.size) {
          directClassDispatchDepth++;
          try {
            if (directClassHoles === 0) {
              for (let i = 0; i < directClassSubscriberList.length; i++) {
                const binding = directClassSubscriberList[i];
                binding.node.className = value ? binding.className : "";
              }
            } else {
              for (let i = 0; i < directClassSubscriberList.length; i++) {
                const binding = directClassSubscriberList[i];
                if (binding) binding.node.className = value ? binding.className : "";
              }
            }
          } finally {
            directClassDispatchDepth--;
            if (directClassDispatchDepth === 0 && directClassHoles > directClassSubscriberList.length / 4) {
              let write = 0;
              for (let read = 0; read < directClassSubscriberList.length; read++) {
                const binding = directClassSubscriberList[read];
                if (!binding) continue;
                directClassSubscriberList[write] = binding;
                directClassSubscriberIndexes.set(binding, write++);
              }
              directClassSubscriberList.length = write;
              directClassHoles = 0;
            }
          }
        } else if (directClassSubscribers.size === 0 && directSubscribers.size === subscribers.size) {
          directDispatchDepth++;
          try {
            if (directHoles === 0) {
              for (let i = 0; i < directSubscriberList.length; i++) {
                directSubscriberList[i](value);
              }
            } else {
              for (let i = 0; i < directSubscriberList.length; i++) {
                const subscriber = directSubscriberList[i];
                if (subscriber) subscriber(value);
              }
            }
          } finally {
            directDispatchDepth--;
            if (directDispatchDepth === 0 && directHoles > directSubscriberList.length / 4) {
              let write = 0;
              for (let read = 0; read < directSubscriberList.length; read++) {
                const subscriber = directSubscriberList[read];
                if (!subscriber) continue;
                directSubscriberList[write] = subscriber;
                directSubscriberIndexes.set(subscriber, write++);
              }
              directSubscriberList.length = write;
              directHoles = 0;
            }
          }
        } else {
          const subs = Array.from(subscribers);
          for (let i = 0; i < subs.length; i++) {
            runSubscriber(subs[i], value);
          }
        }
      }
    }
  };

  const removeClassBinding = (binding) => {
    if (!directClassSubscribers.delete(binding)) return;
    directSubscribers.delete(binding);
    subscribers.delete(binding);
    const index = directClassSubscriberIndexes.get(binding);
    if (index !== undefined && directClassSubscriberList[index]) {
      directClassSubscriberList[index] = null;
      directClassSubscriberIndexes.delete(binding);
      directClassHoles++;
    }
    if (directClassDispatchDepth === 0 && directClassHoles > directClassSubscriberList.length / 4) {
      let write = 0;
      for (let read = 0; read < directClassSubscriberList.length; read++) {
        const activeBinding = directClassSubscriberList[read];
        if (!activeBinding) continue;
        directClassSubscriberList[write] = activeBinding;
        directClassSubscriberIndexes.set(activeBinding, write++);
      }
      directClassSubscriberList.length = write;
      directClassHoles = 0;
    }
  };

  getter.$$cachouSignal = {
    subscribers,
    subscribe(subscriber) {
      subscribers.add(subscriber);
      if (!directSubscribers.has(subscriber)) {
        directSubscribers.add(subscriber);
        directSubscriberIndexes.set(subscriber, directSubscriberList.length);
        directSubscriberList.push(subscriber);
      }
    },
    subscribeClass(node, className) {
      const binding = {
        node,
        className,
        run(value) {
          this.node.className = value ? this.className : "";
        }
      };
      subscribers.add(binding);
      directSubscribers.add(binding);
      directClassSubscribers.add(binding);
      directClassSubscriberIndexes.set(binding, directClassSubscriberList.length);
      directClassSubscriberList.push(binding);
      return binding;
    },
    unsubscribe(subscriber) {
      if (directClassSubscribers.has(subscriber)) {
        removeClassBinding(subscriber);
        return;
      }
      if (directSubscribers.delete(subscriber)) {
        const index = directSubscriberIndexes.get(subscriber);
        if (index !== undefined && directSubscriberList[index]) {
          directSubscriberList[index] = null;
          directSubscriberIndexes.delete(subscriber);
          directHoles++;
        }
        if (directDispatchDepth === 0 && directHoles > directSubscriberList.length / 4) {
          let write = 0;
          for (let read = 0; read < directSubscriberList.length; read++) {
            const activeSubscriber = directSubscriberList[read];
            if (!activeSubscriber) continue;
            directSubscriberList[write] = activeSubscriber;
            directSubscriberIndexes.set(activeSubscriber, write++);
          }
          directSubscriberList.length = write;
          directHoles = 0;
        }
      }
      subscribers.delete(subscriber);
    },
    unsubscribeClass(binding) {
      removeClassBinding(binding);
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
  } catch (error) {
    // A failed initializer has no safe way to return its disposer. Tear down
    // everything created under the root before propagating the original error.
    dispose();
    throw error;
  } finally {
    activeOwner = prevOwner;
  }
}

function cleanupEffect(eff) {
  // Dispose child computations owned by this effect before re-running it.
  if (eff.owned) {
    const children = Array.from(eff.owned);
    eff.owned.clear();
    for (const child of children) {
      disposeEffect(child, false);
    }
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
    const cleanups = Array.from(eff.cleanups);
    eff.cleanups.clear();
    for (const cleanupFn of cleanups) {
      try {
        cleanupFn();
      } catch (err) {
        console.error("Error in cleanup callback:", err);
      }
    }
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

/** Current reactive owner (effect or root), or null. */
export function getOwner() {
  return activeOwner || activeEffect || null;
}

/**
 * Run `fn` under `owner` so created effects/memos attach to that owner.
 * Does not force tracking; use inside effects when needed.
 */
export function runWithOwner(owner, fn) {
  const prevOwner = activeOwner;
  const prevEffect = activeEffect;
  activeOwner = owner || null;
  // Keep activeEffect only if it is the same owner graph; default clear tracking context for ownership-only runs.
  if (owner && owner.type === "effect") {
    activeEffect = owner;
  }
  try {
    return fn();
  } finally {
    activeOwner = prevOwner;
    activeEffect = prevEffect;
  }
}

/**
 * Run `fn` without tracking signal reads in the current effect.
 */
export function untrack(fn) {
  const prev = activeEffect;
  activeEffect = null;
  try {
    return fn();
  } finally {
    activeEffect = prev;
  }
}

export function memo(fn, options = {}) {
  let value;
  let initialized = false;
  let dirty = true;
  const subscribers = new Set();
  const equals = normalizeEquals(options.equals);
  let recompute;

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
      if (subscribers.size === 0) return;
      const result = recompute();
      if (result.completed && !result.changed) return;
      const subs = Array.from(subscribers);
      for (let i = 0; i < subs.length; i++) {
        subs[i].run();
      }
    }
  };
  if (debugEnabled) {
    debugState.computations.add(memoObj);
  }

  if (activeOwner) {
    ensureOwned(activeOwner).add(memoObj);
  }

  recompute = () => {
    cleanupEffect(memoObj);

    const prevEffect = activeEffect;
    const prevOwner = activeOwner;
    activeEffect = memoObj;
    activeOwner = memoObj;
    try {
      const next = fn();
      const changed = !initialized || !equals(value, next);
      if (changed) value = next;
      initialized = true;
      dirty = false;
      return { changed, completed: true };
    } catch (err) {
      handleError(err);
      return { changed: true, completed: false };
    } finally {
      activeEffect = prevEffect;
      activeOwner = prevOwner;
    }
  };

  const read = () => {
    if (activeEffect) {
      subscribers.add(activeEffect);
      activeEffect.dependencies.add(subscribers);
    }
    if (!dirty && initialized) {
      return value;
    }

    recompute();
    return value;
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
  let result;
  try {
    result = fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      const updates = batchedUpdates;
      if (updates.size > 0) {
        const values = batchedValues;
        batchedUpdates = new Set();
        batchedValues = new Map();
        for (const sub of updates) {
          if (typeof sub === "function" && values.has(sub)) runSubscriber(sub, values.get(sub));
          else runSubscriber(sub);
        }
      }
    }
  }
  return result;
}

function runSubscriber(subscriber, value) {
  if (typeof subscriber === "function") {
    if (arguments.length > 1) subscriber(value);
    else subscriber();
  } else if (arguments.length > 1) {
    subscriber.run(value);
  } else {
    subscriber.run();
  }
}

const storeSignalsMap = new WeakMap();
const rawToStoreProxy = new WeakMap();
const storeProxyToRaw = new WeakMap();
const arrayMutators = new Set(["copyWithin", "fill", "pop", "push", "reverse", "shift", "sort", "splice", "unshift"]);

function getSignalForProp(target, prop, initialValue) {
  let props = storeSignalsMap.get(target);
  if (!props) {
    props = new Map();
    storeSignalsMap.set(target, props);
  }
  let sig = props.get(prop);
  if (!sig) {
    const [get, set] = signal(initialValue, { equals: (a, b) => a === b });
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

      const val = Reflect.get(target, prop, proxy);
      const sig = getSignalForProp(target, prop, val);
      sig.get(); // Register dependency

      if (Array.isArray(target) && arrayMutators.has(prop) && typeof val === "function") {
        return (...args) => batch(() => Reflect.apply(val, proxy, args));
      }
      if (typeof val === "object" && val !== null) {
        return store(val);
      }
      return val;
    },
    set(target, prop, value) {
      const oldVal = Reflect.get(target, prop);
      const oldLength = Array.isArray(target) ? target.length : 0;
      if (oldVal === value) return true;

      const success = Reflect.set(target, prop, value);
      if (success) {
        const sig = getSignalForProp(target, prop, oldVal);
        sig.set(value); // Trigger subscribers
        if (Array.isArray(target) && isArrayIndex(prop) && Number(prop) >= oldLength) {
          getSignalForProp(target, "length", oldLength).set(target.length);
        } else if (Array.isArray(target) && prop === "length" && target.length < oldLength) {
          const props = storeSignalsMap.get(target);
          for (let index = target.length; index < oldLength; index++) {
            props?.get(String(index))?.set(undefined);
          }
        }
      }
      return success;
    },
    deleteProperty(target, prop) {
      const exists = Reflect.has(target, prop);
      const oldVal = Reflect.get(target, prop);
      const success = Reflect.deleteProperty(target, prop);
      if (exists && success) {
        const sig = getSignalForProp(target, prop, oldVal);
        sig.set(undefined); // Trigger subscribers
      }
      return success;
    }
  });

  rawToStoreProxy.set(rawObj, proxy);
  storeProxyToRaw.set(proxy, rawObj);
  return proxy;
}

function isArrayIndex(prop) {
  if (typeof prop !== "string" || prop === "") return false;
  const index = Number(prop);
  return Number.isInteger(index) && index >= 0 && String(index) === prop;
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
  const stableIdentityList = reactiveItems === false && uniqueKeys;
  const emptyList = [];
  let previousList = null;
  let previousResult = null;
  let hasPreviousList = false;

  return () => {
    const list = (typeof listSignal === "function" ? listSignal() : listSignal) || emptyList;
    if (stableIdentityList && hasPreviousList && list === previousList) {
      return previousResult;
    }
    if (!keyFn && debugEnabled && debugState.strict && !warnedMissingKey && list.some(item => typeof item === "object" && item !== null)) {
      warnedMissingKey = true;
      const message = "mapArray received object items without an explicit key function; reorders may reuse the wrong row.";
      emitFrameworkEvent({ type: "debug-warning", message });
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn(`⚡ [CachouJS Debug]: ${message}`);
      }
    }

    if (uniqueKeys) {
      // Immutable keyed rows keep their identity across a full reversal. In
      // that opted-in hot path, the previous entries already prove the keys;
      // avoid invoking the key function 1,000 times before moving the nodes.
      if (
        reactiveItems === false &&
        uniqueEntriesSnapshot.length === list.length &&
        list.length > 1 &&
        !(debugEnabled && debugState.strict)
      ) {
        let isIdentityReverse = true;
        for (let i = 0, j = list.length - 1; i < list.length; i++, j--) {
          if (list[i] !== uniqueEntriesSnapshot[j].item) {
            isIdentityReverse = false;
            break;
          }
        }
        if (isIdentityReverse) {
          const result = new Array(list.length);
          for (let i = 0, j = list.length - 1; i < list.length; i++, j--) {
            result[i] = uniqueEntriesSnapshot[j].mapped;
          }
          uniqueEntriesSnapshot.reverse();
          uniqueKeysSnapshot.reverse();
          previousList = list;
          previousResult = result;
          hasPreviousList = true;
          return result;
        }
      }

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
        const result = new Array(list.length);
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
        }

        if (canReuseReverse) {
          uniqueEntriesSnapshot.reverse();
          uniqueKeysSnapshot = keys;
          previousList = list;
          previousResult = result;
          hasPreviousList = true;
          return result;
        }
      }

      const result = new Array(list.length);
      const entries = new Array(list.length);

      // The first pass has no entries to look up or reconcile. Keep this
      // branch flat because keyed initial creation is a common mount hot path.
      if (uniqueEntriesSnapshot.length === 0) {
        runWithDetachedOwnerBatch(() => {
          for (let i = 0; i < list.length; i++) {
            const item = list[i];
            const key = keys[i];
            const mappedItem = reactiveItems && typeof item === "object" && item !== null ? store({ ...item }) : item;
            const reactiveItem = mappedItem !== item ? mappedItem : null;
            const mapped = mapFn(mappedItem, i);
            const entry = { item, mapped, mappedItem, reactiveItem };

            result[i] = mapped;
            entries[i] = entry;
          }
        });

        // The snapshot is enough for the common next operation: a full
        // reverse. Build the lookup map lazily for arbitrary key updates.
        uniqueCache = null;
        uniqueKeysSnapshot = keys;
        uniqueEntriesSnapshot = entries;
        previousList = list;
        previousResult = result;
        hasPreviousList = true;
        return result;
      }

      if (uniqueCache === null) {
        uniqueCache = new Map();
        for (let i = 0; i < uniqueKeysSnapshot.length; i++) {
          uniqueCache.set(uniqueKeysSnapshot[i], uniqueEntriesSnapshot[i]);
        }
      }

      const newUniqueCache = new Map();

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
      previousList = list;
      previousResult = result;
      hasPreviousList = true;
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
    previousList = list;
    previousResult = result;
    hasPreviousList = true;
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

function runWithDetachedOwnerBatch(fn) {
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
const DEFAULT_RESOURCE_CACHE_MAX_ENTRIES = 256;
let resourceCacheMaxEntries = DEFAULT_RESOURCE_CACHE_MAX_ENTRIES;
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
  return getResourceCacheEntry(resourceCache, key);
}

function getResourceCacheEntry(cache, key) {
  const entry = cache.get(key);
  if (entry && cache === resourceCache) {
    // Map insertion order provides a compact LRU without a second index.
    cache.delete(key);
    cache.set(key, entry);
  }
  return entry;
}

function setResourceCacheEntry(cache, key, entry) {
  cache.set(key, entry);
  if (cache !== resourceCache) return;
  while (cache.size > resourceCacheMaxEntries) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function trimResourceCache() {
  while (resourceCache.size > resourceCacheMaxEntries) {
    const oldest = resourceCache.keys().next();
    if (oldest.done) break;
    resourceCache.delete(oldest.value);
  }
}

/**
 * Bound browser-side resource retention. SSR request caches remain owned by
 * their request context and are not subject to this process-wide LRU.
 */
export function configureResourceCache(options = {}) {
  if (options.maxEntries !== undefined) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 0) {
      throw new RangeError("configureResourceCache({ maxEntries }) requires a non-negative integer.");
    }
    resourceCacheMaxEntries = options.maxEntries;
    trimResourceCache();
  }
  return { maxEntries: resourceCacheMaxEntries, size: resourceCache.size };
}

export function invalidateResource(key) {
  const activeContext = getActiveSSRContext();
  (activeContext?.resourceCache || resourceCache).delete(key);
  invalidateResourceInflight(activeContext?.resourceInflight || resourceInflight, key);
  emitFrameworkEvent({ type: "resource-invalidate", key });
}

export async function prefetchResource(key, fetcher, options = {}) {
  const activeContext = getActiveSSRContext();
  const cache = activeContext?.resourceCache || resourceCache;
  const inflight = activeContext?.resourceInflight || resourceInflight;
  const cachedResource = getResourceCacheEntry(cache, key);
  if (cachedResource && options.force !== true) {
    return cachedResource.data;
  }
  if (options.signal?.aborted) {
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    throw err;
  }
  if (options.dedupe !== false && inflight.has(key)) {
    return inflight.get(key);
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutId = null;
  let removeExternalAbortListener = null;
  if (controller && options.signal) {
    const abortFromExternal = () => {
      try {
        controller.abort();
      } catch (_) {}
    };
    options.signal.addEventListener("abort", abortFromExternal, { once: true });
    removeExternalAbortListener = () => options.signal.removeEventListener("abort", abortFromExternal);
  }
  const context = controller ? { signal: controller.signal, requestId: 0 } : { requestId: 0 };
  let requestToken;
  const promise = (async () => {
    if (options.timeoutMs && controller) {
      timeoutId = setTimeout(() => controller.abort(makeTimeoutError(options.timeoutMs)), options.timeoutMs);
    }
    try {
      const res = await fetcher(context);
      if (controller?.signal?.aborted || options.signal?.aborted) {
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        throw err;
      }
      if (requestToken?.invalidated) return res;
      setResourceCacheEntry(cache, key, { data: res, timestamp: Date.now() });
      emitFrameworkEvent({ type: "resource-prefetch", key });
      return res;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      removeExternalAbortListener?.();
      removeExternalAbortListener = null;
      if (inflight.get(key) === promise) inflight.delete(key);
    }
  })();
  requestToken = registerResourceInflight(inflight, key, promise);
  return promise;
}

export function createResource(sourceOrFetcher, fetcherOrOptions = {}, maybeOptions = {}) {
  const hasSource = typeof fetcherOrOptions === "function";
  const source = hasSource ? sourceOrFetcher : null;
  const fetcher = hasSource ? fetcherOrOptions : sourceOrFetcher;
  const options = hasSource ? maybeOptions : fetcherOrOptions;
  const ctx = getSSRContext();
  const activeContext = getActiveSSRContext();
  const contextResourceCache = activeContext?.resourceCache || resourceCache;
  const contextResourceInflight = activeContext?.resourceInflight || resourceInflight;
  const resourceIndex = ctx.resourceCounter++;
  const key = options.key || `res-${resourceIndex}`;
  const staleTime = options.staleTime ?? 0;
  let sourceInitialized = false;
  let lastSourceValue = hasSource ? runWithoutTracking(source) : undefined;
  const readKey = () => typeof key === "function" ? key(lastSourceValue) : key;
  const initialKey = readKey();
  
  let initialData = undefined;
  let initialLoading = true;
  const cache = ctx.ssrCache;
  
  if (typeof window !== "undefined" && !globalThis.__MOCK_SSR__ && window.__CACHOU_STATE__ && window.__CACHOU_STATE__[resourceIndex] !== undefined) {
    initialData = window.__CACHOU_STATE__[resourceIndex];
    initialLoading = false;
    setResourceCacheEntry(contextResourceCache, initialKey, { data: initialData, timestamp: Date.now() });
  } else if (cache[resourceIndex] !== undefined) {
    initialData = cache[resourceIndex];
    initialLoading = false;
  } else {
    const cachedResource = getResourceCacheEntry(contextResourceCache, initialKey);
    if (cachedResource) {
      initialData = cachedResource.data;
      const age = Date.now() - cachedResource.timestamp;
      if (age < staleTime) {
        initialLoading = false;
      }
    }
  }

  const [data, setData] = signal(initialData);
  const [loading, setLoading] = signal(initialLoading);
  const [error, setError] = signal(null);
  const cancelPrevious = options.cancelPrevious !== false;
  let requestId = 0;
  let latestAppliedRequestId = 0;
  let activeController = null;
  let disposed = false;
  let stopSuspenseEffect = null;
  let stopSourceEffect = null;

  const suspense = useContext(SuspenseContext);
  if (suspense) {
    const resourceId = Symbol();
    stopSuspenseEffect = effect(() => {
      suspense.registerLoader(resourceId, loading());
    });
  }

  const mutate = (newData) => {
    if (disposed) return;
    requestId++;
    latestAppliedRequestId = requestId;
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    setData(() => newData);
    setLoading(false);
    setError(null);
    setResourceCacheEntry(contextResourceCache, readKey(), { data: newData, timestamp: Date.now() });
  };

  const refetch = async () => {
    if (disposed) return;
    const transition = activeTransition;
    const showLoading = !transition;
    const currentRequestId = ++requestId;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const requestKey = readKey();
    ctx.resourcesStarted = (ctx.resourcesStarted || 0) + 1;
    const resourceSpan = startSpan("cachou.resource", {
      attributes: {
        requestId: currentRequestId,
        dedupe: options.dedupe === true,
        hasSource: hasSource === true
      }
    });
    let timeoutId = null;
    let removeContextAbortListener = null;
    let removeTransitionAbortListener = null;
    let inflightToken = null;

    if (cancelPrevious && activeController) {
      activeController.abort();
    }
    activeController = controller;
    if (controller && ctx.signal) {
      if (ctx.signal.aborted) {
        controller.abort();
      } else {
        const abortFromContext = () => controller.abort();
        ctx.signal.addEventListener("abort", abortFromContext, { once: true });
        removeContextAbortListener = () => ctx.signal.removeEventListener("abort", abortFromContext);
      }
    }
    if (transition && controller) {
      if (transition.signal.aborted) {
        controller.abort();
      } else {
        const abortFromTransition = () => controller.abort();
        transition.signal.addEventListener("abort", abortFromTransition, { once: true });
        removeTransitionAbortListener = () => transition.signal.removeEventListener("abort", abortFromTransition);
      }
    }

    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    emitFrameworkEvent({ type: "resource-start", key: requestKey, requestId: currentRequestId });
    
    const promise = runWithSpan(resourceSpan, async () => {
      try {
        const context = controller
          ? { signal: controller.signal, requestId: currentRequestId, request: ctx.request }
          : { requestId: currentRequestId, request: ctx.request };
        let fetchPromise;
        if (options.dedupe === true && contextResourceInflight.has(requestKey)) {
          fetchPromise = contextResourceInflight.get(requestKey);
          inflightToken = resourceInflightTokens.get(fetchPromise) || null;
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
            let trackedFetchPromise;
            trackedFetchPromise = fetchPromise.finally(() => {
              if (contextResourceInflight.get(requestKey) === trackedFetchPromise) {
                contextResourceInflight.delete(requestKey);
              }
            });
            inflightToken = registerResourceInflight(contextResourceInflight, requestKey, trackedFetchPromise);
            fetchPromise = trackedFetchPromise;
          }
        }
        const res = await fetchPromise;
        if (inflightToken?.invalidated) {
          emitFrameworkEvent({ type: "resource-stale-response", key: requestKey, requestId: currentRequestId });
          return;
        }
        if (ctx.signal?.aborted || controller?.signal?.aborted) {
          resourceSpan.setStatus({ code: "UNSET", message: "aborted" });
          emitFrameworkEvent({ type: "resource-abort", key: requestKey, requestId: currentRequestId });
          return;
        }
        if (currentRequestId < requestId) {
          emitFrameworkEvent({ type: "resource-stale-response", key: requestKey, requestId: currentRequestId, latestRequestId: requestId });
          return;
        }
        latestAppliedRequestId = currentRequestId;
        setData(() => res);
        setResourceCacheEntry(contextResourceCache, requestKey, { data: res, timestamp: Date.now() });
        if (typeof window === "undefined" || !!globalThis.__MOCK_SSR__) {
          ctx.ssrCache[resourceIndex] = res;
        }
      } catch (err) {
        if (err && err.name === "AbortError") {
          resourceSpan.setStatus({ code: "UNSET", message: "aborted" });
          emitFrameworkEvent({ type: "resource-abort", key: requestKey, requestId: currentRequestId });
          return;
        }
        if (currentRequestId >= requestId) {
          resourceSpan.recordException(err).setStatus({ code: "ERROR", message: "resource request failed" });
          setError(err);
          emitFrameworkEvent({ type: "resource-error", key: requestKey, requestId: currentRequestId, error: err });
        }
      }
    });
    
    ctx.pendingResources.add(promise);
    if (transition) {
      transition.promises.add(promise);
    }
    
    try {
      await promise;
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
      removeContextAbortListener?.();
      removeContextAbortListener = null;
      removeTransitionAbortListener?.();
      removeTransitionAbortListener = null;
      if (timeoutId) clearTimeout(timeoutId);
      if (showLoading && currentRequestId >= requestId) {
        setLoading(false);
      }
      ctx.pendingResources.delete(promise);
      resourceSpan.end();
    }
  };

  let onFocus = null;
  let onReconnect = null;
  if (typeof window !== "undefined") {
    if (options.revalidateOnFocus !== false) {
      onFocus = () => {
        const cachedResource = getResourceCacheEntry(contextResourceCache, readKey());
        if (!cachedResource || Date.now() - cachedResource.timestamp >= staleTime) {
          refetch();
        }
      };
      focusListeners.add(onFocus);
    }
    if (options.revalidateOnReconnect !== false) {
      onReconnect = () => {
        refetch();
      };
      reconnectListeners.add(onReconnect);
    }
  }

  if (activeOwner) {
    onCleanup(disposeResource);
  }

  if (initialLoading) {
    refetch();
  }

  if (hasSource) {
    stopSourceEffect = effect(() => {
      const nextSourceValue = source();
      if (!sourceInitialized) {
        sourceInitialized = true;
        return;
      }
      lastSourceValue = nextSourceValue;
      refetch();
    });
  }

  function disposeResource() {
    if (disposed) return;
    disposed = true;
    requestId++;
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    // Leave loading false so disposed resources never look "stuck" mid-flight.
    setLoading(false);
    if (onFocus) {
      focusListeners.delete(onFocus);
      onFocus = null;
    }
    if (onReconnect) {
      reconnectListeners.delete(onReconnect);
      onReconnect = null;
    }
    stopSourceEffect?.();
    stopSourceEffect = null;
    stopSuspenseEffect?.();
    stopSuspenseEffect = null;
  }

  return [data, {
    loading,
    error,
    refetch,
    mutate,
    dispose: disposeResource,
    invalidate: () => {
      if (!disposed) invalidateResource(readKey());
    },
    getRequestId: () => requestId,
    getLatestAppliedRequestId: () => latestAppliedRequestId
  }];
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
  let currentNodes = [];

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
    const nextSet = new Set(nodes);
    for (const node of currentNodes) {
      if (!nextSet.has(node)) cleanupNode(node);
    }
    container.replaceChildren(...nodes);
    currentNodes = nodes;
  });

  onCleanup(() => {
    for (const node of currentNodes) cleanupNode(node);
    currentNodes = [];
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
  let currentNodes = [];

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
    const nextSet = new Set(nodes);
    for (const node of currentNodes) {
      if (!nextSet.has(node)) cleanupNode(node);
    }
    container.replaceChildren(...nodes);
    currentNodes = nodes;
  });

  mount.appendChild(container);

  onCleanup(() => {
    for (const node of currentNodes) cleanupNode(node);
    currentNodes = [];
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
    let completed = false;
    let fallbackTimer;
    const run = () => {
      if (completed) return;
      completed = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fn();
    };
    requestAnimationFrame(run);
    fallbackTimer = setTimeout(run, 100);
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
    // Transitions are interruptible update groups. Batch synchronous signal
    // writes so a route/filter transition commits one coherent tree update;
    // async work still registers against the transition as before.
    batch(fn);
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
  head.links = [];
  head.jsonld = [];
  head.scripts = [];
}

function escapeHead(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const headLinkAttributes = new Set([
  "rel", "href", "as", "type", "media", "sizes", "crossorigin",
  "integrity", "referrerpolicy", "nonce", "color", "fetchpriority",
  "imagesrcset", "imagesizes", "hreflang", "title"
]);
const headLinkURLAttributes = new Set(["href", "imagesrcset"]);
const headElementOwners = new WeakMap();
const headManagedAttribute = "data-cachou-head-managed";

function claimHeadElement(element, owner) {
  let owners = headElementOwners.get(element);
  if (!owners) {
    owners = new Set();
    headElementOwners.set(element, owners);
  }
  owners.add(owner);
  element.setAttribute(headManagedAttribute, "1");
}

function releaseHeadElement(element, owner) {
  const owners = headElementOwners.get(element);
  if (!owners) return;
  owners.delete(owner);
  if (owners.size === 0) {
    headElementOwners.delete(element);
    element.removeAttribute(headManagedAttribute);
    element.parentNode?.removeChild(element);
  }
}

function isSafeHeadURL(value, attribute) {
  const compact = String(value ?? "").trim().replace(/[\u0000-\u001F\u007F\s]+/g, "");
  if (!compact) return true;
  if (attribute === "imagesrcset") {
    if (/(?:javascript|vbscript|file|about):/i.test(compact)) return false;
    return !/data:(?:text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/javascript|application\/javascript)/i.test(compact);
  }
  if (compact.startsWith("#") || compact.startsWith("/") || compact.startsWith("./") || compact.startsWith("../")) {
    return true;
  }
  try {
    const protocol = new URL(compact, "http://localhost").protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function getSafeHeadLinkValues(link, evaluate = false) {
  const values = new Map();
  for (const [key, rawValue] of Object.entries(link || {})) {
    const name = key.toLowerCase();
    if (!headLinkAttributes.has(name)) continue;
    const value = evaluate && typeof rawValue === "function" ? rawValue() : rawValue;
    if (value == null) continue;
    if (headLinkURLAttributes.has(name) && !isSafeHeadURL(value, name)) continue;
    values.set(name, value);
  }
  return values;
}

export function getSSRHead(context = null) {
  const currentHeadData = getSerializationContext(context).head;
  let headHtml = "";
  if (currentHeadData.title) {
    headHtml += `<title>${escapeHead(currentHeadData.title)}</title>\n`;
  }
  if (currentHeadData.meta) {
    for (const m of currentHeadData.meta) {
      if (m.name) {
        headHtml += `<meta name="${escapeHead(m.name)}" content="${escapeHead(m.content)}">\n`;
      } else if (m.property) {
        headHtml += `<meta property="${escapeHead(m.property)}" content="${escapeHead(m.content)}">\n`;
      }
    }
  }
  if (currentHeadData.links) {
    for (const link of currentHeadData.links) {
      const attrs = Array.from(getSafeHeadLinkValues(link))
        .map(([k, v]) => `${k}="${escapeHead(v)}"`)
        .join(" ");
      if (attrs) headHtml += `<link ${attrs}>\n`;
    }
  }
  if (currentHeadData.jsonld) {
    for (const data of currentHeadData.jsonld) {
      const json = typeof data === "string" ? data : JSON.stringify(data);
      headHtml += `<script type="application/ld+json">${json.replace(/</g, "\\u003c")}</script>\n`;
    }
  }
  return headHtml;
}

function mergeMeta(existing, incoming) {
  const list = Array.isArray(existing) ? [...existing] : [];
  for (const item of incoming || []) {
    const key = item.name ? `name:${item.name}` : item.property ? `property:${item.property}` : null;
    if (!key) {
      list.push(item);
      continue;
    }
    const idx = list.findIndex(m =>
      item.name ? m.name === item.name : m.property === item.property
    );
    const normalized = {
      name: item.name,
      property: item.property,
      content: typeof item.content === "function" ? item.content() : item.content
    };
    if (idx >= 0) list[idx] = normalized;
    else list.push(normalized);
  }
  return list;
}

/**
 * Manage document head. Multiple calls merge meta by name/property.
 * Supports title, meta, links, jsonld.
 */
export function useHead(config) {
  if (typeof window !== "undefined") {
    const ownerToken = {};
    const ownedElements = new Set();
    const previousTitle = document.title;
    let currentTitle = null;
    const releaseOwned = () => {
      for (const element of ownedElements) {
        releaseHeadElement(element, ownerToken);
      }
      ownedElements.clear();
      if (currentTitle !== null && document.title === currentTitle) {
        document.title = previousTitle;
      }
      currentTitle = null;
    };

    effect(() => {
      releaseOwned();
      if (config.title != null) {
        const titleVal = typeof config.title === "function" ? config.title() : config.title;
        document.title = titleVal;
        currentTitle = String(titleVal);
      }
      if (config.meta) {
        for (const item of config.meta) {
          const name = item.name || item.property;
          const content = typeof item.content === "function" ? item.content() : item.content;
          const attribute = item.name ? "name" : "property";
          let el = Array.from(document.head.querySelectorAll(`meta[${attribute}]`))
            .find(candidate => candidate.getAttribute(attribute) === String(name));
          if (!el) {
            el = document.createElement("meta");
            if (item.name) el.setAttribute("name", name);
            if (item.property) el.setAttribute("property", name);
            document.head.appendChild(el);
          }
          claimHeadElement(el, ownerToken);
          ownedElements.add(el);
          el.setAttribute("content", content);
        }
      }
      if (config.links) {
        for (const link of config.links) {
          const values = getSafeHeadLinkValues(link, true);
          const rel = values.get("rel") || "";
          const href = values.get("href");
          let el = rel && href
            ? Array.from(document.head.querySelectorAll("link[rel][href]"))
              .find(candidate => candidate.getAttribute("rel") === String(rel) && candidate.getAttribute("href") === String(href))
            : null;
          if (!el) {
            el = document.createElement("link");
            document.head.appendChild(el);
          }
          claimHeadElement(el, ownerToken);
          ownedElements.add(el);
          for (const [k, v] of values) {
            el.setAttribute(k, String(v));
          }
        }
      }
      if (config.jsonld) {
        // client: replace scripts marked by data-cachou-jsonld
        document.head.querySelectorAll("script[data-cachou-jsonld]").forEach(n => n.remove());
        for (const data of config.jsonld) {
          const el = document.createElement("script");
          el.type = "application/ld+json";
          el.setAttribute("data-cachou-jsonld", "1");
          el.textContent = typeof data === "string" ? data : JSON.stringify(data);
          document.head.appendChild(el);
          claimHeadElement(el, ownerToken);
          ownedElements.add(el);
        }
      }
    });
    if (getOwner()) onCleanup(releaseOwned);
  } else {
    const currentHeadData = getSSRContext().head;
    if (config.title != null) {
      currentHeadData.title = typeof config.title === "function" ? config.title() : config.title;
    }
    if (config.meta) {
      currentHeadData.meta = mergeMeta(currentHeadData.meta, config.meta);
    }
    if (config.links) {
      currentHeadData.links = [...(currentHeadData.links || []), ...config.links.map(l => {
        const out = {};
        for (const [k, v] of Object.entries(l)) {
          out[k] = typeof v === "function" ? v() : v;
        }
        return out;
      })];
    }
    if (config.jsonld) {
      currentHeadData.jsonld = [...(currentHeadData.jsonld || []), ...config.jsonld];
    }
  }
}

/** Reset module-level SSR fallback context (tests only). */
export function resetSSRStateForTests() {
  resetGlobalSSRFallback();
}
