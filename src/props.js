/**
 * Component prop helpers (Solid-style).
 */

/**
 * Split props into picked groups and a rest object.
 * @param {object} props
 * @param {...string[]} keyGroups
 * @returns {object[]}
 */
export function splitProps(props, ...keyGroups) {
  const used = new Set();
  const result = [];

  for (const keys of keyGroups) {
    const picked = {};
    for (const key of keys) {
      if (props != null && (key in props)) {
        used.add(key);
        Object.defineProperty(picked, key, {
          enumerable: true,
          configurable: true,
          get() {
            return props[key];
          },
          set(v) {
            props[key] = v;
          }
        });
      }
    }
    result.push(picked);
  }

  const rest = {};
  for (const key of Object.keys(props || {})) {
    if (used.has(key)) continue;
    Object.defineProperty(rest, key, {
      enumerable: true,
      configurable: true,
      get() {
        return props[key];
      },
      set(v) {
        props[key] = v;
      }
    });
  }
  result.push(rest);
  return result;
}

/**
 * Merge prop sources left-to-right. Later sources override earlier on read.
 */
export function mergeProps(...sources) {
  const proxy = {};
  const keys = new Set();
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source)) keys.add(key);
  }
  for (const key of keys) {
    Object.defineProperty(proxy, key, {
      enumerable: true,
      configurable: true,
      get() {
        let resolved = undefined;
        for (const source of sources) {
          if (source == null || !(key in source)) continue;
          resolved = source[key];
        }
        return resolved;
      }
    });
  }
  return proxy;
}

/**
 * Render a dynamic component or intrinsic tag name.
 * @param {{ component: any, children?: any, [key: string]: any }} props
 */
export function Dynamic(props) {
  return () => {
    let Target = props.component;
    if (typeof Target === "function" && Target.$$cachouSignal) {
      Target = Target();
    }

    if (typeof Target === "string") {
      if (typeof document === "undefined") {
        const children = props.children;
        return typeof children === "function" ? children() : children;
      }
      const el = document.createElement(Target);
      for (const [k, v] of Object.entries(props)) {
        if (k === "component" || k === "children") continue;
        if (k === "class" || k === "className") el.className = v == null ? "" : String(v);
        else if (k.startsWith("on") && typeof v === "function") {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v != null && v !== false) {
          el.setAttribute(k, v === true ? "" : String(v));
        }
      }
      const children = typeof props.children === "function" ? props.children() : props.children;
      if (children != null && children !== false) {
        const list = Array.isArray(children) ? children : [children];
        for (const child of list) {
          if (child == null || child === false) continue;
          if (child instanceof Node) el.appendChild(child);
          else el.appendChild(document.createTextNode(String(child)));
        }
      }
      return el;
    }

    if (typeof Target === "function") {
      const rest = { ...props };
      delete rest.component;
      return Target(rest);
    }

    return null;
  };
}
