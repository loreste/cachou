/**
 * Custom directive registry and built-in model binding.
 */

import { effect, untrack } from "./reactivity.js";

const registry = new Map();

/**
 * Register a directive used as use:name={value} in templates.
 * @param {string} name
 * @param {(el: Element, accessor: () => any) => void | (() => void)} handler
 */
export function directive(name, handler) {
  if (!name || typeof handler !== "function") {
    throw new Error("directive(name, handler) requires a name and function");
  }
  registry.set(String(name), handler);
  return () => {
    if (registry.get(String(name)) === handler) registry.delete(String(name));
  };
}

export function getDirective(name) {
  return registry.get(String(name));
}

export function listDirectives() {
  return Array.from(registry.keys());
}

/**
 * Apply a directive to an element. Returns optional cleanup.
 * @returns {void | (() => void)}
 */
export function applyDirective(el, name, value) {
  const handler = registry.get(String(name));
  if (!handler) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(`⚡ [CachouJS]: unknown directive use:${name}`);
    }
    return;
  }
  const accessor = typeof value === "function" ? value : () => value;
  return handler(el, accessor);
}

/** Built-in two-way model for input/textarea/select. value is [get, set]. */
export function modelDirective(el, accessor) {
  const cleanups = [];
  const stop = effect(() => {
    const pair = accessor();
    const get = Array.isArray(pair) ? pair[0] : pair;
    const set = Array.isArray(pair) ? pair[1] : null;
    const current = typeof get === "function" ? get() : get;
    if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
      if (el.type === "checkbox") el.checked = Boolean(current);
      else el.checked = el.value === String(current);
    } else if (el.tagName === "SELECT" && el.multiple && Array.isArray(current)) {
      for (const opt of el.options) {
        opt.selected = current.map(String).includes(opt.value);
      }
    } else if ("value" in el) {
      const next = current == null ? "" : String(current);
      if (el.value !== next) el.value = next;
    }

    if (!el.$$cachouModelBound && typeof set === "function") {
      el.$$cachouModelBound = true;
      const onInput = () => {
        if (el.type === "checkbox") set(el.checked);
        else if (el.type === "radio") {
          if (el.checked) set(el.value);
        } else if (el.tagName === "SELECT" && el.multiple) {
          set(Array.from(el.selectedOptions).map(o => o.value));
        } else {
          set(el.value);
        }
      };
      const eventName =
        el.type === "checkbox" || el.type === "radio" || el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(eventName, onInput);
      cleanups.push(() => el.removeEventListener(eventName, onInput));
    }
  });
  cleanups.push(stop);
  return () => {
    for (const fn of cleanups) {
      try {
        fn();
      } catch (_) {}
    }
  };
}

directive("model", modelDirective);

/** Ref callback: use:ref=${el => ...} */
directive("ref", (el, accessor) => {
  const fn = untrack(() => accessor());
  if (typeof fn === "function") fn(el);
  return () => {
    const latest = untrack(() => accessor());
    if (typeof latest === "function") latest(null);
  };
});
