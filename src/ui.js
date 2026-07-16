/**
 * Built-in UI components for Cachou.
 *
 * Provides essential UI primitives: Toast notifications, Drawer, Popover,
 * Menu (dropdown), DataTable, and InfiniteScroll. Zero external dependencies.
 *
 * @module cachoujs/ui
 */

import { signal, effect, onCleanup, createRoot, batch, onMount } from "./reactivity.js";
import { html } from "./html.js";
import { trapFocus, focusFirst } from "./a11y.js";
import { cx } from "./styles.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;

/** Generate a unique ID string. */
function uid(prefix = "cachou") {
  return `${prefix}-${++_idCounter}-${Date.now().toString(36)}`;
}

/** Read a value that may be a signal getter or a plain value. */
function read(value) {
  return typeof value === "function" ? value() : value;
}

/** Lock body scroll by setting overflow:hidden. Returns a restore function. */
function lockBodyScroll() {
  if (typeof document === "undefined") return () => {};
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => {
    document.body.style.overflow = prev;
  };
}

// ---------------------------------------------------------------------------
// 1. Toast System
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ToastOptions
 * @property {"top-right"|"top-left"|"bottom-right"|"bottom-left"|"top-center"|"bottom-center"} [position]
 * @property {number} [max]
 */

/**
 * @typedef {Object} ToastShowOptions
 * @property {"info"|"success"|"warning"|"error"} [type]
 * @property {number} [duration]
 * @property {{ label: string, onClick: () => void }} [action]
 * @property {boolean} [dismissible]
 */

/**
 * @typedef {Object} ToastController
 * @property {(message: string, opts?: ToastShowOptions) => string} show
 * @property {(message: string, opts?: ToastShowOptions) => string} success
 * @property {(message: string, opts?: ToastShowOptions) => string} error
 * @property {(message: string, opts?: ToastShowOptions) => string} info
 * @property {(message: string, opts?: ToastShowOptions) => string} warning
 * @property {(id: string) => void} dismiss
 * @property {() => void} dismissAll
 * @property {() => HTMLElement} mount
 */

const TOAST_STYLES = `
[data-cachou-toast-container] {
  position: fixed;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: min(420px, calc(100vw - 32px));
}
[data-cachou-toast-container][data-position="top-right"] { top: 16px; right: 16px; }
[data-cachou-toast-container][data-position="top-left"] { top: 16px; left: 16px; }
[data-cachou-toast-container][data-position="bottom-right"] { bottom: 16px; right: 16px; }
[data-cachou-toast-container][data-position="bottom-left"] { bottom: 16px; left: 16px; }
[data-cachou-toast-container][data-position="top-center"] { top: 16px; left: 50%; transform: translateX(-50%); }
[data-cachou-toast-container][data-position="bottom-center"] { bottom: 16px; left: 50%; transform: translateX(-50%); }
[data-cachou-toast] {
  pointer-events: auto;
  padding: 12px 16px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,.15);
  opacity: 0;
  transform: translateY(-8px);
  animation: cachou-toast-in .25s ease forwards;
  background: #333;
  color: #fff;
}
[data-cachou-toast].cachou-toast-exit {
  animation: cachou-toast-out .2s ease forwards;
}
[data-cachou-toast][data-type="success"] { background: #16a34a; color: #fff; }
[data-cachou-toast][data-type="error"] { background: #dc2626; color: #fff; }
[data-cachou-toast][data-type="warning"] { background: #d97706; color: #fff; }
[data-cachou-toast][data-type="info"] { background: #2563eb; color: #fff; }
[data-cachou-toast] button.cachou-toast-action {
  background: rgba(255,255,255,.2);
  border: none;
  color: inherit;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
[data-cachou-toast] button.cachou-toast-dismiss {
  background: none;
  border: none;
  color: inherit;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  opacity: .7;
  margin-left: auto;
}
[data-cachou-toast] button.cachou-toast-dismiss:hover { opacity: 1; }
@keyframes cachou-toast-in { to { opacity: 1; transform: translateY(0); } }
@keyframes cachou-toast-out { to { opacity: 0; transform: translateY(-8px); } }
`;

let _toastStylesInjected = false;

function injectToastStyles() {
  if (_toastStylesInjected || typeof document === "undefined") return;
  _toastStylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", "toast");
  style.textContent = TOAST_STYLES;
  document.head.appendChild(style);
}

/**
 * Create a toast notification controller.
 *
 * @param {ToastOptions} [options]
 * @returns {ToastController}
 *
 * @example
 * ```js
 * const toast = createToast({ position: "bottom-right", max: 5 });
 * document.body.appendChild(toast.mount());
 * toast.show("Saved!", { type: "success", duration: 3000 });
 * toast.error("Failed to save");
 * ```
 */
export function createToast(options = {}) {
  const position = options.position || "top-right";
  const max = options.max || 5;

  /** @type {Array<{ id: string, message: string, type: string, duration: number, action: any, dismissible: boolean, el: HTMLElement|null, timer: any }>} */
  let toasts = [];
  let container = null;

  function ensureContainer() {
    if (container) return container;
    injectToastStyles();
    container = document.createElement("div");
    container.setAttribute("data-cachou-toast-container", "");
    container.setAttribute("data-position", position);
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "true");
    return container;
  }

  /**
   * Show a toast message.
   * @param {string} message
   * @param {ToastShowOptions} [opts]
   * @returns {string} The unique toast id.
   */
  function show(message, opts = {}) {
    const id = uid("toast");
    const type = opts.type || "info";
    const duration = opts.duration !== undefined ? opts.duration : 4000;
    const dismissible = opts.dismissible !== false;
    const action = opts.action || null;

    ensureContainer();

    const el = document.createElement("div");
    el.setAttribute("data-cachou-toast", id);
    el.setAttribute("data-type", type);

    // Message text
    const msgSpan = document.createElement("span");
    msgSpan.textContent = message;
    el.appendChild(msgSpan);

    // Action button
    if (action && action.label) {
      const btn = document.createElement("button");
      btn.className = "cachou-toast-action";
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        if (typeof action.onClick === "function") action.onClick();
        dismiss(id);
      });
      el.appendChild(btn);
    }

    // Dismiss button
    if (dismissible) {
      const btn = document.createElement("button");
      btn.className = "cachou-toast-dismiss";
      btn.setAttribute("aria-label", "Dismiss");
      btn.textContent = "\u00d7";
      btn.addEventListener("click", () => dismiss(id));
      el.appendChild(btn);
    }

    const entry = { id, message, type, duration, action, dismissible, el, timer: null };

    // Auto-dismiss
    if (duration > 0) {
      entry.timer = setTimeout(() => dismiss(id), duration);
    }

    toasts.push(entry);
    container.appendChild(el);

    // Enforce max
    while (toasts.length > max) {
      dismiss(toasts[0].id);
    }

    return id;
  }

  /**
   * Dismiss a toast by id with exit animation.
   * @param {string} id
   */
  function dismiss(id) {
    const idx = toasts.findIndex(t => t.id === id);
    if (idx === -1) return;
    const entry = toasts[idx];
    if (entry.timer) clearTimeout(entry.timer);
    toasts.splice(idx, 1);
    if (entry.el) {
      entry.el.classList.add("cachou-toast-exit");
      const onEnd = () => {
        entry.el.removeEventListener("animationend", onEnd);
        entry.el.remove();
      };
      entry.el.addEventListener("animationend", onEnd);
      // Fallback if animation doesn't fire
      setTimeout(() => entry.el.remove(), 300);
    }
  }

  /** Dismiss all active toasts. */
  function dismissAll() {
    const ids = toasts.map(t => t.id);
    for (const id of ids) dismiss(id);
  }

  /**
   * Create and return the toast container element.
   * Append this to document.body.
   * @returns {HTMLElement}
   */
  function mountContainer() {
    return ensureContainer();
  }

  return {
    show,
    /** Show a success toast. */
    success: (message, opts = {}) => show(message, { ...opts, type: "success" }),
    /** Show an error toast. */
    error: (message, opts = {}) => show(message, { ...opts, type: "error" }),
    /** Show an info toast. */
    info: (message, opts = {}) => show(message, { ...opts, type: "info" }),
    /** Show a warning toast. */
    warning: (message, opts = {}) => show(message, { ...opts, type: "warning" }),
    dismiss,
    dismissAll,
    mount: mountContainer
  };
}

// ---------------------------------------------------------------------------
// 2. Drawer Component
// ---------------------------------------------------------------------------

const DRAWER_STYLES = `
[data-cachou-drawer-backdrop] {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.4);
  z-index: 9998;
  opacity: 0;
  animation: cachou-drawer-backdrop-in .2s ease forwards;
}
[data-cachou-drawer-backdrop].cachou-drawer-closing {
  animation: cachou-drawer-backdrop-out .2s ease forwards;
}
[data-cachou-drawer] {
  position: fixed;
  z-index: 9999;
  background: #fff;
  color: #111;
  overflow: auto;
  outline: none;
  box-shadow: -4px 0 20px rgba(0,0,0,.15);
}
[data-cachou-drawer][data-side="right"] {
  top: 0; right: 0; bottom: 0;
  transform: translateX(100%);
  animation: cachou-drawer-slide-right .25s ease forwards;
}
[data-cachou-drawer][data-side="left"] {
  top: 0; left: 0; bottom: 0;
  transform: translateX(-100%);
  animation: cachou-drawer-slide-left .25s ease forwards;
}
[data-cachou-drawer][data-side="top"] {
  top: 0; left: 0; right: 0;
  transform: translateY(-100%);
  animation: cachou-drawer-slide-top .25s ease forwards;
}
[data-cachou-drawer][data-side="bottom"] {
  bottom: 0; left: 0; right: 0;
  transform: translateY(100%);
  animation: cachou-drawer-slide-bottom .25s ease forwards;
}
[data-cachou-drawer].cachou-drawer-closing[data-side="right"] { animation: cachou-drawer-slide-right-out .2s ease forwards; }
[data-cachou-drawer].cachou-drawer-closing[data-side="left"] { animation: cachou-drawer-slide-left-out .2s ease forwards; }
[data-cachou-drawer].cachou-drawer-closing[data-side="top"] { animation: cachou-drawer-slide-top-out .2s ease forwards; }
[data-cachou-drawer].cachou-drawer-closing[data-side="bottom"] { animation: cachou-drawer-slide-bottom-out .2s ease forwards; }
@keyframes cachou-drawer-backdrop-in { to { opacity: 1; } }
@keyframes cachou-drawer-backdrop-out { to { opacity: 0; } }
@keyframes cachou-drawer-slide-right { to { transform: translateX(0); } }
@keyframes cachou-drawer-slide-left { to { transform: translateX(0); } }
@keyframes cachou-drawer-slide-top { to { transform: translateY(0); } }
@keyframes cachou-drawer-slide-bottom { to { transform: translateY(0); } }
@keyframes cachou-drawer-slide-right-out { to { transform: translateX(100%); } }
@keyframes cachou-drawer-slide-left-out { to { transform: translateX(-100%); } }
@keyframes cachou-drawer-slide-top-out { to { transform: translateY(-100%); } }
@keyframes cachou-drawer-slide-bottom-out { to { transform: translateY(100%); } }
`;

let _drawerStylesInjected = false;

function injectDrawerStyles() {
  if (_drawerStylesInjected || typeof document === "undefined") return;
  _drawerStylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", "drawer");
  style.textContent = DRAWER_STYLES;
  document.head.appendChild(style);
}

/**
 * Accessible slide-in drawer (panel) component.
 *
 * @param {Object} props
 * @param {(() => boolean)|boolean} props.open - Whether the drawer is open.
 * @param {() => void} [props.onClose] - Called when the drawer should close.
 * @param {"left"|"right"|"top"|"bottom"} [props.side] - Slide direction (default "right").
 * @param {string} [props.size] - CSS width (for left/right) or height (for top/bottom).
 * @param {boolean} [props.backdrop] - Show backdrop overlay (default true).
 * @param {() => Node} props.children - Content render function.
 * @returns {() => Node|null}
 *
 * @example
 * ```js
 * Drawer({
 *   open: isOpen,
 *   onClose: () => setOpen(false),
 *   side: "right",
 *   children: () => html`<p>Drawer content</p>`
 * })
 * ```
 */
export function Drawer(props) {
  if (typeof document === "undefined") {
    return () => {
      const open = read(props.open);
      if (!open) return null;
      return typeof props.children === "function" ? props.children() : props.children;
    };
  }

  let disposeTrap = null;
  let previousFocus = null;
  let restoreScroll = null;

  return () => {
    const open = read(props.open);
    if (!open) {
      if (disposeTrap) { disposeTrap(); disposeTrap = null; }
      if (restoreScroll) { restoreScroll(); restoreScroll = null; }
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
        previousFocus = null;
      }
      return null;
    }

    injectDrawerStyles();
    previousFocus = document.activeElement;
    restoreScroll = lockBodyScroll();

    const side = props.side || "right";
    const size = props.size || (side === "left" || side === "right" ? "320px" : "280px");
    const showBackdrop = props.backdrop !== false;

    // Backdrop
    const wrapper = document.createElement("div");
    wrapper.style.display = "contents";

    let backdropEl = null;
    if (showBackdrop) {
      backdropEl = document.createElement("div");
      backdropEl.setAttribute("data-cachou-drawer-backdrop", "");
      backdropEl.addEventListener("click", () => {
        if (typeof props.onClose === "function") props.onClose();
      });
      wrapper.appendChild(backdropEl);
    }

    // Panel
    const panel = document.createElement("div");
    panel.setAttribute("data-cachou-drawer", "");
    panel.setAttribute("data-side", side);
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.tabIndex = -1;

    if (side === "left" || side === "right") {
      panel.style.width = size;
    } else {
      panel.style.height = size;
    }

    const children = typeof props.children === "function" ? props.children() : props.children;
    if (children instanceof Node) panel.appendChild(children);
    else if (children != null && children !== false) panel.appendChild(document.createTextNode(String(children)));

    wrapper.appendChild(panel);
    document.body.appendChild(wrapper);

    disposeTrap = trapFocus(panel);
    queueMicrotask(() => {
      focusFirst(panel) || panel.focus();
    });

    // Escape key
    const onKey = (e) => {
      if (e.key === "Escape" && typeof props.onClose === "function") {
        props.onClose();
      }
    };
    document.addEventListener("keydown", onKey);

    onCleanup(() => {
      document.removeEventListener("keydown", onKey);
      if (disposeTrap) disposeTrap();
      if (restoreScroll) { restoreScroll(); restoreScroll = null; }
      wrapper.remove();
    });

    return document.createComment("cachou-drawer");
  };
}

// ---------------------------------------------------------------------------
// 3. Popover Component
// ---------------------------------------------------------------------------

const POPOVER_STYLES = `
[data-cachou-popover] {
  position: fixed;
  z-index: 9997;
  background: #fff;
  color: #111;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12);
  padding: 8px;
  opacity: 0;
  animation: cachou-popover-in .15s ease forwards;
}
[data-cachou-popover].cachou-popover-exit {
  animation: cachou-popover-out .1s ease forwards;
}
@keyframes cachou-popover-in { to { opacity: 1; } }
@keyframes cachou-popover-out { to { opacity: 0; } }
`;

let _popoverStylesInjected = false;

function injectPopoverStyles() {
  if (_popoverStylesInjected || typeof document === "undefined") return;
  _popoverStylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", "popover");
  style.textContent = POPOVER_STYLES;
  document.head.appendChild(style);
}

/**
 * Calculate popover position relative to an anchor element.
 * Flips to the opposite side if not enough space.
 *
 * @param {HTMLElement} anchor
 * @param {HTMLElement} popover
 * @param {"top"|"bottom"|"left"|"right"} placement
 * @param {number} offset
 * @returns {{ top: number, left: number }}
 */
function computePosition(anchor, popover, placement, offset) {
  const ar = anchor.getBoundingClientRect();
  const pr = popover.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = 0;
  let left = 0;

  const positions = {
    bottom() {
      top = ar.bottom + offset;
      left = ar.left + (ar.width - pr.width) / 2;
    },
    top() {
      top = ar.top - pr.height - offset;
      left = ar.left + (ar.width - pr.width) / 2;
    },
    right() {
      top = ar.top + (ar.height - pr.height) / 2;
      left = ar.right + offset;
    },
    left() {
      top = ar.top + (ar.height - pr.height) / 2;
      left = ar.left - pr.width - offset;
    }
  };

  positions[placement]();

  // Flip if not enough space
  if (placement === "bottom" && top + pr.height > vh) { positions.top(); }
  else if (placement === "top" && top < 0) { positions.bottom(); }
  else if (placement === "right" && left + pr.width > vw) { positions.left(); }
  else if (placement === "left" && left < 0) { positions.right(); }

  // Clamp to viewport
  left = Math.max(4, Math.min(left, vw - pr.width - 4));
  top = Math.max(4, Math.min(top, vh - pr.height - 4));

  return { top, left };
}

/**
 * Popover component that positions itself relative to an anchor element.
 *
 * @param {Object} props
 * @param {HTMLElement|(() => HTMLElement)} props.anchor - The anchor element.
 * @param {(() => boolean)|boolean} props.open - Whether the popover is open.
 * @param {() => void} [props.onClose] - Called when the popover should close.
 * @param {"top"|"bottom"|"left"|"right"} [props.placement] - Preferred placement (default "bottom").
 * @param {number} [props.offset] - Pixel offset from anchor (default 8).
 * @param {() => Node} props.children - Content render function.
 * @returns {() => Node|null}
 *
 * @example
 * ```js
 * Popover({
 *   anchor: buttonEl,
 *   open: isOpen,
 *   placement: "bottom",
 *   children: () => html`<div>Popover content</div>`
 * })
 * ```
 */
export function Popover(props) {
  if (typeof document === "undefined") {
    return () => {
      const open = read(props.open);
      if (!open) return null;
      return typeof props.children === "function" ? props.children() : props.children;
    };
  }

  return () => {
    const open = read(props.open);
    if (!open) return null;

    injectPopoverStyles();

    const anchor = read(props.anchor);
    const placement = props.placement || "bottom";
    const offset = props.offset !== undefined ? props.offset : 8;

    const el = document.createElement("div");
    el.setAttribute("data-cachou-popover", "");
    el.setAttribute("role", "dialog");
    el.tabIndex = -1;

    const children = typeof props.children === "function" ? props.children() : props.children;
    if (children instanceof Node) el.appendChild(children);
    else if (children != null && children !== false) el.appendChild(document.createTextNode(String(children)));

    document.body.appendChild(el);

    // Position after appending so we can measure
    requestAnimationFrame(() => {
      if (!el.parentNode) return;
      const pos = computePosition(anchor, el, placement, offset);
      el.style.top = pos.top + "px";
      el.style.left = pos.left + "px";
    });

    // Close on click outside
    const onDocClick = (e) => {
      if (!el.contains(e.target) && anchor && !anchor.contains(e.target)) {
        if (typeof props.onClose === "function") props.onClose();
      }
    };
    // Delay listener to avoid immediate close from the triggering click
    setTimeout(() => document.addEventListener("click", onDocClick), 0);

    // Escape key
    const onKey = (e) => {
      if (e.key === "Escape" && typeof props.onClose === "function") {
        props.onClose();
      }
    };
    document.addEventListener("keydown", onKey);

    onCleanup(() => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
      el.remove();
    });

    return document.createComment("cachou-popover");
  };
}

// ---------------------------------------------------------------------------
// 4. Menu Component (Dropdown)
// ---------------------------------------------------------------------------

const MENU_STYLES = `
[data-cachou-menu-container] { position: relative; display: inline-block; }
[data-cachou-menu] {
  position: fixed;
  z-index: 9997;
  background: #fff;
  color: #111;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12);
  padding: 4px;
  min-width: 160px;
  opacity: 0;
  animation: cachou-menu-in .12s ease forwards;
}
@keyframes cachou-menu-in { to { opacity: 1; } }
[data-cachou-menu] [data-cachou-menuitem] {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  outline: none;
}
[data-cachou-menu] [data-cachou-menuitem]:hover,
[data-cachou-menu] [data-cachou-menuitem]:focus-visible {
  background: #f3f4f6;
}
[data-cachou-menu] [data-cachou-menuitem][data-danger] {
  color: #dc2626;
}
[data-cachou-menu] [data-cachou-menuitem][data-danger]:hover,
[data-cachou-menu] [data-cachou-menuitem][data-danger]:focus-visible {
  background: #fef2f2;
}
[data-cachou-menu] [data-cachou-menu-separator] {
  height: 1px;
  background: #e5e7eb;
  margin: 4px 0;
}
`;

let _menuStylesInjected = false;

function injectMenuStyles() {
  if (_menuStylesInjected || typeof document === "undefined") return;
  _menuStylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", "menu");
  style.textContent = MENU_STYLES;
  document.head.appendChild(style);
}

/**
 * @typedef {Object} MenuItem
 * @property {string} [label]
 * @property {() => void} [onClick]
 * @property {boolean} [danger]
 * @property {"separator"} [type]
 */

/**
 * Dropdown menu component with keyboard navigation.
 *
 * @param {Object} props
 * @param {() => Node} props.trigger - Render function for the trigger element.
 * @param {MenuItem[]} props.items - Menu items array.
 * @param {string} [props.class] - Additional CSS class for the container.
 * @returns {Node}
 *
 * @example
 * ```js
 * Menu({
 *   trigger: () => html`<button>Options</button>`,
 *   items: [
 *     { label: "Edit", onClick: handleEdit },
 *     { type: "separator" },
 *     { label: "Delete", onClick: handleDelete, danger: true }
 *   ]
 * })
 * ```
 */
export function Menu(props) {
  if (typeof document === "undefined") {
    return typeof props.trigger === "function" ? props.trigger() : props.trigger;
  }

  injectMenuStyles();

  const [isOpen, setOpen] = signal(false);
  const container = document.createElement("div");
  container.setAttribute("data-cachou-menu-container", "");
  if (props.class) container.className = props.class;

  // Trigger
  const triggerContent = typeof props.trigger === "function" ? props.trigger() : props.trigger;
  /** @type {HTMLElement} */
  const triggerEl = triggerContent instanceof Node ? triggerContent : document.createTextNode(String(triggerContent));
  if (triggerEl instanceof HTMLElement) {
    triggerEl.setAttribute("aria-haspopup", "menu");
  }
  container.appendChild(triggerEl);

  let menuEl = null;
  let focusedIndex = -1;

  function getMenuItems() {
    if (!menuEl) return [];
    return Array.from(menuEl.querySelectorAll("[data-cachou-menuitem]"));
  }

  function focusItem(index) {
    const items = getMenuItems();
    if (items.length === 0) return;
    focusedIndex = Math.max(0, Math.min(index, items.length - 1));
    items[focusedIndex].focus();
  }

  function openMenu() {
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    if (triggerEl instanceof HTMLElement) triggerEl.focus();
  }

  // Toggle on trigger click
  if (triggerEl instanceof HTMLElement) {
    triggerEl.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isOpen()) closeMenu();
      else openMenu();
    });
  }

  effect(() => {
    const open = isOpen();

    if (triggerEl instanceof HTMLElement) {
      triggerEl.setAttribute("aria-expanded", String(open));
    }

    // Remove existing menu
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }

    if (!open) return;

    menuEl = document.createElement("div");
    menuEl.setAttribute("data-cachou-menu", "");
    menuEl.setAttribute("role", "menu");

    const items = props.items || [];
    for (const item of items) {
      if (item.type === "separator") {
        const sep = document.createElement("div");
        sep.setAttribute("data-cachou-menu-separator", "");
        sep.setAttribute("role", "separator");
        menuEl.appendChild(sep);
        continue;
      }

      const btn = document.createElement("button");
      btn.setAttribute("data-cachou-menuitem", "");
      btn.setAttribute("role", "menuitem");
      btn.tabIndex = -1;
      if (item.danger) btn.setAttribute("data-danger", "");
      btn.textContent = item.label || "";

      btn.addEventListener("click", () => {
        if (typeof item.onClick === "function") item.onClick();
        closeMenu();
      });

      menuEl.appendChild(btn);
    }

    document.body.appendChild(menuEl);

    // Position below trigger
    requestAnimationFrame(() => {
      if (!menuEl || !menuEl.parentNode) return;
      const triggerRect = (triggerEl instanceof HTMLElement ? triggerEl : container).getBoundingClientRect();
      const menuRect = menuEl.getBoundingClientRect();
      let top = triggerRect.bottom + 4;
      let left = triggerRect.left;

      // Flip up if not enough space below
      if (top + menuRect.height > window.innerHeight) {
        top = triggerRect.top - menuRect.height - 4;
      }
      // Clamp horizontal
      left = Math.max(4, Math.min(left, window.innerWidth - menuRect.width - 4));

      menuEl.style.top = top + "px";
      menuEl.style.left = left + "px";
    });

    focusedIndex = -1;
    queueMicrotask(() => focusItem(0));

    // Keyboard navigation
    const onMenuKey = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        // Skip separators
        let next = focusedIndex + 1;
        const menuItems = getMenuItems();
        while (next < menuItems.length && !menuItems[next]) next++;
        focusItem(next);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        let prev = focusedIndex - 1;
        const menuItems = getMenuItems();
        while (prev >= 0 && !menuItems[prev]) prev--;
        focusItem(Math.max(0, prev));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const menuItems = getMenuItems();
        if (menuItems[focusedIndex]) menuItems[focusedIndex].click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    };

    // Close on outside click
    const onDocClick = (e) => {
      if (menuEl && !menuEl.contains(e.target) && !container.contains(e.target)) {
        closeMenu();
      }
    };
    setTimeout(() => document.addEventListener("click", onDocClick), 0);
    document.addEventListener("keydown", onMenuKey);

    onCleanup(() => {
      document.removeEventListener("keydown", onMenuKey);
      document.removeEventListener("click", onDocClick);
      if (menuEl) { menuEl.remove(); menuEl = null; }
    });
  });

  return container;
}

// ---------------------------------------------------------------------------
// 5. DataTable Component
// ---------------------------------------------------------------------------

const DATATABLE_STYLES = `
[data-cachou-datatable] {
  width: 100%;
  font-family: inherit;
  font-size: 14px;
}
[data-cachou-datatable] table {
  width: 100%;
  border-collapse: collapse;
}
[data-cachou-datatable] th,
[data-cachou-datatable] td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}
[data-cachou-datatable] th {
  font-weight: 600;
  background: #f9fafb;
  position: sticky;
  top: 0;
  user-select: none;
}
[data-cachou-datatable] th[data-sortable] {
  cursor: pointer;
}
[data-cachou-datatable] th[data-sortable]:hover {
  background: #f3f4f6;
}
[data-cachou-datatable] th .cachou-sort-icon {
  display: inline-block;
  margin-left: 4px;
  opacity: .4;
  font-size: 12px;
}
[data-cachou-datatable] th .cachou-sort-icon.active { opacity: 1; }
[data-cachou-datatable] tr:hover td { background: #f9fafb; }
[data-cachou-datatable] .cachou-dt-filter {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 4px 6px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
}
[data-cachou-datatable] .cachou-dt-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
[data-cachou-datatable] .cachou-dt-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  gap: 8px;
  font-size: 13px;
}
[data-cachou-datatable] .cachou-dt-pagination button {
  padding: 4px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
[data-cachou-datatable] .cachou-dt-pagination button:disabled {
  opacity: .5;
  cursor: default;
}
[data-cachou-datatable] .cachou-dt-pagination button:hover:not(:disabled) {
  background: #f3f4f6;
}
[data-cachou-datatable] .cachou-dt-empty {
  text-align: center;
  padding: 32px 12px;
  color: #6b7280;
}
`;

let _dataTableStylesInjected = false;

function injectDataTableStyles() {
  if (_dataTableStylesInjected || typeof document === "undefined") return;
  _dataTableStylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", "datatable");
  style.textContent = DATATABLE_STYLES;
  document.head.appendChild(style);
}

/**
 * @typedef {Object} DataTableColumn
 * @property {string} key - Property key on data objects.
 * @property {string} label - Display header label.
 * @property {boolean} [sortable] - Enable sorting for this column.
 * @property {boolean} [filterable] - Enable text filtering for this column.
 * @property {(value: any, row: Object) => Node} [render] - Custom cell render function.
 */

/**
 * Data table component with sorting, filtering, pagination, and selection.
 *
 * @param {Object} props
 * @param {(() => Array<Object>)|Array<Object>} props.data - Data rows.
 * @param {DataTableColumn[]} props.columns - Column definitions.
 * @param {boolean} [props.selectable] - Enable row selection with checkboxes.
 * @param {number} [props.pageSize] - Rows per page (default shows all).
 * @param {(key: string, dir: "asc"|"desc"|null) => void} [props.onSort] - External sort callback.
 * @param {(filters: Object) => void} [props.onFilter] - External filter callback.
 * @param {(selected: Array<Object>) => void} [props.onSelect] - Selection change callback.
 * @param {string} [props.emptyMessage] - Message when no data (default "No data").
 * @param {string} [props.class] - Additional CSS class.
 * @returns {Node}
 *
 * @example
 * ```js
 * DataTable({
 *   data: rows,
 *   columns: [
 *     { key: "name", label: "Name", sortable: true },
 *     { key: "email", label: "Email", sortable: true, filterable: true },
 *     { key: "role", label: "Role", render: (val) => html`<span class="badge">${val}</span>` }
 *   ],
 *   selectable: true,
 *   pageSize: 20,
 *   onSelect: (selected) => console.log(selected)
 * })
 * ```
 */
export function DataTable(props) {
  if (typeof document === "undefined") return null;

  injectDataTableStyles();

  const columns = props.columns || [];
  const pageSize = props.pageSize || 0;
  const selectable = props.selectable === true;
  const emptyMessage = props.emptyMessage || "No data";

  const [sortKey, setSortKey] = signal(null);
  const [sortDir, setSortDir] = signal(null);
  const [filters, setFilters] = signal({});
  const [currentPage, setCurrentPage] = signal(0);
  const [selectedSet, setSelectedSet] = signal(new Set());

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-cachou-datatable", "");
  if (props.class) wrapper.className = props.class;

  effect(() => {
    wrapper.textContent = "";

    const rawData = read(props.data) || [];
    const currentFilters = filters();
    const sk = sortKey();
    const sd = sortDir();

    // Filter
    let filtered = rawData;
    const filterKeys = Object.keys(currentFilters);
    if (filterKeys.length > 0) {
      filtered = rawData.filter(row => {
        for (const key of filterKeys) {
          const filterVal = currentFilters[key];
          if (!filterVal) continue;
          const cellVal = String(row[key] ?? "").toLowerCase();
          if (!cellVal.includes(filterVal.toLowerCase())) return false;
        }
        return true;
      });

      if (typeof props.onFilter === "function") {
        props.onFilter(currentFilters);
      }
    }

    // Sort
    let sorted = filtered;
    if (sk && sd) {
      sorted = [...filtered].sort((a, b) => {
        const aVal = a[sk];
        const bVal = b[sk];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sd === "asc" ? aVal - bVal : bVal - aVal;
        }
        const cmp = String(aVal).localeCompare(String(bVal));
        return sd === "asc" ? cmp : -cmp;
      });
    }

    // Pagination
    const totalRows = sorted.length;
    const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
    const page = Math.min(currentPage(), totalPages - 1);
    const pageData = pageSize > 0 ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted;

    // Build table
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    // Select-all checkbox
    if (selectable) {
      const th = document.createElement("th");
      th.setAttribute("scope", "col");
      th.style.width = "40px";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "cachou-dt-checkbox";
      checkbox.setAttribute("aria-label", "Select all");
      const sel = selectedSet();
      checkbox.checked = pageData.length > 0 && pageData.every(row => sel.has(row));
      checkbox.indeterminate = pageData.some(row => sel.has(row)) && !checkbox.checked;
      checkbox.addEventListener("change", () => {
        const next = new Set(selectedSet());
        if (checkbox.checked) {
          for (const row of pageData) next.add(row);
        } else {
          for (const row of pageData) next.delete(row);
        }
        setSelectedSet(next);
        if (typeof props.onSelect === "function") props.onSelect(Array.from(next));
      });
      th.appendChild(checkbox);
      headerRow.appendChild(th);
    }

    // Column headers
    for (const col of columns) {
      const th = document.createElement("th");
      th.setAttribute("scope", "col");
      if (col.sortable) th.setAttribute("data-sortable", "");

      const label = document.createElement("span");
      label.textContent = col.label || col.key;
      th.appendChild(label);

      if (col.sortable) {
        const icon = document.createElement("span");
        icon.className = cx("cachou-sort-icon", { active: sk === col.key });
        if (sk === col.key) {
          icon.textContent = sd === "asc" ? "\u25b2" : "\u25bc";
        } else {
          icon.textContent = "\u25b2";
        }
        th.appendChild(icon);

        th.addEventListener("click", () => {
          batch(() => {
            if (sk === col.key) {
              if (sd === "asc") { setSortDir("desc"); }
              else { setSortKey(null); setSortDir(null); }
            } else {
              setSortKey(col.key);
              setSortDir("asc");
            }
          });
          if (typeof props.onSort === "function") {
            props.onSort(sortKey(), sortDir());
          }
        });
      }

      // Filter input
      if (col.filterable) {
        const input = document.createElement("input");
        input.className = "cachou-dt-filter";
        input.type = "text";
        input.placeholder = `Filter ${col.label || col.key}...`;
        input.setAttribute("aria-label", `Filter by ${col.label || col.key}`);
        input.value = currentFilters[col.key] || "";
        input.addEventListener("input", () => {
          const next = { ...filters() };
          if (input.value) next[col.key] = input.value;
          else delete next[col.key];
          setFilters(next);
          setCurrentPage(0);
        });
        th.appendChild(input);
      }

      headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");

    if (pageData.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = columns.length + (selectable ? 1 : 0);
      td.className = "cachou-dt-empty";
      td.textContent = emptyMessage;
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      for (const row of pageData) {
        const tr = document.createElement("tr");

        if (selectable) {
          const td = document.createElement("td");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "cachou-dt-checkbox";
          checkbox.setAttribute("aria-label", "Select row");
          checkbox.checked = selectedSet().has(row);
          checkbox.addEventListener("change", () => {
            const next = new Set(selectedSet());
            if (checkbox.checked) next.add(row);
            else next.delete(row);
            setSelectedSet(next);
            if (typeof props.onSelect === "function") props.onSelect(Array.from(next));
          });
          td.appendChild(checkbox);
          tr.appendChild(td);
        }

        for (const col of columns) {
          const td = document.createElement("td");
          const cellVal = row[col.key];
          if (typeof col.render === "function") {
            const rendered = col.render(cellVal, row);
            if (rendered instanceof Node) td.appendChild(rendered);
            else if (rendered != null) td.textContent = String(rendered);
          } else {
            td.textContent = cellVal != null ? String(cellVal) : "";
          }
          tr.appendChild(td);
        }

        tbody.appendChild(tr);
      }
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);

    // Pagination controls
    if (pageSize > 0 && totalRows > 0) {
      const pagination = document.createElement("div");
      pagination.className = "cachou-dt-pagination";

      const info = document.createElement("span");
      const startRow = page * pageSize + 1;
      const endRow = Math.min((page + 1) * pageSize, totalRows);
      info.textContent = `${startRow}\u2013${endRow} of ${totalRows}`;
      pagination.appendChild(info);

      const controls = document.createElement("span");
      controls.style.display = "flex";
      controls.style.gap = "4px";

      const prevBtn = document.createElement("button");
      prevBtn.textContent = "Prev";
      prevBtn.disabled = page <= 0;
      prevBtn.addEventListener("click", () => setCurrentPage(p => Math.max(0, p - 1)));

      const pageLabel = document.createElement("span");
      pageLabel.style.padding = "4px 8px";
      pageLabel.textContent = `${page + 1} / ${totalPages}`;

      const nextBtn = document.createElement("button");
      nextBtn.textContent = "Next";
      nextBtn.disabled = page >= totalPages - 1;
      nextBtn.addEventListener("click", () => setCurrentPage(p => Math.min(totalPages - 1, p + 1)));

      controls.appendChild(prevBtn);
      controls.appendChild(pageLabel);
      controls.appendChild(nextBtn);
      pagination.appendChild(controls);

      wrapper.appendChild(pagination);
    }
  });

  return wrapper;
}

// ---------------------------------------------------------------------------
// 6. InfiniteScroll Component
// ---------------------------------------------------------------------------

const INFINITESCROLL_STYLES = `
[data-cachou-infinite-scroll] { position: relative; }
[data-cachou-infinite-sentinel] {
  height: 1px;
  width: 100%;
  pointer-events: none;
}
`;

let _infiniteScrollStylesInjected = false;

function injectInfiniteScrollStyles() {
  if (_infiniteScrollStylesInjected || typeof document === "undefined") return;
  _infiniteScrollStylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", "infinite-scroll");
  style.textContent = INFINITESCROLL_STYLES;
  document.head.appendChild(style);
}

/**
 * Infinite scroll component using IntersectionObserver.
 *
 * @param {Object} props
 * @param {(cursor: any) => Promise<{ items: Array, nextCursor: any }>} props.load - Async load function.
 * @param {(items: () => Array) => Node} props.children - Render function receiving an items accessor.
 * @param {number} [props.threshold] - Pixels from bottom to trigger load (default 200).
 * @param {() => Node} [props.loader] - Loading indicator render function.
 * @param {() => Node} [props.endMessage] - End-of-list message render function.
 * @returns {Node}
 *
 * @example
 * ```js
 * InfiniteScroll({
 *   load: async (cursor) => {
 *     const res = await fetch(`/api/items?cursor=${cursor || ""}`);
 *     const data = await res.json();
 *     return { items: data.items, nextCursor: data.nextCursor };
 *   },
 *   children: (items) => mapArray(items, item => html`<div>${item.name}</div>`, i => i.id),
 *   threshold: 200,
 *   loader: () => html`<div>Loading...</div>`
 * })
 * ```
 */
export function InfiniteScroll(props) {
  if (typeof document === "undefined") return null;

  injectInfiniteScrollStyles();

  const [items, setItems] = signal([]);
  const [loading, setLoading] = signal(false);
  const [hasMore, setHasMore] = signal(true);

  let cursor = undefined;
  let loadInProgress = false;

  const threshold = props.threshold || 200;

  async function loadMore() {
    if (loadInProgress || !hasMore()) return;
    loadInProgress = true;
    setLoading(true);

    try {
      const result = await props.load(cursor);
      const newItems = result.items || [];

      batch(() => {
        setItems(prev => [...prev, ...newItems]);
        cursor = result.nextCursor;
        if (!result.nextCursor || newItems.length === 0) {
          setHasMore(false);
        }
      });
    } catch (err) {
      if (typeof console !== "undefined") {
        console.error("InfiniteScroll load error:", err);
      }
    } finally {
      loadInProgress = false;
      setLoading(false);
    }
  }

  /** Reset scroll state and reload from the beginning. */
  function reset() {
    cursor = undefined;
    batch(() => {
      setItems([]);
      setHasMore(true);
      setLoading(false);
    });
    loadInProgress = false;
    loadMore();
  }

  const container = document.createElement("div");
  container.setAttribute("data-cachou-infinite-scroll", "");

  // Content area
  const contentArea = document.createElement("div");
  container.appendChild(contentArea);

  // Sentinel element for intersection observer
  const sentinel = document.createElement("div");
  sentinel.setAttribute("data-cachou-infinite-sentinel", "");
  container.appendChild(sentinel);

  // Loader / end message area
  const statusArea = document.createElement("div");
  container.appendChild(statusArea);

  // Render children reactively
  effect(() => {
    contentArea.textContent = "";
    if (typeof props.children === "function") {
      const rendered = props.children(items);
      if (rendered instanceof Node) contentArea.appendChild(rendered);
      else if (Array.isArray(rendered)) {
        for (const node of rendered) {
          if (node instanceof Node) contentArea.appendChild(node);
          else if (node != null) contentArea.appendChild(document.createTextNode(String(node)));
        }
      } else if (rendered != null && rendered !== false) {
        contentArea.appendChild(document.createTextNode(String(rendered)));
      }
    }
  });

  // Status indicator
  effect(() => {
    statusArea.textContent = "";
    if (loading()) {
      if (typeof props.loader === "function") {
        const loader = props.loader();
        if (loader instanceof Node) statusArea.appendChild(loader);
        else if (loader != null) statusArea.appendChild(document.createTextNode(String(loader)));
      }
    } else if (!hasMore() && typeof props.endMessage === "function") {
      const msg = props.endMessage();
      if (msg instanceof Node) statusArea.appendChild(msg);
      else if (msg != null) statusArea.appendChild(document.createTextNode(String(msg)));
    }
  });

  // Intersection observer on sentinel
  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && hasMore() && !loadInProgress) {
            loadMore();
          }
        }
      },
      { rootMargin: `0px 0px ${threshold}px 0px` }
    );
    observer.observe(sentinel);

    onCleanup(() => {
      observer.disconnect();
    });
  }

  // Trigger initial load
  loadMore();

  // Expose control signals on the container for external access
  container.__cachouInfiniteScroll = {
    loading,
    hasMore,
    items,
    reset
  };

  return container;
}

// ---------------------------------------------------------------------------
// 7. Tabs Component
// ---------------------------------------------------------------------------

const TABS_STYLES = `
[data-cachou-tabs] {
  font-family: inherit;
}
[data-cachou-tablist] {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--cachou-tabs-border, #e5e7eb);
  margin: 0;
  padding: 0;
  list-style: none;
}
[data-cachou-tab] {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  background: none;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  color: var(--cachou-tabs-color, #6b7280);
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  outline: none;
  white-space: nowrap;
  transition: color .15s, border-color .15s;
}
[data-cachou-tab]:hover {
  color: var(--cachou-tabs-hover, #111);
}
[data-cachou-tab]:focus-visible {
  outline: 2px solid var(--cachou-tabs-focus, #3b82f6);
  outline-offset: -2px;
  border-radius: 4px 4px 0 0;
}
[data-cachou-tab][aria-selected="true"] {
  color: var(--cachou-tabs-active-color, #111);
  border-bottom-color: var(--cachou-tabs-active-border, #3b82f6);
  font-weight: 600;
}
[data-cachou-tab] .cachou-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--cachou-tabs-badge-bg, #e5e7eb);
  color: var(--cachou-tabs-badge-color, #374151);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}
[data-cachou-tabpanel] {
  padding: 16px 0;
}
`;

let _tabsStylesInjected = false;

function injectTabsStyles() {
  if (_tabsStylesInjected || typeof document === "undefined") return;
  _tabsStylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", "tabs");
  style.textContent = TABS_STYLES;
  document.head.appendChild(style);
}

/**
 * Accessible tabbed interface component.
 *
 * @param {Object} props
 * @param {{ key: string, label: string, content: () => Node, badge?: number }[]} props.items - Tab items.
 * @param {(() => string)|string} [props.active] - Active tab key (signal getter for controlled mode).
 * @param {(key: string) => void} [props.onChange] - Called when the active tab changes.
 * @param {string} [props.class] - Additional CSS class.
 * @returns {Node}
 *
 * @example
 * ```js
 * Tabs({
 *   items: [
 *     { key: "general", label: "General", content: () => html`<p>General</p>` },
 *     { key: "billing", label: "Billing", badge: 3, content: () => html`<p>Billing</p>` }
 *   ],
 *   onChange: (key) => console.log(key)
 * })
 * ```
 */
export function Tabs(props) {
  if (typeof document === "undefined") return null;

  injectTabsStyles();

  const items = props.items || [];
  const idPrefix = uid("tabs");
  const isControlled = props.active != null;
  const [internalActive, setInternalActive] = isControlled ? [null, null] : signal(items.length > 0 ? items[0].key : "");

  function getActive() {
    if (isControlled) return read(props.active);
    return internalActive();
  }

  function activate(key) {
    if (!isControlled) setInternalActive(key);
    if (typeof props.onChange === "function") props.onChange(key);
  }

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-cachou-tabs", "");
  if (props.class) wrapper.className = props.class;

  const tablist = document.createElement("div");
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("data-cachou-tablist", "");

  const panelContainer = document.createElement("div");

  /** @type {HTMLElement[]} */
  const tabEls = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const tabId = `${idPrefix}-tab-${item.key}`;
    const panelId = `${idPrefix}-panel-${item.key}`;

    const btn = document.createElement("button");
    btn.setAttribute("data-cachou-tab", "");
    btn.setAttribute("role", "tab");
    btn.setAttribute("id", tabId);
    btn.setAttribute("aria-controls", panelId);
    btn.tabIndex = -1;
    btn.textContent = item.label;

    if (item.badge != null) {
      const badge = document.createElement("span");
      badge.className = "cachou-tab-badge";
      badge.textContent = String(item.badge);
      btn.appendChild(badge);
    }

    btn.addEventListener("click", () => activate(item.key));

    btn.addEventListener("keydown", (e) => {
      let targetIndex = -1;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        targetIndex = (i + 1) % items.length;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        targetIndex = (i - 1 + items.length) % items.length;
      } else if (e.key === "Home") {
        e.preventDefault();
        targetIndex = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        targetIndex = items.length - 1;
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate(item.key);
        return;
      }
      if (targetIndex >= 0) {
        tabEls[targetIndex].focus();
        activate(items[targetIndex].key);
      }
    });

    tabEls.push(btn);
    tablist.appendChild(btn);
  }

  wrapper.appendChild(tablist);
  wrapper.appendChild(panelContainer);

  effect(() => {
    const active = getActive();

    // Update tab states
    for (let i = 0; i < items.length; i++) {
      const selected = items[i].key === active;
      tabEls[i].setAttribute("aria-selected", String(selected));
      tabEls[i].tabIndex = selected ? 0 : -1;
    }

    // Render active panel
    panelContainer.textContent = "";
    const activeItem = items.find(it => it.key === active);
    if (activeItem && typeof activeItem.content === "function") {
      const panelId = `${idPrefix}-panel-${activeItem.key}`;
      const tabId = `${idPrefix}-tab-${activeItem.key}`;

      const panel = document.createElement("div");
      panel.setAttribute("data-cachou-tabpanel", "");
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("id", panelId);
      panel.setAttribute("aria-labelledby", tabId);
      panel.tabIndex = 0;

      const content = activeItem.content();
      if (content instanceof Node) panel.appendChild(content);
      else if (content != null && content !== false) panel.appendChild(document.createTextNode(String(content)));

      panelContainer.appendChild(panel);
    }
  });

  return wrapper;
}

// ---------------------------------------------------------------------------
// 8. Accordion Component
// ---------------------------------------------------------------------------

const ACCORDION_STYLES = `
[data-cachou-accordion] {
  font-family: inherit;
  border: 1px solid var(--cachou-accordion-border, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}
[data-cachou-accordion-item] {
  border-bottom: 1px solid var(--cachou-accordion-border, #e5e7eb);
}
[data-cachou-accordion-item]:last-child {
  border-bottom: none;
}
[data-cachou-accordion-header] {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: var(--cachou-accordion-header-bg, #fff);
  color: var(--cachou-accordion-header-color, #111);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  outline: none;
  gap: 8px;
}
[data-cachou-accordion-header]:hover {
  background: var(--cachou-accordion-header-hover, #f9fafb);
}
[data-cachou-accordion-header]:focus-visible {
  outline: 2px solid var(--cachou-accordion-focus, #3b82f6);
  outline-offset: -2px;
}
[data-cachou-accordion-header] .cachou-accordion-icon {
  margin-left: auto;
  transition: transform .2s ease;
  font-size: 12px;
}
[data-cachou-accordion-header][aria-expanded="true"] .cachou-accordion-icon {
  transform: rotate(180deg);
}
[data-cachou-accordion-content] {
  overflow: hidden;
  transition: height .25s ease;
}
[data-cachou-accordion-content-inner] {
  padding: 0 16px 12px;
  font-size: 14px;
  color: var(--cachou-accordion-content-color, #374151);
}
`;

let _accordionStylesInjected = false;

function injectAccordionStyles() {
  if (_accordionStylesInjected || typeof document === "undefined") return;
  _accordionStylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", "accordion");
  style.textContent = ACCORDION_STYLES;
  document.head.appendChild(style);
}

/**
 * Accessible accordion component with animated expand/collapse.
 *
 * @param {Object} props
 * @param {{ key: string, title: string, content: () => Node }[]} props.items - Accordion items.
 * @param {boolean} [props.multiple] - Allow multiple panels open at once (default false).
 * @param {string[]} [props.defaultOpen] - Keys of initially open panels.
 * @param {string} [props.class] - Additional CSS class.
 * @returns {Node}
 *
 * @example
 * ```js
 * Accordion({
 *   items: [
 *     { key: "faq1", title: "What is Cachou?", content: () => html`<p>A framework.</p>` }
 *   ],
 *   multiple: false,
 *   defaultOpen: ["faq1"]
 * })
 * ```
 */
export function Accordion(props) {
  if (typeof document === "undefined") return null;

  injectAccordionStyles();

  const items = props.items || [];
  const multiple = props.multiple === true;
  const idPrefix = uid("accordion");
  const initialOpen = new Set(props.defaultOpen || []);
  const [openKeys, setOpenKeys] = signal(initialOpen);

  function toggle(key) {
    setOpenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (!multiple) next.clear();
        next.add(key);
      }
      return next;
    });
  }

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-cachou-accordion", "");
  if (props.class) wrapper.className = props.class;

  /** @type {HTMLElement[]} */
  const headerEls = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const headerId = `${idPrefix}-header-${item.key}`;
    const contentId = `${idPrefix}-content-${item.key}`;

    const section = document.createElement("div");
    section.setAttribute("data-cachou-accordion-item", "");

    // Header button
    const header = document.createElement("button");
    header.setAttribute("data-cachou-accordion-header", "");
    header.setAttribute("id", headerId);
    header.setAttribute("aria-controls", contentId);
    header.textContent = item.title;

    const icon = document.createElement("span");
    icon.className = "cachou-accordion-icon";
    icon.textContent = "\u25BC";
    header.appendChild(icon);

    header.addEventListener("click", () => toggle(item.key));

    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(item.key);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = (i + 1) % items.length;
        headerEls[next].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = (i - 1 + items.length) % items.length;
        headerEls[prev].focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        headerEls[0].focus();
      } else if (e.key === "End") {
        e.preventDefault();
        headerEls[items.length - 1].focus();
      }
    });

    headerEls.push(header);

    // Content container
    const contentWrapper = document.createElement("div");
    contentWrapper.setAttribute("data-cachou-accordion-content", "");
    contentWrapper.setAttribute("id", contentId);
    contentWrapper.setAttribute("role", "region");
    contentWrapper.setAttribute("aria-labelledby", headerId);
    contentWrapper.style.height = "0px";

    const contentInner = document.createElement("div");
    contentInner.setAttribute("data-cachou-accordion-content-inner", "");
    contentWrapper.appendChild(contentInner);

    section.appendChild(header);
    section.appendChild(contentWrapper);
    wrapper.appendChild(section);

    // Reactively update open/close state with slide animation
    effect(() => {
      const isOpen = openKeys().has(item.key);
      header.setAttribute("aria-expanded", String(isOpen));

      if (isOpen) {
        // Render content
        contentInner.textContent = "";
        if (typeof item.content === "function") {
          const rendered = item.content();
          if (rendered instanceof Node) contentInner.appendChild(rendered);
          else if (rendered != null && rendered !== false) contentInner.appendChild(document.createTextNode(String(rendered)));
        }

        // Animate open
        contentWrapper.style.height = "0px";
        requestAnimationFrame(() => {
          contentWrapper.style.height = contentWrapper.scrollHeight + "px";
          const onEnd = () => {
            contentWrapper.removeEventListener("transitionend", onEnd);
            if (openKeys().has(item.key)) {
              contentWrapper.style.height = "auto";
            }
          };
          contentWrapper.addEventListener("transitionend", onEnd);
        });
      } else {
        // Animate close
        if (contentWrapper.style.height === "auto") {
          contentWrapper.style.height = contentWrapper.scrollHeight + "px";
        }
        requestAnimationFrame(() => {
          contentWrapper.style.height = "0px";
        });
      }
    });
  }

  return wrapper;
}

// ---------------------------------------------------------------------------
// 9. Breadcrumbs Component
// ---------------------------------------------------------------------------

const BREADCRUMBS_STYLES = `
[data-cachou-breadcrumbs] ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 14px;
}
[data-cachou-breadcrumbs] li {
  display: inline-flex;
  align-items: center;
}
[data-cachou-breadcrumbs] .cachou-breadcrumb-sep {
  margin: 0 8px;
  color: var(--cachou-breadcrumb-sep-color, #9ca3af);
  user-select: none;
}
[data-cachou-breadcrumbs] a {
  color: var(--cachou-breadcrumb-link, #3b82f6);
  text-decoration: none;
}
[data-cachou-breadcrumbs] a:hover {
  text-decoration: underline;
}
[data-cachou-breadcrumbs] [aria-current="page"] {
  color: var(--cachou-breadcrumb-current, #374151);
  font-weight: 500;
}
`;

let _breadcrumbsStylesInjected = false;

function injectBreadcrumbsStyles() {
  if (_breadcrumbsStylesInjected || typeof document === "undefined") return;
  _breadcrumbsStylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", "breadcrumbs");
  style.textContent = BREADCRUMBS_STYLES;
  document.head.appendChild(style);
}

/**
 * Accessible breadcrumb navigation component.
 *
 * @param {Object} props
 * @param {{ label: string, href?: string }[]} props.items - Breadcrumb items.
 * @param {string} [props.separator] - Separator character (default "\u203A").
 * @param {string} [props.class] - Additional CSS class.
 * @returns {Node}
 *
 * @example
 * ```js
 * Breadcrumbs({
 *   items: [
 *     { label: "Home", href: "/" },
 *     { label: "Products", href: "/products" },
 *     { label: "Widget" }
 *   ]
 * })
 * ```
 */
export function Breadcrumbs(props) {
  if (typeof document === "undefined") return null;

  injectBreadcrumbsStyles();

  const items = props.items || [];
  const separator = props.separator !== undefined ? props.separator : "\u203A";

  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "Breadcrumb");
  nav.setAttribute("data-cachou-breadcrumbs", "");
  if (props.class) nav.className = props.class;

  const ol = document.createElement("ol");

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isLast = i === items.length - 1;
    const li = document.createElement("li");

    if (isLast) {
      // Current page -- no link
      const span = document.createElement("span");
      span.setAttribute("aria-current", "page");
      span.textContent = item.label;
      li.appendChild(span);
    } else if (item.href) {
      const a = document.createElement("a");
      a.href = item.href;
      a.textContent = item.label;
      li.appendChild(a);
    } else {
      const span = document.createElement("span");
      span.textContent = item.label;
      li.appendChild(span);
    }

    ol.appendChild(li);

    // Add separator between items
    if (!isLast) {
      const sepLi = document.createElement("li");
      sepLi.setAttribute("aria-hidden", "true");
      const sepSpan = document.createElement("span");
      sepSpan.className = "cachou-breadcrumb-sep";
      if (separator instanceof Node) {
        sepSpan.appendChild(separator.cloneNode(true));
      } else {
        sepSpan.textContent = String(separator);
      }
      sepLi.appendChild(sepSpan);
      ol.appendChild(sepLi);
    }
  }

  nav.appendChild(ol);
  return nav;
}

// ---------------------------------------------------------------------------
// 10. Tooltip Component
// ---------------------------------------------------------------------------

const TOOLTIP_STYLES = `
[data-cachou-tooltip] {
  position: fixed;
  z-index: 10001;
  padding: 6px 10px;
  border-radius: 4px;
  background: var(--cachou-tooltip-bg, #1f2937);
  color: var(--cachou-tooltip-color, #fff);
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
  white-space: nowrap;
  opacity: 0;
  animation: cachou-tooltip-in .15s ease forwards;
}
[data-cachou-tooltip].cachou-tooltip-exit {
  animation: cachou-tooltip-out .1s ease forwards;
}
@keyframes cachou-tooltip-in { to { opacity: 1; } }
@keyframes cachou-tooltip-out { to { opacity: 0; } }
`;

let _tooltipStylesInjected = false;

function injectTooltipStyles() {
  if (_tooltipStylesInjected || typeof document === "undefined") return;
  _tooltipStylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", "tooltip");
  style.textContent = TOOLTIP_STYLES;
  document.head.appendChild(style);
}

/**
 * Accessible tooltip component that shows on hover/focus.
 *
 * @param {Object} props
 * @param {string} props.content - Tooltip text content.
 * @param {() => Node} props.children - Render function for the trigger element.
 * @param {"top"|"bottom"|"left"|"right"} [props.placement] - Preferred placement (default "top").
 * @param {number} [props.delay] - Show delay in ms (default 300).
 * @param {string} [props.class] - Additional CSS class for the tooltip element.
 * @returns {Node}
 *
 * @example
 * ```js
 * Tooltip({
 *   content: "Copy to clipboard",
 *   children: () => html`<button>Copy</button>`,
 *   placement: "top",
 *   delay: 300
 * })
 * ```
 */
export function Tooltip(props) {
  if (typeof document === "undefined") {
    return typeof props.children === "function" ? props.children() : props.children;
  }

  injectTooltipStyles();

  const tooltipId = uid("tooltip");
  const placement = props.placement || "top";
  const delay = props.delay !== undefined ? props.delay : 300;

  const childContent = typeof props.children === "function" ? props.children() : props.children;

  /** @type {HTMLElement} */
  const triggerEl = childContent instanceof HTMLElement ? childContent : (() => {
    const span = document.createElement("span");
    span.style.display = "inline-block";
    if (childContent instanceof Node) span.appendChild(childContent);
    else if (childContent != null) span.appendChild(document.createTextNode(String(childContent)));
    return span;
  })();

  triggerEl.setAttribute("aria-describedby", tooltipId);

  let tooltipEl = null;
  let showTimer = null;

  function positionTooltip() {
    if (!tooltipEl || !triggerEl) return;
    const ar = triggerEl.getBoundingClientRect();
    const tr = tooltipEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const offset = 8;

    let top = 0;
    let left = 0;

    const positions = {
      top() { top = ar.top - tr.height - offset; left = ar.left + (ar.width - tr.width) / 2; },
      bottom() { top = ar.bottom + offset; left = ar.left + (ar.width - tr.width) / 2; },
      left() { top = ar.top + (ar.height - tr.height) / 2; left = ar.left - tr.width - offset; },
      right() { top = ar.top + (ar.height - tr.height) / 2; left = ar.right + offset; }
    };

    positions[placement]();

    // Auto-flip if not enough space
    if (placement === "top" && top < 0) positions.bottom();
    else if (placement === "bottom" && top + tr.height > vh) positions.top();
    else if (placement === "left" && left < 0) positions.right();
    else if (placement === "right" && left + tr.width > vw) positions.left();

    // Clamp to viewport
    left = Math.max(4, Math.min(left, vw - tr.width - 4));
    top = Math.max(4, Math.min(top, vh - tr.height - 4));

    tooltipEl.style.top = top + "px";
    tooltipEl.style.left = left + "px";
  }

  function show() {
    if (tooltipEl) return;
    showTimer = setTimeout(() => {
      tooltipEl = document.createElement("div");
      tooltipEl.setAttribute("data-cachou-tooltip", "");
      tooltipEl.setAttribute("id", tooltipId);
      tooltipEl.setAttribute("role", "tooltip");
      if (props.class) tooltipEl.className = props.class;
      tooltipEl.textContent = props.content;

      document.body.appendChild(tooltipEl);
      requestAnimationFrame(positionTooltip);
    }, delay);
  }

  function hide() {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
  }

  triggerEl.addEventListener("mouseenter", show);
  triggerEl.addEventListener("focusin", show);
  triggerEl.addEventListener("mouseleave", hide);
  triggerEl.addEventListener("focusout", hide);

  const onKey = (e) => {
    if (e.key === "Escape") hide();
  };
  triggerEl.addEventListener("keydown", onKey);

  onCleanup(() => {
    hide();
    triggerEl.removeEventListener("mouseenter", show);
    triggerEl.removeEventListener("focusin", show);
    triggerEl.removeEventListener("mouseleave", hide);
    triggerEl.removeEventListener("focusout", hide);
    triggerEl.removeEventListener("keydown", onKey);
  });

  return triggerEl;
}

// ---------------------------------------------------------------------------
// 11. Avatar Component
// ---------------------------------------------------------------------------

const AVATAR_STYLES = `
[data-cachou-avatar] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  vertical-align: middle;
  font-weight: 600;
  line-height: 1;
  user-select: none;
  flex-shrink: 0;
}
[data-cachou-avatar] img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
`;

let _avatarStylesInjected = false;

function injectAvatarStyles() {
  if (_avatarStylesInjected || typeof document === "undefined") return;
  _avatarStylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", "avatar");
  style.textContent = AVATAR_STYLES;
  document.head.appendChild(style);
}

/**
 * Derive a deterministic background color from a string.
 * @param {string} str
 * @returns {string} A hex color string.
 */
function colorFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

/**
 * Avatar component that displays an image or fallback initials.
 *
 * @param {Object} props
 * @param {string} [props.src] - Image source URL.
 * @param {string} [props.alt] - Alt text for the image.
 * @param {number} [props.size] - Size in pixels (default 40).
 * @param {string} [props.fallback] - Initials text when no image or image fails.
 * @param {string} [props.color] - Background color for initials (auto-derived from fallback if omitted).
 * @param {string} [props.class] - Additional CSS class.
 * @returns {Node}
 *
 * @example
 * ```js
 * Avatar({ src: "/photo.jpg", alt: "Ada", size: 40, fallback: "AL" })
 * Avatar({ fallback: "JD", size: 32, color: "#3b82f6" })
 * ```
 */
export function Avatar(props) {
  if (typeof document === "undefined") return null;

  injectAvatarStyles();

  const size = props.size || 40;
  const fallbackText = props.fallback || "";
  const bgColor = props.color || colorFromString(fallbackText);

  const el = document.createElement("span");
  el.setAttribute("data-cachou-avatar", "");
  if (props.class) el.className = props.class;
  el.style.width = size + "px";
  el.style.height = size + "px";
  el.style.fontSize = Math.round(size * 0.4) + "px";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", props.alt || fallbackText || "Avatar");

  if (props.src) {
    const img = document.createElement("img");
    img.src = props.src;
    img.alt = props.alt || "";
    img.addEventListener("error", () => {
      // On load error, show fallback initials
      img.remove();
      el.style.background = bgColor;
      el.style.color = "#fff";
      el.textContent = fallbackText;
    });
    el.appendChild(img);
  } else {
    el.style.background = bgColor;
    el.style.color = "#fff";
    el.textContent = fallbackText;
  }

  return el;
}

// ---------------------------------------------------------------------------
// 12. Badge Component
// ---------------------------------------------------------------------------

const BADGE_STYLES = `
[data-cachou-badge] {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  font-family: inherit;
}
[data-cachou-badge][data-pill="true"] {
  border-radius: 9999px;
}
[data-cachou-badge][data-variant="neutral"] {
  background: var(--cachou-badge-neutral-bg, #f3f4f6);
  color: var(--cachou-badge-neutral-color, #374151);
}
[data-cachou-badge][data-variant="success"] {
  background: var(--cachou-badge-success-bg, #dcfce7);
  color: var(--cachou-badge-success-color, #166534);
}
[data-cachou-badge][data-variant="warning"] {
  background: var(--cachou-badge-warning-bg, #fef3c7);
  color: var(--cachou-badge-warning-color, #92400e);
}
[data-cachou-badge][data-variant="danger"] {
  background: var(--cachou-badge-danger-bg, #fee2e2);
  color: var(--cachou-badge-danger-color, #991b1b);
}
[data-cachou-badge][data-variant="info"] {
  background: var(--cachou-badge-info-bg, #dbeafe);
  color: var(--cachou-badge-info-color, #1e40af);
}
`;

let _badgeStylesInjected = false;

function injectBadgeStyles() {
  if (_badgeStylesInjected || typeof document === "undefined") return;
  _badgeStylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", "badge");
  style.textContent = BADGE_STYLES;
  document.head.appendChild(style);
}

/**
 * Inline badge/label component with variant styling.
 *
 * @param {Object} props
 * @param {string} props.text - Badge text content.
 * @param {"neutral"|"success"|"warning"|"danger"|"info"} [props.variant] - Visual variant (default "neutral").
 * @param {boolean} [props.pill] - Use fully rounded (pill) shape (default false).
 * @param {string} [props.class] - Additional CSS class.
 * @returns {Node}
 *
 * @example
 * ```js
 * Badge({ text: "New", variant: "success" })
 * Badge({ text: "3", variant: "danger", pill: true })
 * ```
 */
export function Badge(props) {
  if (typeof document === "undefined") return null;

  injectBadgeStyles();

  const variant = props.variant || "neutral";

  const el = document.createElement("span");
  el.setAttribute("data-cachou-badge", "");
  el.setAttribute("data-variant", variant);
  if (props.pill) el.setAttribute("data-pill", "true");
  if (props.class) el.className = props.class;
  el.textContent = props.text || "";

  return el;
}
