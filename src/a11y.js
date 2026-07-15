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

/**
 * Accessible dialog/drawer primitive.
 * @param {{ open: () => boolean | boolean, onClose?: () => void, title?: string, children?: any, modal?: boolean }} props
 */
export function Dialog(props) {
  if (typeof document === "undefined") {
    return () => {
      const open = typeof props.open === "function" ? props.open() : props.open;
      if (!open) return null;
      return typeof props.children === "function" ? props.children() : props.children;
    };
  }

  let disposeTrap = null;
  let previousFocus = null;

  return () => {
    const open = typeof props.open === "function" ? props.open() : props.open;
    if (!open) {
      if (disposeTrap) {
        disposeTrap();
        disposeTrap = null;
      }
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
        previousFocus = null;
      }
      return null;
    }

    previousFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.setAttribute("data-cachou-dialog-backdrop", "true");
    backdrop.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:9999";

    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", props.modal === false ? "false" : "true");
    if (props.title) panel.setAttribute("aria-label", props.title);
    panel.tabIndex = -1;
    panel.style.cssText =
      "background:#fff;color:#111;border-radius:8px;padding:16px;max-width:min(96vw,480px);max-height:90vh;overflow:auto;outline:none";

    const children = typeof props.children === "function" ? props.children() : props.children;
    if (children instanceof Node) panel.appendChild(children);
    else if (Array.isArray(children)) {
      for (const c of children) {
        if (c instanceof Node) panel.appendChild(c);
        else if (c != null && c !== false) panel.appendChild(document.createTextNode(String(c)));
      }
    } else if (children != null && children !== false) {
      panel.appendChild(document.createTextNode(String(children)));
    }

    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    disposeTrap = trapFocus(panel);
    queueMicrotask(() => {
      focusFirst(panel) || panel.focus();
    });

    const onKey = e => {
      if (e.key === "Escape" && typeof props.onClose === "function") {
        props.onClose();
      }
    };
    const onBackdrop = e => {
      if (e.target === backdrop && typeof props.onClose === "function") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    backdrop.addEventListener("click", onBackdrop);

    onCleanup(() => {
      document.removeEventListener("keydown", onKey);
      backdrop.removeEventListener("click", onBackdrop);
      if (disposeTrap) disposeTrap();
      backdrop.remove();
    });

    // Return a marker comment so template systems have a node; real UI is portaled
    return document.createComment("cachou-dialog");
  };
}
