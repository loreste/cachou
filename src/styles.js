import { effect, onCleanup } from "./reactivity.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simple deterministic hash from a string. Returns a short hex string.
 * @param {string} str
 * @returns {string}
 */
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/** Set of content hashes already injected globally (dedup). */
const injectedGlobals = new Set();

/** Counter for unique CSS variable names within scoped styles. */
let varCounter = 0;

/** Registry of injected keyframes names (dedup). */
const injectedKeyframes = new Set();

// ---------------------------------------------------------------------------
// css tagged template
// ---------------------------------------------------------------------------

/**
 * Tagged template that creates a scoped `<style>` element, auto-injected into
 * the document head. Returns a scoping class name.
 *
 * If any interpolated value is a signal getter (function), an effect is set up
 * to reactively update the corresponding CSS custom property.
 *
 * @example
 * ```js
 * const [color, setColor] = signal('#f00');
 * const cls = css`
 *   .self { color: ${color}; padding: 8px; }
 * `;
 * ```
 *
 * @param {TemplateStringsArray} strings
 * @param {...*} values
 * @returns {string} The generated scoping class name.
 */
export function css(strings, ...values) {
  const reactiveBindings = []; // { varName, getter }
  let rawCSS = "";

  for (let i = 0; i < strings.length; i++) {
    rawCSS += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (typeof val === "function") {
        const varName = `--_cv${varCounter++}`;
        rawCSS += `var(${varName})`;
        reactiveBindings.push({ varName, getter: val });
      } else {
        rawCSS += String(val ?? "");
      }
    }
  }

  const hash = hashString(rawCSS);
  const scopeClass = `c-${hash}`;

  // Scope each rule by prepending the scope class
  const scopedCSS = rawCSS.replace(/\.self\b/g, `.${scopeClass}`);

  if (typeof document !== "undefined") {
    const style = document.createElement("style");
    style.setAttribute("data-cachou-scope", scopeClass);
    style.textContent = scopedCSS;
    document.head.appendChild(style);

    // Set up reactive CSS custom properties on the style element's parent scope
    if (reactiveBindings.length > 0) {
      effect(() => {
        for (const { varName, getter } of reactiveBindings) {
          const val = getter();
          document.documentElement.style.setProperty(varName, String(val ?? ""));
        }
        onCleanup(() => {
          for (const { varName } of reactiveBindings) {
            document.documentElement.style.removeProperty(varName);
          }
        });
      });
    }
  }

  return scopeClass;
}

// ---------------------------------------------------------------------------
// cssVar
// ---------------------------------------------------------------------------

/**
 * Bind a CSS custom property to a reactive signal on a specific element.
 *
 * @param {string} name - The CSS custom property name (e.g. `--my-color`).
 * @param {function} signalGetter - A signal getter (function) that returns the value.
 * @param {HTMLElement} [el] - Target element. Defaults to `document.documentElement`.
 * @returns {function} Cleanup function that removes the binding.
 */
export function cssVar(name, signalGetter, el) {
  const target = el || (typeof document !== "undefined" ? document.documentElement : null);
  if (!target) return () => {};

  const prefixed = name.startsWith("--") ? name : `--${name}`;

  const stop = effect(() => {
    const val = signalGetter();
    target.style.setProperty(prefixed, String(val ?? ""));
    onCleanup(() => {
      target.style.removeProperty(prefixed);
    });
  });

  return stop;
}

// ---------------------------------------------------------------------------
// createTheme
// ---------------------------------------------------------------------------

/**
 * Create a theme object from a token map.
 *
 * Tokens are exposed as CSS custom properties prefixed with `--cachou-`.
 * Returns `{ vars, className, apply(el) }`.
 *
 * @param {Record<string, string|number>} tokens - Map of token names to values.
 * @returns {{ vars: Record<string, string>, className: string, apply: (el: HTMLElement) => void }}
 *
 * @example
 * ```js
 * const theme = createTheme({
 *   primary: '#3b82f6',
 *   spacing: '8px',
 *   fontFamily: 'Inter, sans-serif',
 *   radius: '6px',
 *   shadow: '0 2px 4px rgba(0,0,0,.1)'
 * });
 * el.classList.add(theme.className);
 * ```
 */
export function theme(tokens) {
  const vars = {};
  let cssText = "";

  for (const [key, value] of Object.entries(tokens)) {
    const varName = `--cachou-${key}`;
    vars[key] = `var(${varName})`;
    cssText += `${varName}: ${value}; `;
  }

  const hash = hashString(cssText);
  const className = `cachou-theme-${hash}`;

  if (typeof document !== "undefined") {
    const style = document.createElement("style");
    style.setAttribute("data-cachou-theme", className);
    style.textContent = `.${className} { ${cssText} }`;
    document.head.appendChild(style);
  }

  return {
    /** Map of token names to `var(--cachou-<name>)` references. */
    vars,
    /** The generated class name to apply to a container element. */
    className,
    /**
     * Apply theme to an element by adding the theme class.
     * @param {HTMLElement} el
     */
    apply(el) {
      el.classList.add(className);
    }
  };
}

// ---------------------------------------------------------------------------
// injectGlobalStyles
// ---------------------------------------------------------------------------

/**
 * Inject global CSS styles once. Repeated calls with the same content are
 * de-duplicated by content hash.
 *
 * @param {string} cssText - Raw CSS text to inject.
 */
export function globalCSS(cssText) {
  const hash = hashString(cssText);
  if (injectedGlobals.has(hash)) return;
  injectedGlobals.add(hash);

  if (typeof document !== "undefined") {
    const style = document.createElement("style");
    style.setAttribute("data-cachou-global", hash);
    style.textContent = cssText;
    document.head.appendChild(style);
  }
}

// ---------------------------------------------------------------------------
// cx — conditional class joiner
// ---------------------------------------------------------------------------

/**
 * Conditional class name joiner (like `clsx`).
 *
 * Accepts strings, objects `{ active: bool }`, arrays, and falsy values.
 *
 * @param {...(string|Record<string,boolean>|Array|null|undefined|false)} args
 * @returns {string}
 *
 * @example
 * ```js
 * cx('btn', { active: isActive(), large: size() === 'lg' }, condition && 'extra');
 * // => "btn active extra"
 * ```
 */
export function cx(...args) {
  const classes = [];

  for (const arg of args) {
    if (!arg) continue;

    if (typeof arg === "string") {
      classes.push(arg);
    } else if (Array.isArray(arg)) {
      const inner = cx(...arg);
      if (inner) classes.push(inner);
    } else if (typeof arg === "object") {
      for (const key of Object.keys(arg)) {
        if (arg[key]) classes.push(key);
      }
    }
  }

  return classes.join(" ");
}

// ---------------------------------------------------------------------------
// keyframes
// ---------------------------------------------------------------------------

/**
 * Register a `@keyframes` animation and return the animation name.
 *
 * Repeated calls with the same name are de-duplicated.
 *
 * @param {string} name - The animation name.
 * @param {Record<string, string|Record<string, string>>} frames - Keyframe map
 *   keyed by stop (e.g. `"0%"`, `"from"`, `"to"`, `"50%"`). Values are either
 *   raw CSS strings or objects of property/value pairs.
 * @returns {string} The animation name (same as input).
 *
 * @example
 * ```js
 * const spin = keyframes('spin', {
 *   from: { transform: 'rotate(0deg)' },
 *   to: { transform: 'rotate(360deg)' }
 * });
 * ```
 */
export function keyframes(name, frames) {
  if (injectedKeyframes.has(name)) return name;
  injectedKeyframes.add(name);

  let body = "";
  for (const [stop, declarations] of Object.entries(frames)) {
    if (typeof declarations === "string") {
      body += `${stop} { ${declarations} } `;
    } else if (typeof declarations === "object" && declarations !== null) {
      const props = Object.entries(declarations)
        .map(([prop, val]) => {
          // Convert camelCase to kebab-case
          const kebab = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
          return `${kebab}: ${val}`;
        })
        .join("; ");
      body += `${stop} { ${props}; } `;
    }
  }

  const cssText = `@keyframes ${name} { ${body} }`;

  if (typeof document !== "undefined") {
    const style = document.createElement("style");
    style.setAttribute("data-cachou-keyframes", name);
    style.textContent = cssText;
    document.head.appendChild(style);
  }

  return name;
}
