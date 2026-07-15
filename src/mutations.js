/**
 * Mutations and shared query cache helpers.
 */

import { signal, batch, invalidateResource } from "./reactivity.js";

const queryCache = new Map();
const queryListeners = new Map();

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

  async function mutate(input) {
    const id = ++requestId;
    setPending(true);
    setError(null);
    let context;
    let previousSnapshots = null;

    try {
      if (typeof options.onMutate === "function") {
        context = await options.onMutate(input);
      }
      // Support simple optimistic: onMutate may return { rollback, snapshots }
      if (context && context.snapshots) {
        previousSnapshots = context.snapshots;
      }

      const result = await mutationFn(input, { signal: undefined });
      if (id !== requestId) return result;

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
      if (id !== requestId) throw err;
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
      if (id === requestId) setPending(false);
    }
  }

  return {
    mutate,
    pending,
    error,
    data,
    reset() {
      requestId++;
      setPending(false);
      setError(null);
      setData(undefined);
    }
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
