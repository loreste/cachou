/**
 * Persist a signal getter/setter pair to Web Storage (or custom storage).
 */

import { effect, untrack } from "./reactivity.js";

/**
 * @param {[() => any, (v: any) => void]} signalPair
 * @param {{ key: string, storage?: Storage, serialize?: (v:any)=>string, deserialize?: (s:string)=>any, sync?: boolean }} options
 * @returns {() => void} dispose
 */
export function persist(signalPair, options = {}) {
  const [get, set] = signalPair;
  const key = options.key;
  if (!key) throw new Error("persist requires options.key");

  const storage =
    options.storage ||
    (typeof localStorage !== "undefined" ? localStorage : null);
  const serialize = options.serialize || (v => JSON.stringify(v));
  const deserialize = options.deserialize || (s => JSON.parse(s));

  if (storage) {
    try {
      const raw = storage.getItem(key);
      if (raw != null) {
        untrack(() => set(deserialize(raw)));
      }
    } catch (_) {}
  }

  const stop = effect(() => {
    const value = get();
    if (!storage) return;
    try {
      storage.setItem(key, serialize(value));
    } catch (_) {}
  });

  let onStorage = null;
  if (options.sync !== false && typeof window !== "undefined" && storage === localStorage) {
    onStorage = event => {
      if (event.key !== key) return;
      try {
        if (event.newValue == null) return;
        set(deserialize(event.newValue));
      } catch (_) {}
    };
    window.addEventListener("storage", onStorage);
  }

  return () => {
    stop();
    if (onStorage) window.removeEventListener("storage", onStorage);
  };
}
