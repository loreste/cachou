/**
 * CachouJS Testing Utilities
 *
 * Lightweight test helpers compatible with Node's built-in test runner,
 * Vitest, or Jest. Provides rendering, querying, event helpers, and
 * reactive flush utilities for component tests.
 *
 * @module cachoujs/test-utils
 */

import { createRoot, batch, effect } from "./reactivity.js";

/* ------------------------------------------------------------------ */
/*  ARIA implicit-role mapping (subset covering common elements)      */
/* ------------------------------------------------------------------ */

const IMPLICIT_ROLES = {
  A: (el) => el.hasAttribute("href") ? "link" : null,
  ARTICLE: () => "article",
  ASIDE: () => "complementary",
  BUTTON: () => "button",
  DETAILS: () => "group",
  DIALOG: () => "dialog",
  FOOTER: () => "contentinfo",
  FORM: () => "form",
  H1: () => "heading",
  H2: () => "heading",
  H3: () => "heading",
  H4: () => "heading",
  H5: () => "heading",
  H6: () => "heading",
  HEADER: () => "banner",
  HR: () => "separator",
  IMG: (el) => el.getAttribute("alt") === "" ? "presentation" : "img",
  INPUT: (el) => {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    const map = {
      button: "button",
      checkbox: "checkbox",
      image: "button",
      number: "spinbutton",
      radio: "radio",
      range: "slider",
      reset: "button",
      search: "searchbox",
      submit: "button",
      text: "textbox",
      email: "textbox",
      tel: "textbox",
      url: "textbox",
      password: "textbox",
    };
    return map[type] || "textbox";
  },
  LI: () => "listitem",
  MAIN: () => "main",
  MENU: () => "list",
  NAV: () => "navigation",
  OL: () => "list",
  OPTION: () => "option",
  OUTPUT: () => "status",
  PROGRESS: () => "progressbar",
  SECTION: () => "region",
  SELECT: (el) => el.hasAttribute("multiple") ? "listbox" : "combobox",
  SUMMARY: () => "button",
  TABLE: () => "table",
  TBODY: () => "rowgroup",
  TD: () => "cell",
  TEXTAREA: () => "textbox",
  TFOOT: () => "rowgroup",
  TH: () => "columnheader",
  THEAD: () => "rowgroup",
  TR: () => "row",
  UL: () => "list",
};

/**
 * Resolve the effective ARIA role for an element.
 * @param {Element} el
 * @returns {string|null}
 */
function getEffectiveRole(el) {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit.trim().split(/\s+/)[0];
  const fn = IMPLICIT_ROLES[el.tagName];
  return fn ? fn(el) : null;
}

/* ------------------------------------------------------------------ */
/*  Query helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build query helpers scoped to a container element.
 * @param {Element} container
 * @returns {Object}
 */
function createQueryHelpers(container) {
  /**
   * Find an element containing the given text.
   * @param {string|RegExp} text
   * @returns {Element|null}
   */
  function queryByText(text) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      const content = node.textContent || "";
      const match = text instanceof RegExp ? text.test(content) : content.includes(text);
      if (match) return node;
      node = walker.nextNode();
    }
    return null;
  }

  /**
   * Find element by text. Throws if not found.
   * @param {string|RegExp} text
   * @returns {Element}
   */
  function getByText(text) {
    const el = queryByText(text);
    if (!el) throw new Error(`getByText: could not find element with text "${text}"`);
    return el;
  }

  /**
   * Find element by ARIA role. Returns null if not found.
   * @param {string} role
   * @returns {Element|null}
   */
  function queryByRole(role) {
    const all = getAllByRole(role);
    return all.length > 0 ? all[0] : null;
  }

  /**
   * Find element by ARIA role. Throws if not found or multiple found.
   * @param {string} role
   * @returns {Element}
   */
  function getByRole(role) {
    const all = getAllByRole(role);
    if (all.length === 0) throw new Error(`getByRole: could not find element with role "${role}"`);
    if (all.length > 1) throw new Error(`getByRole: found ${all.length} elements with role "${role}", expected 1`);
    return all[0];
  }

  /**
   * Find all elements matching a given ARIA role.
   * @param {string} role
   * @returns {Element[]}
   */
  function getAllByRole(role) {
    const results = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE && getEffectiveRole(node) === role) {
        results.push(node);
      }
      node = walker.nextNode();
    }
    return results;
  }

  /**
   * Find element by `data-testid` attribute. Returns null if not found.
   * @param {string} id
   * @returns {Element|null}
   */
  function queryByTestId(id) {
    return container.querySelector(`[data-testid="${id}"]`);
  }

  /**
   * Find element by `data-testid` attribute. Throws if not found.
   * @param {string} id
   * @returns {Element}
   */
  function getByTestId(id) {
    const el = queryByTestId(id);
    if (!el) throw new Error(`getByTestId: could not find element with data-testid="${id}"`);
    return el;
  }

  return { getByText, queryByText, getByRole, queryByRole, getAllByRole, getByTestId, queryByTestId };
}

/* ------------------------------------------------------------------ */
/*  renderTest                                                        */
/* ------------------------------------------------------------------ */

/**
 * Render a component into a detached DOM container for testing.
 *
 * @param {Function} Component - Component function to render.
 * @param {Object} [options]
 * @param {Object} [options.props] - Props passed to the component.
 * @param {Element} [options.container] - Custom container element.
 * @returns {{ container: Element, unmount: Function, getByText: Function, queryByText: Function, getByRole: Function, queryByRole: Function, getAllByRole: Function, getByTestId: Function, queryByTestId: Function }}
 */
export function renderTest(Component, options = {}) {
  const container = options.container || document.createElement("div");
  let dispose;

  const el = createRoot((d) => {
    dispose = d;
    const props = options.props || {};
    return typeof Component === "function" ? Component(props) : Component;
  });

  if (el != null) {
    if (el instanceof Node) {
      container.appendChild(el);
    } else if (typeof el === "string" || typeof el === "number") {
      container.appendChild(document.createTextNode(String(el)));
    }
  }

  const queries = createQueryHelpers(container);

  return {
    container,
    unmount() {
      if (dispose) {
        dispose();
        dispose = null;
      }
      container.textContent = "";
    },
    ...queries,
  };
}

/* ------------------------------------------------------------------ */
/*  act                                                               */
/* ------------------------------------------------------------------ */

/**
 * Run `fn` and flush all pending reactive updates.
 * Returns a promise if `fn` is async.
 *
 * @param {Function} fn
 * @returns {Promise<void>|void}
 */
export function act(fn) {
  const result = batch(() => {
    const r = fn();
    return r;
  });

  // If the callback returned a promise, wait for it then yield a microtask
  if (result && typeof result.then === "function") {
    return result.then(() => new Promise((resolve) => {
      if (typeof queueMicrotask === "function") {
        queueMicrotask(resolve);
      } else {
        Promise.resolve().then(resolve);
      }
    }));
  }

  // Synchronous: yield a microtask to let effects propagate
  return new Promise((resolve) => {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(resolve);
    } else {
      Promise.resolve().then(resolve);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  fireEvent                                                         */
/* ------------------------------------------------------------------ */

/**
 * Dispatch a real DOM event on an element.
 * @param {Element} el
 * @param {string} eventName
 * @param {Object} [opts]
 * @returns {boolean}
 */
function dispatchEvent(el, eventName, opts = {}) {
  const EventCtor = eventName === "input" || eventName === "change"
    ? (typeof InputEvent !== "undefined" ? InputEvent : Event)
    : eventName.startsWith("key")
      ? KeyboardEvent
      : eventName === "submit"
        ? Event
        : eventName === "focus" || eventName === "blur"
          ? (typeof FocusEvent !== "undefined" ? FocusEvent : Event)
          : (typeof MouseEvent !== "undefined" ? MouseEvent : Event);

  const eventInit = { bubbles: true, cancelable: true, ...opts };

  // Apply target properties after dispatch (e.g. target.value)
  const targetProps = opts.target;
  if (targetProps) {
    delete eventInit.target;
  }

  const event = new EventCtor(eventName, eventInit);

  if (targetProps && typeof targetProps === "object") {
    Object.assign(el, targetProps);
  }

  return el.dispatchEvent(event);
}

/**
 * Event helpers for common user interactions.
 * Each dispatches a real DOM Event on the target element.
 */
export const fireEvent = {
  /**
   * Dispatch a click event.
   * @param {Element} el
   * @param {Object} [opts]
   */
  click(el, opts) {
    dispatchEvent(el, "click", opts);
  },

  /**
   * Dispatch an input event.
   * @param {Element} el
   * @param {Object} [opts]
   */
  input(el, opts) {
    if (opts && opts.target) {
      Object.assign(el, opts.target);
    }
    dispatchEvent(el, "input", opts);
  },

  /**
   * Dispatch a change event.
   * @param {Element} el
   * @param {Object} [opts]
   */
  change(el, opts) {
    if (opts && opts.target) {
      Object.assign(el, opts.target);
    }
    dispatchEvent(el, "change", opts);
  },

  /**
   * Dispatch a keydown event.
   * @param {Element} el
   * @param {Object} [opts]
   */
  keydown(el, opts) {
    dispatchEvent(el, "keydown", opts);
  },

  /**
   * Dispatch a keyup event.
   * @param {Element} el
   * @param {Object} [opts]
   */
  keyup(el, opts) {
    dispatchEvent(el, "keyup", opts);
  },

  /**
   * Dispatch a focus event.
   * @param {Element} el
   * @param {Object} [opts]
   */
  focus(el, opts) {
    el.focus();
    dispatchEvent(el, "focus", opts);
  },

  /**
   * Dispatch a blur event.
   * @param {Element} el
   * @param {Object} [opts]
   */
  blur(el, opts) {
    el.blur();
    dispatchEvent(el, "blur", opts);
  },

  /**
   * Dispatch a submit event.
   * @param {Element} el
   * @param {Object} [opts]
   */
  submit(el, opts) {
    dispatchEvent(el, "submit", opts);
  },
};

/* ------------------------------------------------------------------ */
/*  waitFor                                                           */
/* ------------------------------------------------------------------ */

/**
 * Poll until an assertion passes or timeout is reached.
 *
 * @param {Function} assertion - Function that throws if condition not met.
 * @param {Object} [options]
 * @param {number} [options.timeout=2000] - Max wait time in ms.
 * @param {number} [options.interval=50] - Polling interval in ms.
 * @returns {Promise<void>}
 */
export function waitFor(assertion, options = {}) {
  const timeout = options.timeout ?? 2000;
  const interval = options.interval ?? 50;

  return new Promise((resolve, reject) => {
    const start = Date.now();
    let lastError;

    function check() {
      try {
        assertion();
        resolve();
      } catch (err) {
        lastError = err;
        if (Date.now() - start >= timeout) {
          reject(lastError);
        } else {
          setTimeout(check, interval);
        }
      }
    }

    check();
  });
}
