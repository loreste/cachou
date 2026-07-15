import { onCleanup } from "./reactivity.js";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function focusFirst(root) {
  if (!root || typeof root.querySelector !== "function") return false;
  const target = root.querySelector(focusableSelector);
  if (!target || typeof target.focus !== "function") return false;
  target.focus();
  return true;
}

export function restoreFocusAfter(fn) {
  const previous = typeof document !== "undefined" ? document.activeElement : null;
  const result = fn();
  if (previous && typeof previous.focus === "function") {
    queueMicrotask(() => previous.focus());
  }
  return result;
}

export function trapFocus(root) {
  if (!root || typeof root.addEventListener !== "function") {
    return () => {};
  }

  const onKeyDown = (event) => {
    if (event.key !== "Tab") return;
    const focusables = Array.from(root.querySelectorAll(focusableSelector))
      .filter(item => item.offsetParent !== null || item === document.activeElement);
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  root.addEventListener("keydown", onKeyDown);
  const dispose = () => root.removeEventListener("keydown", onKeyDown);
  onCleanup(dispose);
  return dispose;
}

export function createLiveRegion(options = {}) {
  if (typeof document === "undefined") {
    return [() => {}, null];
  }
  const node = document.createElement("div");
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", options.assertive ? "assertive" : "polite");
  node.setAttribute("aria-atomic", "true");
  node.style.position = "absolute";
  node.style.width = "1px";
  node.style.height = "1px";
  node.style.overflow = "hidden";
  node.style.clip = "rect(0 0 0 0)";

  const announce = (message) => {
    node.textContent = "";
    queueMicrotask(() => {
      node.textContent = String(message);
    });
  };

  return [announce, node];
}
