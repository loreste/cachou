/**
 * Mutations and shared query cache helpers.
 */

import { signal, batch, invalidateResource } from "./reactivity.js";

const queryCache = new Map();
const queryListeners = new Map();

function makeAbortError(message = "The operation was aborted.") {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

export function getQueryData(key) {
  return queryCache.get(key);
}

export function setQueryData(key, data) {
  queryCache.set(key, data);
  const listeners = queryListeners.get(key);
  if (listeners) {
    for (const fn of listeners) fn(data);
  }
}

export function subscribeQuery(key, fn) {
  if (!queryListeners.has(key)) queryListeners.set(key, new Set());
  queryListeners.get(key).add(fn);
  return () => queryListeners.get(key)?.delete(fn);
}

export function invalidateQuery(key) {
  queryCache.delete(key);
  if (typeof key === "string") {
    try {
      invalidateResource(key);
    } catch (_) {}
  }
  const listeners = queryListeners.get(key);
  if (listeners) {
    for (const fn of listeners) fn(undefined);
  }
}

/**
 * Create a mutation with optional optimistic update + rollback.
 * Concurrent `mutate` calls abort the previous in-flight request.
 * `reset()` and `dispose()` also abort work and freeze callbacks for that generation.
 *
 * @param {(input: any, ctx: { signal?: AbortSignal }) => Promise<any>} mutationFn
 * @param {{
 *   onMutate?: (input: any) => any | Promise<any>,
 *   onSuccess?: (data: any, input: any, context: any) => void,
 *   onError?: (err: any, input: any, context: any) => void,
 *   onSettled?: (data: any, err: any, input: any, context: any) => void,
 *   invalidateKeys?: string[]
 * }} [options]
 */
export function createMutation(mutationFn, options = {}) {
  const [pending, setPending] = signal(false);
  const [error, setError] = signal(null);
  const [data, setData] = signal(undefined);
  let requestId = 0;
  let activeController = null;
  let disposed = false;

  function abortActive() {
    if (activeController) {
      try {
        activeController.abort();
      } catch (_) {}
      activeController = null;
    }
  }

  /**
   * @param {any} input
   * @param {{ signal?: AbortSignal }} [mutateOptions]
   */
  async function mutate(input, mutateOptions = {}) {
    if (disposed) {
      throw makeAbortError("Mutation disposed");
    }

    const id = ++requestId;
    abortActive();

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    activeController = controller;
    let removeExternalAbortListener = null;

    if (controller && mutateOptions.signal) {
      if (mutateOptions.signal.aborted) {
        controller.abort();
      } else {
        const abortFromExternal = () => {
          try {
            controller.abort();
          } catch (_) {}
        };
        mutateOptions.signal.addEventListener("abort", abortFromExternal, { once: true });
        removeExternalAbortListener = () =>
          mutateOptions.signal.removeEventListener("abort", abortFromExternal);
      }
    }

    setPending(true);
    setError(null);
    let context;
    let previousSnapshots = null;
    let result;
    let settledError = null;

    const isCurrent = () => id === requestId && !disposed;
    const isAborted = () => Boolean(controller?.signal?.aborted);

    try {
      if (typeof options.onMutate === "function") {
        context = await options.onMutate(input);
      }
      if (!isCurrent()) {
        throw makeAbortError("Mutation superseded");
      }
      if (isAborted()) {
        throw makeAbortError();
      }

      // Support simple optimistic: onMutate may return { rollback, snapshots }
      if (context && context.snapshots) {
        previousSnapshots = context.snapshots;
      }

      result = await mutationFn(input, { signal: controller ? controller.signal : undefined });

      if (!isCurrent() || isAborted()) {
        // Superseded by a newer mutate/reset/dispose, or aborted externally —
        // do not commit UI state; surface AbortError so callers can distinguish cancel.
        throw makeAbortError("Mutation superseded");
      }

      setData(result);
      if (typeof options.onSuccess === "function") {
        options.onSuccess(result, input, context);
      }
      if (Array.isArray(options.invalidateKeys)) {
        for (const key of options.invalidateKeys) invalidateQuery(key);
      }
      if (typeof options.onSettled === "function") {
        options.onSettled(result, null, input, context);
      }
      return result;
    } catch (err) {
      settledError = err;
      if (!isCurrent()) {
        throw err;
      }

      // Aborts from reset/dispose/supersede/external signal: roll back optimistic
      // state but do not treat as a mutation error signal.
      if (err && err.name === "AbortError") {
        if (typeof context?.rollback === "function") {
          try {
            context.rollback();
          } catch (_) {}
        } else if (previousSnapshots && typeof previousSnapshots === "object") {
          batch(() => {
            for (const [key, value] of Object.entries(previousSnapshots)) {
              setQueryData(key, value);
            }
          });
        }
        throw err;
      }

      setError(err);
      if (typeof context?.rollback === "function") {
        try {
          context.rollback();
        } catch (_) {}
      } else if (previousSnapshots && typeof previousSnapshots === "object") {
        batch(() => {
          for (const [key, value] of Object.entries(previousSnapshots)) {
            setQueryData(key, value);
          }
        });
      }
      if (typeof options.onError === "function") {
        options.onError(err, input, context);
      }
      if (typeof options.onSettled === "function") {
        options.onSettled(undefined, err, input, context);
      }
      throw err;
    } finally {
      removeExternalAbortListener?.();
      removeExternalAbortListener = null;
      if (activeController === controller) {
        activeController = null;
      }
      if (id === requestId) {
        setPending(false);
      }
      // Avoid unused-variable lint noise if tree-shaken in some builds
      void settledError;
      void result;
    }
  }

  function reset() {
    requestId++;
    abortActive();
    setPending(false);
    setError(null);
    setData(undefined);
  }

  /**
   * Abort in-flight work and prevent further mutates.
   * Safe to call multiple times.
   */
  function dispose() {
    if (disposed) return;
    disposed = true;
    reset();
  }

  return {
    mutate,
    pending,
    error,
    data,
    reset,
    dispose
  };
}

/**
 * Optimistic helper: update cache, return rollback.
 */
export function optimisticUpdate(key, updater) {
  const previous = queryCache.has(key) ? queryCache.get(key) : undefined;
  const next = typeof updater === "function" ? updater(previous) : updater;
  setQueryData(key, next);
  return {
    previous,
    rollback() {
      if (previous === undefined) queryCache.delete(key);
      else setQueryData(key, previous);
    }
  };
}
