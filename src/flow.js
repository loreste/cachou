/**
 * Control-flow helpers (Solid-style) built on reactive functions.
 */

import { mapArray, effect, onCleanup, createRoot } from "./reactivity.js";

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

/**
 * Cache previously rendered component instances so they survive unmount/remount
 * cycles. Cached DOM is stored in a detached DocumentFragment and restored when
 * the same component key appears again.
 *
 * Works with the router — wrap your page outlet in KeepAlive to cache pages
 * across navigation.
 *
 * @param {object} props
 * @param {number}   [props.max]          Maximum cache size (LRU eviction).
 * @param {string[]} [props.include]      Component names to cache (whitelist).
 * @param {string[]} [props.exclude]      Component names to never cache (blacklist).
 * @param {Function} [props.onActivate]   Called when a cached view is re-activated.
 * @param {Function} [props.onDeactivate] Called when a view is moved into cache.
 * @param {Function} props.children       Accessor returning the active component.
 *
 * @example
 * KeepAlive({ max: 10, children: () => currentPage() })
 */
export function KeepAlive(props) {
  /** @type {Map<string, { fragment: DocumentFragment, dispose: Function|null, nodes: Node[] }>} */
  const cache = new Map();
  /** LRU tracking via Map insertion order — delete + re-set = move to end (O(1)) */
  const lruMap = new Map();

  const max = props.max || Infinity;
  const include = props.include || null;
  const exclude = props.exclude || null;

  /** Resolve a stable cache key from a component value. */
  function resolveKey(value) {
    if (value == null) return null;
    if (typeof value === "function" && value.name) return value.name;
    if (typeof value === "object" && value.nodeName) {
      return value.nodeName + "#" + (value.id || (typeof value.getAttribute === "function" && value.getAttribute("data-cachou-key")) || "");
    }
    if (typeof value === "function") return String(value);
    return null;
  }

  /** Whether the given component name should be cached. */
  function shouldCache(name) {
    if (!name) return false;
    if (exclude && exclude.includes(name)) return false;
    if (include && !include.includes(name)) return false;
    return true;
  }

  /** Touch an entry — move it to the end of the LRU map (O(1)). */
  function touchLRU(key) {
    if (lruMap.has(key)) lruMap.delete(key);
    lruMap.set(key, true);
  }

  /** Evict the least-recently-used entry when over capacity. */
  function evictIfNeeded() {
    while (cache.size > max && lruMap.size > 0) {
      const evictKey = lruMap.keys().next().value;
      lruMap.delete(evictKey);
      const entry = cache.get(evictKey);
      if (entry) {
        if (entry.dispose) entry.dispose();
        cache.delete(evictKey);
      }
    }
  }

  let activeKey = null;
  let activeNodes = [];

  // Container element — acts as the live mount point
  const container = typeof document !== "undefined" ? document.createElement("div") : null;
  if (container) container.style.display = "contents";

  // SSR fallback — just render children directly
  if (!container) {
    return () => {
      const children = props.children;
      return typeof children === "function" ? children() : children;
    };
  }

  effect(() => {
    const children = props.children;
    const raw = typeof children === "function" ? children() : children;

    const newKey = resolveKey(raw);

    // Same component — nothing to do
    if (newKey && newKey === activeKey) {
      return;
    }

    // --- Deactivate current view ---
    if (activeKey && shouldCache(activeKey) && activeNodes.length > 0) {
      const fragment = document.createDocumentFragment();
      for (const node of activeNodes) {
        fragment.appendChild(node);
      }
      const existing = cache.get(activeKey);
      if (existing) {
        existing.fragment = fragment;
        existing.nodes = activeNodes;
      } else {
        cache.set(activeKey, { fragment, dispose: null, nodes: activeNodes });
      }
      touchLRU(activeKey);
      evictIfNeeded();

      if (typeof props.onDeactivate === "function") {
        try { props.onDeactivate(activeKey); } catch (_) { /* swallow */ }
      }
    }

    // Clear container
    container.textContent = "";
    activeNodes = [];
    activeKey = newKey;

    if (raw == null || raw === false) return;

    // --- Activate: restore from cache or render fresh ---
    if (newKey && shouldCache(newKey) && cache.has(newKey)) {
      const entry = cache.get(newKey);
      const restored = Array.from(entry.fragment.childNodes);
      for (const node of restored) {
        container.appendChild(node);
      }
      activeNodes = restored;
      entry.nodes = restored;
      touchLRU(newKey);

      if (typeof props.onActivate === "function") {
        try { props.onActivate(newKey); } catch (_) { /* swallow */ }
      }
    } else {
      // Render fresh content inside a reactive root so we can dispose later
      let disposeRoot = null;
      const nodes = [];

      createRoot((dispose) => {
        disposeRoot = dispose;
        const rendered = raw;

        if (rendered instanceof Node) {
          nodes.push(rendered);
        } else if (Array.isArray(rendered)) {
          for (const item of rendered) {
            if (item instanceof Node) nodes.push(item);
            else if (item != null && item !== false) nodes.push(document.createTextNode(String(item)));
          }
        } else if (rendered != null && rendered !== false) {
          nodes.push(document.createTextNode(String(rendered)));
        }
      });

      for (const node of nodes) {
        container.appendChild(node);
      }
      activeNodes = nodes;

      if (newKey && shouldCache(newKey)) {
        cache.set(newKey, { fragment: document.createDocumentFragment(), dispose: disposeRoot, nodes });
        touchLRU(newKey);
        evictIfNeeded();
      }

      if (typeof props.onActivate === "function") {
        try { props.onActivate(newKey); } catch (_) { /* swallow */ }
      }
    }
  });

  // Cleanup on unmount — dispose all cached roots
  onCleanup(() => {
    for (const [, entry] of cache) {
      if (entry.dispose) entry.dispose();
    }
    cache.clear();
    lruOrder.length = 0;
  });

  return container;
}
