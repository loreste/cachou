/**
 * Control-flow helpers (Solid-style) built on reactive functions.
 */

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
