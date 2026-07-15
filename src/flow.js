/**
 * Control-flow helpers (Solid-style) built on reactive functions.
 */

import { mapArray } from "./reactivity.js";

function read(value) {
  return typeof value === "function" ? value() : value;
}

/**
 * Conditionally render children when `when` is truthy.
 * Truthy values are passed to function children.
 */
export function Show(props) {
  return () => {
    const value = read(props.when);
    if (!value) {
      const fb = props.fallback;
      return fb == null ? null : read(fb);
    }
    const children = props.children;
    if (typeof children === "function") {
      return children(value);
    }
    return children;
  };
}

/**
 * Renders the first matching Match child.
 */
export function Switch(props) {
  return () => {
    const raw = props.children;
    const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
    for (const child of list) {
      const meta = child && child.$$cachouMatch;
      if (!meta) continue;
      const value = read(meta.when);
      if (!value) continue;
      const body = meta.children;
      return typeof body === "function" ? body(value) : body;
    }
    const fb = props.fallback;
    return fb == null ? null : read(fb);
  };
}

/**
 * Branch for Switch. Returns a marker; only meaningful as a Switch child.
 */
export function Match(props) {
  const marker = () => null;
  marker.$$cachouMatch = {
    when: props.when,
    children: props.children
  };
  return marker;
}

/**
 * Keyed list. Prefer over raw mapArray for component trees.
 * props.each: array or accessor; props.children: (item, index) => node; props.fallback optional
 * props.by: key function (item, index) => key
 */
export function For(props) {
  const mapped = mapArray(
    () => {
      const list = read(props.each);
      return Array.isArray(list) ? list : [];
    },
    (item, index) => {
      const children = props.children;
      return typeof children === "function" ? children(item, index) : children;
    },
    props.by || ((item, index) => (item && typeof item === "object" && "id" in item ? item.id : index)),
    { uniqueKeys: props.uniqueKeys !== false }
  );

  return () => {
    const nodes = mapped();
    if ((!nodes || nodes.length === 0) && props.fallback != null) {
      return read(props.fallback);
    }
    return nodes;
  };
}

/**
 * Index-stable list (items keyed by position).
 */
export function Index(props) {
  const mapped = mapArray(
    () => {
      const list = read(props.each);
      return Array.isArray(list) ? list : [];
    },
    (item, index) => {
      const children = props.children;
      // Index passes an accessor for the item at this index (Solid-style)
      const itemAccessor = () => {
        const list = read(props.each);
        return Array.isArray(list) ? list[index] : undefined;
      };
      return typeof children === "function" ? children(itemAccessor, index) : children;
    },
    (_item, index) => index
  );

  return () => {
    const nodes = mapped();
    if ((!nodes || nodes.length === 0) && props.fallback != null) {
      return read(props.fallback);
    }
    return nodes;
  };
}
