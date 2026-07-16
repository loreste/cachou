// ---------------------------------------------------------------------------
// Cachou Transitions — built-in transition primitives
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Built-in easing functions
// ---------------------------------------------------------------------------

/** @param {number} t */
export const linear = (t) => t;

/** @param {number} t */
export const easeIn = (t) => t * t;

/** @param {number} t */
export const easeOut = (t) => t * (2 - t);

/** @param {number} t */
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

/**
 * Create a cubic-bezier easing function.
 *
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {(t: number) => number}
 */
export function cubicBezier(x1, y1, x2, y2) {
  // Newton-Raphson approximation for cubic bezier
  return (t) => {
    if (t === 0 || t === 1) return t;

    // Binary search for the parametric t that maps to our input t on the x axis
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      const x = bezierComponent(mid, x1, x2);
      if (Math.abs(x - t) < 1e-6) return bezierComponent(mid, y1, y2);
      if (x < t) lo = mid;
      else hi = mid;
    }
    return bezierComponent((lo + hi) / 2, y1, y2);
  };
}

/** Evaluate one component of a cubic bezier at parameter u. */
function bezierComponent(u, p1, p2) {
  return 3 * (1 - u) * (1 - u) * u * p1 + 3 * (1 - u) * u * u * p2 + u * u * u;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_DURATION = 300;
const DEFAULT_EASING = easeOut;

/**
 * Run a CSS-transition-based animation using the Web Animations API.
 *
 * @param {HTMLElement} node
 * @param {Keyframe[]} keyframes
 * @param {object} opts
 * @param {number} opts.duration
 * @param {number} opts.delay
 * @param {function} [opts.easing]
 * @param {function} [opts.onStart]
 * @param {function} [opts.onEnd]
 * @returns {{ finished: Promise<void>, cancel: () => void }}
 */
function animate(node, keyframes, opts) {
  const {
    duration = DEFAULT_DURATION,
    delay = 0,
    easing = DEFAULT_EASING,
    onStart,
    onEnd
  } = opts;

  // Map our easing function to a CSS easing string or use linear + computed values
  const easingStr = easingToCSSString(easing);
  const useComputedEasing = easingStr === null;

  let animation;
  let cancelled = false;

  if (useComputedEasing) {
    // Generate intermediate keyframes for non-standard easing
    const steps = Math.max(Math.ceil(duration / 16), 2);
    const expandedFrames = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const easedT = easing(t);
      const frame = {};
      for (const key of Object.keys(keyframes[0])) {
        const from = parseFloat(keyframes[0][key]) || 0;
        const to = parseFloat(keyframes[keyframes.length - 1][key]) || (key === "opacity" ? 1 : 0);
        // For transform-based properties just interpolate between start/end strings
        if (key === "transform") {
          frame[key] = interpolateTransform(keyframes[0][key], keyframes[keyframes.length - 1][key], easedT);
        } else {
          frame[key] = String(from + (to - from) * easedT);
        }
      }
      frame.offset = t;
      expandedFrames.push(frame);
    }
    animation = node.animate(expandedFrames, { duration, delay, fill: "both" });
  } else {
    animation = node.animate(keyframes, {
      duration,
      delay,
      easing: easingStr,
      fill: "both"
    });
  }

  let delayTimer = null;
  if (onStart) {
    if (delay > 0) {
      delayTimer = setTimeout(onStart, delay);
    } else {
      onStart();
    }
  }

  const finished = animation.finished
    .then(() => {
      if (delayTimer != null) {
        clearTimeout(delayTimer);
        delayTimer = null;
      }
      if (!cancelled) {
        // Commit final styles and clean up
        commitFinalStyles(node, keyframes[keyframes.length - 1]);
        animation.cancel();
        if (onEnd) onEnd();
      }
    })
    .catch(() => {
      // Animation was cancelled
      if (delayTimer != null) {
        clearTimeout(delayTimer);
        delayTimer = null;
      }
    });

  return {
    finished,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      if (delayTimer != null) {
        clearTimeout(delayTimer);
        delayTimer = null;
      }
      animation.cancel();
    }
  };
}

/**
 * Commit an object of style properties to the element's inline style.
 * @param {HTMLElement} node
 * @param {Record<string, string>} styles
 */
function commitFinalStyles(node, styles) {
  if (!styles) return;
  for (const [key, value] of Object.entries(styles)) {
    if (key === "offset") continue;
    node.style[key] = value;
  }
}

/**
 * Remove transition-related inline styles from the element.
 * @param {HTMLElement} node
 * @param {string[]} props
 */
function cleanStyles(node, props) {
  for (const prop of props) {
    node.style.removeProperty(typeof prop === "string" && prop.includes("-") ? prop : camelToKebab(prop));
  }
}

function camelToKebab(str) {
  return str.replace(/([A-Z])/g, "-$1").toLowerCase();
}

/**
 * Map built-in easing functions to CSS easing strings.
 * Returns null if no CSS equivalent exists.
 * @param {function} fn
 * @returns {string|null}
 */
function easingToCSSString(fn) {
  if (fn === linear) return "linear";
  if (fn === easeIn) return "ease-in";
  if (fn === easeOut) return "ease-out";
  if (fn === easeInOut) return "ease-in-out";
  return null;
}

/**
 * Simple linear interpolation between two transform strings.
 * Only handles single-function transforms (e.g. translateY, scale).
 */
function interpolateTransform(from, to, t) {
  if (!from || !to) return to || from || "";
  // Extract numeric values and interpolate
  const fromNums = (from.match(/-?[\d.]+/g) || []).map(Number);
  const toNums = (to.match(/-?[\d.]+/g) || []).map(Number);
  if (fromNums.length !== toNums.length) {
    return t < 0.5 ? from : to;
  }
  let result = to;
  const resultNums = toNums.map((tv, i) => fromNums[i] + (tv - fromNums[i]) * t);
  let idx = 0;
  result = to.replace(/-?[\d.]+/g, () => String(resultNums[idx++]));
  return result;
}

// ---------------------------------------------------------------------------
// fade
// ---------------------------------------------------------------------------

/**
 * Fade transition — opacity 0 to 1 on enter, 1 to 0 on leave.
 *
 * @param {HTMLElement} node - Target DOM element.
 * @param {{ duration?: number, delay?: number, easing?: function, onStart?: function, onEnd?: function }} [options]
 * @returns {{ enter: () => { finished: Promise<void>, cancel: () => void }, leave: () => { finished: Promise<void>, cancel: () => void }, destroy: () => void }}
 */
export function fade(node, options = {}) {
  const opts = { duration: DEFAULT_DURATION, delay: 0, easing: DEFAULT_EASING, ...options };
  let current = null;

  return {
    enter() {
      if (current) current.cancel();
      current = animate(node, [{ opacity: "0" }, { opacity: "1" }], { ...opts, onStart: opts.onStart, onEnd: opts.onEnd });
      return current;
    },
    leave() {
      if (current) current.cancel();
      current = animate(node, [{ opacity: "1" }, { opacity: "0" }], { ...opts, onStart: opts.onStart, onEnd: opts.onEnd });
      return current;
    },
    destroy() {
      if (current) current.cancel();
      cleanStyles(node, ["opacity"]);
    }
  };
}

// ---------------------------------------------------------------------------
// slide
// ---------------------------------------------------------------------------

/**
 * Slide transition — slide in/out using height (or width) with overflow hidden.
 *
 * @param {HTMLElement} node - Target DOM element.
 * @param {{ duration?: number, delay?: number, easing?: function, axis?: 'y'|'x', onStart?: function, onEnd?: function }} [options]
 * @returns {{ enter: () => { finished: Promise<void>, cancel: () => void }, leave: () => { finished: Promise<void>, cancel: () => void }, destroy: () => void }}
 */
export function slide(node, options = {}) {
  const opts = { duration: DEFAULT_DURATION, delay: 0, easing: DEFAULT_EASING, axis: "y", ...options };
  const prop = opts.axis === "x" ? "width" : "height";
  let current = null;

  function measure() {
    // Temporarily make visible to measure natural size
    const prev = node.style[prop];
    const prevOverflow = node.style.overflow;
    node.style[prop] = "";
    node.style.overflow = "";
    const size = node.getBoundingClientRect()[prop === "height" ? "height" : "width"];
    node.style[prop] = prev;
    node.style.overflow = prevOverflow;
    return `${size}px`;
  }

  return {
    enter() {
      if (current) current.cancel();
      const size = measure();
      node.style.overflow = "hidden";
      current = animate(
        node,
        [{ [prop]: "0px", opacity: "0" }, { [prop]: size, opacity: "1" }],
        {
          ...opts,
          onEnd() {
            node.style.overflow = "";
            cleanStyles(node, [prop]);
            if (opts.onEnd) opts.onEnd();
          }
        }
      );
      return current;
    },
    leave() {
      if (current) current.cancel();
      const size = measure();
      node.style.overflow = "hidden";
      current = animate(
        node,
        [{ [prop]: size, opacity: "1" }, { [prop]: "0px", opacity: "0" }],
        {
          ...opts,
          onEnd() {
            node.style.overflow = "";
            if (opts.onEnd) opts.onEnd();
          }
        }
      );
      return current;
    },
    destroy() {
      if (current) current.cancel();
      node.style.overflow = "";
      cleanStyles(node, [prop, "opacity"]);
    }
  };
}

// ---------------------------------------------------------------------------
// fly
// ---------------------------------------------------------------------------

/**
 * Fly transition — translate + opacity.
 *
 * @param {HTMLElement} node - Target DOM element.
 * @param {{ x?: number, y?: number, duration?: number, delay?: number, easing?: function, onStart?: function, onEnd?: function }} [options]
 * @returns {{ enter: () => { finished: Promise<void>, cancel: () => void }, leave: () => { finished: Promise<void>, cancel: () => void }, destroy: () => void }}
 */
export function fly(node, options = {}) {
  const opts = { x: 0, y: -20, duration: DEFAULT_DURATION, delay: 0, easing: DEFAULT_EASING, ...options };
  let current = null;

  const fromTransform = `translate(${opts.x}px, ${opts.y}px)`;
  const toTransform = "translate(0px, 0px)";

  return {
    enter() {
      if (current) current.cancel();
      current = animate(
        node,
        [{ transform: fromTransform, opacity: "0" }, { transform: toTransform, opacity: "1" }],
        { ...opts, onStart: opts.onStart, onEnd: opts.onEnd }
      );
      return current;
    },
    leave() {
      if (current) current.cancel();
      current = animate(
        node,
        [{ transform: toTransform, opacity: "1" }, { transform: fromTransform, opacity: "0" }],
        { ...opts, onStart: opts.onStart, onEnd: opts.onEnd }
      );
      return current;
    },
    destroy() {
      if (current) current.cancel();
      cleanStyles(node, ["transform", "opacity"]);
    }
  };
}

// ---------------------------------------------------------------------------
// scale
// ---------------------------------------------------------------------------

/**
 * Scale transition — scale transform + opacity.
 *
 * @param {HTMLElement} node - Target DOM element.
 * @param {{ start?: number, duration?: number, delay?: number, easing?: function, onStart?: function, onEnd?: function }} [options]
 * @returns {{ enter: () => { finished: Promise<void>, cancel: () => void }, leave: () => { finished: Promise<void>, cancel: () => void }, destroy: () => void }}
 */
export function scale(node, options = {}) {
  const opts = { start: 0, duration: DEFAULT_DURATION, delay: 0, easing: DEFAULT_EASING, ...options };
  let current = null;

  return {
    enter() {
      if (current) current.cancel();
      current = animate(
        node,
        [{ transform: `scale(${opts.start})`, opacity: "0" }, { transform: "scale(1)", opacity: "1" }],
        { ...opts, onStart: opts.onStart, onEnd: opts.onEnd }
      );
      return current;
    },
    leave() {
      if (current) current.cancel();
      current = animate(
        node,
        [{ transform: "scale(1)", opacity: "1" }, { transform: `scale(${opts.start})`, opacity: "0" }],
        { ...opts, onStart: opts.onStart, onEnd: opts.onEnd }
      );
      return current;
    },
    destroy() {
      if (current) current.cancel();
      cleanStyles(node, ["transform", "opacity"]);
    }
  };
}

// ---------------------------------------------------------------------------
// crossfade
// ---------------------------------------------------------------------------

/**
 * Create a `[send, receive]` pair for FLIP-style transitions between locations.
 *
 * Elements are matched by a `key` property in the options passed to `send`/`receive`.
 *
 * @param {{ duration?: number, delay?: number, easing?: function, fallback?: function }} [options]
 * @returns {[send: (node: HTMLElement, opts: { key: any }) => { finished: Promise<void>, cancel: () => void }, receive: (node: HTMLElement, opts: { key: any }) => { finished: Promise<void>, cancel: () => void }]}
 */
export function swap(options = {}) {
  const {
    duration = DEFAULT_DURATION,
    delay = 0,
    easing = DEFAULT_EASING,
    fallback = (node) => fade(node, { duration, delay, easing })
  } = options;

  /** @type {Map<any, { node: HTMLElement, rect: DOMRect }>} */
  const pending = new Map();

  function makeTransition(from, to, introNode) {
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sw = from.width / to.width;
    const sh = from.height / to.height;

    return animate(introNode, [
      { transform: `translate(${dx}px, ${dy}px) scale(${sw}, ${sh})`, opacity: "0" },
      { transform: "translate(0px, 0px) scale(1, 1)", opacity: "1" }
    ], { duration, delay, easing });
  }

  function send(node, opts = {}) {
    const rect = node.getBoundingClientRect();
    const key = opts.key;

    const match = pending.get(key);
    if (match) {
      pending.delete(key);
      // The receiver is waiting — animate the receiver from our position
      return makeTransition(rect, match.rect, match.node);
    }

    // Store our rect so `receive` can pick it up
    pending.set(key, { node, rect });

    // Resolve after a tick — if nobody called receive, use fallback
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        if (pending.has(key) && pending.get(key).node === node) {
          pending.delete(key);
          const fb = fallback(node);
          resolve(fb.leave());
        } else {
          resolve({ finished: Promise.resolve(), cancel() {} });
        }
      });
    });
  }

  function receive(node, opts = {}) {
    const rect = node.getBoundingClientRect();
    const key = opts.key;

    const match = pending.get(key);
    if (match) {
      pending.delete(key);
      return makeTransition(match.rect, rect, node);
    }

    pending.set(key, { node, rect });

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        if (pending.has(key) && pending.get(key).node === node) {
          pending.delete(key);
          const fb = fallback(node);
          resolve(fb.enter());
        } else {
          resolve({ finished: Promise.resolve(), cancel() {} });
        }
      });
    });
  }

  return [send, receive];
}

// ---------------------------------------------------------------------------
// transition directive
// ---------------------------------------------------------------------------

/**
 * High-level transition directive. Automatically runs `enter` on mount and
 * `leave` before unmount. Works as a `use:` directive.
 *
 * @param {HTMLElement} node - Target DOM element.
 * @param {function} transitionFn - A transition factory (e.g. `fade`, `slide`).
 * @param {object} [options] - Options passed to the transition function.
 * @returns {function} Cleanup function.
 *
 * @example
 * ```js
 * html`<div use:transition=${[fade, { duration: 200 }]}>Hello</div>`
 * ```
 */
export function transition(node, transitionFn, options = {}) {
  const t = transitionFn(node, options);
  const handle = t.enter();

  // Register leave transition for removeNodeWithTransition
  node.__cachouTransition = t;

  return () => {
    t.destroy();
  };
}

// ---------------------------------------------------------------------------
// createTransition
// ---------------------------------------------------------------------------

/**
 * Create a custom transition from explicit enter/leave functions.
 *
 * Each function receives `(node, options)` and should return
 * `{ finished: Promise, cancel() }`.
 *
 * @param {(node: HTMLElement, opts: object) => { finished: Promise<void>, cancel: () => void }} enterFn
 * @param {(node: HTMLElement, opts: object) => { finished: Promise<void>, cancel: () => void }} leaveFn
 * @returns {(node: HTMLElement, options?: object) => { enter: () => any, leave: () => any, destroy: () => void }}
 */
export function defineTransition(enterFn, leaveFn) {
  return (node, options = {}) => {
    let current = null;

    return {
      enter() {
        if (current) current.cancel();
        current = enterFn(node, options);
        return current;
      },
      leave() {
        if (current) current.cancel();
        current = leaveFn(node, options);
        return current;
      },
      destroy() {
        if (current) current.cancel();
      }
    };
  };
}
