/**
 * CachouJS Drag and Drop
 *
 * A reactive drag-and-drop system built on the HTML5 Drag and Drop API.
 * Provides draggable, dropzone, and sortable directive factories.
 *
 * @module cachoujs/dnd
 */

import { directive } from "./directives.js";
import { batch } from "./reactivity.js";

/* ------------------------------------------------------------------ */
/*  SSR guard                                                         */
/* ------------------------------------------------------------------ */

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

/* ------------------------------------------------------------------ */
/*  Shared drag session state                                         */
/* ------------------------------------------------------------------ */

/** @type {{ type: string|null, data: any, sourceEl: Element|null }} */
let activeDrag = { type: null, data: null, sourceEl: null };

/** Set of active dropzone elements listening for compatible drags. */
const activeDropzones = new Set();

/* ------------------------------------------------------------------ */
/*  createDragDrop                                                    */
/* ------------------------------------------------------------------ */

/**
 * Create drag-and-drop directive factories.
 *
 * @returns {{ draggable: Function, dropzone: Function, sortable: Function }}
 */
export function createDragDrop() {
  /**
   * Make an element draggable.
   *
   * @param {Element} el - Target element.
   * @param {Object|Function} optsOrAccessor - Options or accessor returning options.
   * @param {*} [optsOrAccessor.data] - Data payload.
   * @param {string} [optsOrAccessor.type] - Drag type identifier.
   * @param {string} [optsOrAccessor.handle] - CSS selector for drag handle.
   * @param {string} [optsOrAccessor.dragClass="cachou-dragging"] - Class applied during drag.
   * @param {Function} [optsOrAccessor.onDragStart] - Callback on drag start.
   * @param {Function} [optsOrAccessor.onDragEnd] - Callback on drag end.
   * @returns {Function} Cleanup function.
   */
  function draggable(el, optsOrAccessor) {
    if (!isBrowser) return () => {};

    const getOpts = typeof optsOrAccessor === "function" ? optsOrAccessor : () => optsOrAccessor;

    el.setAttribute("draggable", "true");

    function onMouseDown(e) {
      const opts = getOpts();
      if (opts.handle) {
        const handle = el.querySelector(opts.handle);
        if (!handle || !handle.contains(e.target)) {
          // Temporarily disable drag when clicking outside handle
          el.setAttribute("draggable", "false");
          const restore = () => {
            el.setAttribute("draggable", "true");
            el.removeEventListener("mouseup", restore);
            document.removeEventListener("mouseup", restore);
          };
          el.addEventListener("mouseup", restore, { once: true });
          document.addEventListener("mouseup", restore, { once: true });
        }
      }
    }

    function onDragStart(e) {
      const opts = getOpts();
      const dragClass = opts.dragClass || "cachou-dragging";

      activeDrag = {
        type: opts.type || null,
        data: opts.data,
        sourceEl: el,
      };

      // Set dataTransfer for cross-window / native interop
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", JSON.stringify(opts.data));
          if (opts.type) {
            e.dataTransfer.setData(`application/x-cachou-${opts.type}`, "");
          }
        } catch (_) {
          // Some browsers restrict setData in certain contexts
        }
      }

      el.classList.add(dragClass);

      // Notify dropzones about active drag
      for (const dz of activeDropzones) {
        if (dz._cachouDropzone) {
          dz._cachouDropzone.onDragActive();
        }
      }

      if (typeof opts.onDragStart === "function") {
        opts.onDragStart({ data: opts.data, el, event: e });
      }
    }

    function onDragEnd(e) {
      const opts = getOpts();
      const dragClass = opts.dragClass || "cachou-dragging";
      el.classList.remove(dragClass);

      // Notify dropzones drag ended
      for (const dz of activeDropzones) {
        if (dz._cachouDropzone) {
          dz._cachouDropzone.onDragInactive();
        }
      }

      if (typeof opts.onDragEnd === "function") {
        opts.onDragEnd({ data: opts.data, el, event: e });
      }

      activeDrag = { type: null, data: null, sourceEl: null };
    }

    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("dragend", onDragEnd);

    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("dragstart", onDragStart);
      el.removeEventListener("dragend", onDragEnd);
      el.removeAttribute("draggable");
    };
  }

  /**
   * Make an element a drop target.
   *
   * @param {Element} el - Target element.
   * @param {Object|Function} optsOrAccessor - Options or accessor returning options.
   * @param {string} [optsOrAccessor.accept] - Only accept drags with matching type.
   * @param {Function} [optsOrAccessor.onDrop] - Callback with dropped data.
   * @param {Function} [optsOrAccessor.onDragOver] - Callback while dragging over.
   * @param {Function} [optsOrAccessor.onDragLeave] - Callback when drag leaves.
   * @param {string} [optsOrAccessor.activeClass="cachou-drop-active"] - Class when compatible drag active.
   * @param {string} [optsOrAccessor.hoverClass="cachou-drop-hover"] - Class when dragging directly over.
   * @returns {Function} Cleanup function.
   */
  function dropzone(el, optsOrAccessor) {
    if (!isBrowser) return () => {};

    const getOpts = typeof optsOrAccessor === "function" ? optsOrAccessor : () => optsOrAccessor;

    function isAccepted() {
      const opts = getOpts();
      if (!opts.accept) return true;
      return activeDrag.type === opts.accept;
    }

    el._cachouDropzone = {
      onDragActive() {
        if (!isAccepted()) return;
        const opts = getOpts();
        el.classList.add(opts.activeClass || "cachou-drop-active");
      },
      onDragInactive() {
        const opts = getOpts();
        el.classList.remove(opts.activeClass || "cachou-drop-active");
        el.classList.remove(opts.hoverClass || "cachou-drop-hover");
      },
    };

    activeDropzones.add(el);

    function onDragOver(e) {
      if (!isAccepted()) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
      const opts = getOpts();
      el.classList.add(opts.hoverClass || "cachou-drop-hover");
      if (typeof opts.onDragOver === "function") {
        opts.onDragOver({ data: activeDrag.data, el, event: e });
      }
    }

    function onDragLeave(e) {
      const opts = getOpts();
      el.classList.remove(opts.hoverClass || "cachou-drop-hover");
      if (typeof opts.onDragLeave === "function") {
        opts.onDragLeave({ data: activeDrag.data, el, event: e });
      }
    }

    function onDrop(e) {
      e.preventDefault();
      const opts = getOpts();
      el.classList.remove(opts.hoverClass || "cachou-drop-hover");
      el.classList.remove(opts.activeClass || "cachou-drop-active");

      if (!isAccepted()) return;

      let data = activeDrag.data;

      // Fallback: try parsing from dataTransfer if no in-memory data
      if (data === undefined || data === null) {
        try {
          const raw = e.dataTransfer && e.dataTransfer.getData("text/plain");
          if (raw) data = JSON.parse(raw);
        } catch (_) {}
      }

      if (typeof opts.onDrop === "function") {
        opts.onDrop(data, { sourceEl: activeDrag.sourceEl, event: e });
      }
    }

    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);

    return () => {
      activeDropzones.delete(el);
      delete el._cachouDropzone;
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }

  /**
   * Make a list sortable via drag and drop.
   *
   * @param {Element} el - List container element.
   * @param {Object|Function} optsOrAccessor - Options or accessor returning options.
   * @param {Function} optsOrAccessor.items - Signal getter for the item array.
   * @param {Function} optsOrAccessor.setItems - Signal setter for the item array.
   * @param {string} [optsOrAccessor.handle] - CSS selector for drag handle.
   * @param {number} [optsOrAccessor.animation=150] - Move animation duration in ms.
   * @param {string} [optsOrAccessor.group] - Group name for cross-list sorting.
   * @returns {Function} Cleanup function.
   */
  function sortable(el, optsOrAccessor) {
    if (!isBrowser) return () => {};

    const getOpts = typeof optsOrAccessor === "function" ? optsOrAccessor : () => optsOrAccessor;
    const cleanups = [];

    /** Sortable group registry for cross-list dragging. */
    if (!sortable._groups) sortable._groups = new Map();

    const opts = getOpts();
    if (opts.group) {
      if (!sortable._groups.has(opts.group)) {
        sortable._groups.set(opts.group, new Set());
      }
      sortable._groups.get(opts.group).add(el);
      cleanups.push(() => {
        const group = sortable._groups.get(opts.group);
        if (group) {
          group.delete(el);
          if (group.size === 0) sortable._groups.delete(opts.group);
        }
      });
    }

    let dragIndex = -1;
    let draggedChild = null;

    function getChildren() {
      return Array.from(el.children);
    }

    function onChildDragStart(e) {
      const child = e.target.closest(el.tagName === "UL" || el.tagName === "OL" ? "li" : ":scope > *");
      if (!child || child.parentNode !== el) return;

      const currentOpts = getOpts();

      // Handle check
      if (currentOpts.handle) {
        const handle = child.querySelector(currentOpts.handle);
        if (!handle || !handle.contains(e.target)) {
          e.preventDefault();
          return;
        }
      }

      dragIndex = getChildren().indexOf(child);
      draggedChild = child;
      child.classList.add("cachou-dragging");

      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", String(dragIndex));
          if (currentOpts.group) {
            e.dataTransfer.setData(`application/x-cachou-sortable-${currentOpts.group}`, "");
          }
        } catch (_) {}
      }
    }

    function onDragOver(e) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

      if (!draggedChild && !isGroupDrag(e)) return;

      const children = getChildren();
      const afterElement = getDragAfterElement(el, e.clientY, children);

      if (draggedChild && draggedChild.parentNode === el) {
        if (afterElement == null) {
          el.appendChild(draggedChild);
        } else if (afterElement !== draggedChild) {
          el.insertBefore(draggedChild, afterElement);
        }
      }
    }

    function isGroupDrag(e) {
      const currentOpts = getOpts();
      if (!currentOpts.group || !e.dataTransfer) return false;
      try {
        return e.dataTransfer.types.includes(`application/x-cachou-sortable-${currentOpts.group}`);
      } catch (_) {
        return false;
      }
    }

    function onDrop(e) {
      e.preventDefault();
      if (!draggedChild) return;

      const children = getChildren();
      const newIndex = children.indexOf(draggedChild);
      const currentOpts = getOpts();

      if (newIndex !== dragIndex && newIndex !== -1) {
        const items = typeof currentOpts.items === "function" ? currentOpts.items() : currentOpts.items;
        if (Array.isArray(items) && typeof currentOpts.setItems === "function") {
          const newItems = [...items];
          const [moved] = newItems.splice(dragIndex, 1);
          newItems.splice(newIndex, 0, moved);
          batch(() => {
            currentOpts.setItems(newItems);
          });
        }
      }
    }

    function onDragEnd(e) {
      if (draggedChild) {
        draggedChild.classList.remove("cachou-dragging");

        // Animate move
        const currentOpts = getOpts();
        const animDuration = currentOpts.animation ?? 150;
        if (animDuration > 0) {
          const children = getChildren();
          for (const child of children) {
            child.style.transition = `transform ${animDuration}ms ease`;
            requestAnimationFrame(() => {
              child.style.transition = "";
            });
          }
        }
      }
      dragIndex = -1;
      draggedChild = null;
    }

    // Make children draggable
    function initChildren() {
      for (const child of getChildren()) {
        child.setAttribute("draggable", "true");
      }
    }

    initChildren();

    // Observe for new children
    let observer = null;
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => initChildren());
      observer.observe(el, { childList: true });
      cleanups.push(() => observer.disconnect());
    }

    el.addEventListener("dragstart", onChildDragStart);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("drop", onDrop);
    el.addEventListener("dragend", onDragEnd);

    cleanups.push(() => {
      el.removeEventListener("dragstart", onChildDragStart);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("drop", onDrop);
      el.removeEventListener("dragend", onDragEnd);
    });

    return () => {
      for (const fn of cleanups) fn();
    };
  }

  // Register as directives
  if (isBrowser) {
    directive("draggable", (el, accessor) => draggable(el, accessor));
    directive("dropzone", (el, accessor) => dropzone(el, accessor));
    directive("sortable", (el, accessor) => sortable(el, accessor));
  }

  return { draggable, dropzone, sortable };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Determine which child element the dragged item should be placed before
 * based on the vertical mouse position.
 *
 * @param {Element} container
 * @param {number} y - Mouse clientY
 * @param {Element[]} children
 * @returns {Element|null}
 */
function getDragAfterElement(container, y, children) {
  let closest = null;
  let closestOffset = Number.NEGATIVE_INFINITY;

  for (const child of children) {
    if (child.classList.contains("cachou-dragging")) continue;
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closestOffset) {
      closestOffset = offset;
      closest = child;
    }
  }

  return closest;
}
