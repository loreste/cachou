/**
 * Loading & feedback components for Cachou.
 *
 * Provides Progress, Spinner, Skeleton, CommandPalette, csvExport, and downloadCSV.
 * Zero external dependencies.
 *
 * @module cachoujs/feedback
 */

import { signal, effect, onCleanup, batch } from "./reactivity.js";
import { trapFocus, focusFirst } from "./a11y.js";
import { hotkey } from "./keys.js";

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
// Style injection helper
// ---------------------------------------------------------------------------

const _injectedStyles = new Set();

/**
 * Inject a style block into the document head (once per key).
 * @param {string} key
 * @param {string} css
 */
function injectStyles(key, css) {
  if (_injectedStyles.has(key) || typeof document === "undefined") return;
  _injectedStyles.add(key);
  const style = document.createElement("style");
  style.setAttribute("data-cachou-ui", key);
  style.textContent = css;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// 1. Progress Component
// ---------------------------------------------------------------------------

const PROGRESS_STYLES = `
[data-cachou-progress] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  font-family: inherit;
}
[data-cachou-progress] .cachou-progress-label {
  font-size: 13px;
  line-height: 1.4;
  color: inherit;
}
[data-cachou-progress] progress {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  width: 100%;
  border: none;
  border-radius: 999px;
  overflow: hidden;
  background: #e5e7eb;
}
[data-cachou-progress][data-size="sm"] progress { height: 6px; }
[data-cachou-progress][data-size="md"] progress { height: 10px; }
[data-cachou-progress][data-size="lg"] progress { height: 16px; }
[data-cachou-progress] progress::-webkit-progress-bar {
  background: #e5e7eb;
  border-radius: 999px;
}
[data-cachou-progress] progress::-webkit-progress-value {
  border-radius: 999px;
  transition: width 0.3s ease;
}
[data-cachou-progress] progress::-moz-progress-bar {
  border-radius: 999px;
  transition: width 0.3s ease;
}
[data-cachou-progress][data-variant="info"] progress::-webkit-progress-value { background: #2563eb; }
[data-cachou-progress][data-variant="info"] progress::-moz-progress-bar { background: #2563eb; }
[data-cachou-progress][data-variant="success"] progress::-webkit-progress-value { background: #16a34a; }
[data-cachou-progress][data-variant="success"] progress::-moz-progress-bar { background: #16a34a; }
[data-cachou-progress][data-variant="warning"] progress::-webkit-progress-value { background: #d97706; }
[data-cachou-progress][data-variant="warning"] progress::-moz-progress-bar { background: #d97706; }
[data-cachou-progress][data-variant="danger"] progress::-webkit-progress-value { background: #dc2626; }
[data-cachou-progress][data-variant="danger"] progress::-moz-progress-bar { background: #dc2626; }
[data-cachou-progress][data-indeterminate="true"] progress::-webkit-progress-value {
  background: #2563eb;
}
[data-cachou-progress][data-indeterminate="true"] progress {
  animation: cachou-progress-indeterminate 1.5s ease-in-out infinite;
  background: linear-gradient(90deg, #e5e7eb 25%, #93c5fd 50%, #e5e7eb 75%);
  background-size: 200% 100%;
}
@keyframes cachou-progress-indeterminate {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

/**
 * Progress bar component.
 *
 * @param {Object} props
 * @param {(() => number)|number} [props.value] - Current progress value.
 * @param {number} [props.max] - Maximum value (default 100).
 * @param {boolean} [props.indeterminate] - Show indeterminate animation.
 * @param {"info"|"success"|"warning"|"danger"} [props.variant] - Color variant (default "info").
 * @param {"sm"|"md"|"lg"} [props.size] - Bar height (default "md").
 * @param {string} [props.label] - Accessible text label shown above the bar.
 * @returns {HTMLElement}
 *
 * @example
 * ```js
 * Progress({ value: 65, max: 100, label: "Uploading...", variant: "info" })
 * Progress({ indeterminate: true, label: "Processing..." })
 * ```
 */
export function Progress(props) {
  if (typeof document === "undefined") return null;

  injectStyles("progress", PROGRESS_STYLES);

  const max = props.max || 100;
  const variant = props.variant || "info";
  const size = props.size || "md";
  const indeterminate = props.indeterminate === true;

  const container = document.createElement("div");
  container.setAttribute("data-cachou-progress", "");
  container.setAttribute("data-variant", variant);
  container.setAttribute("data-size", size);
  if (indeterminate) container.setAttribute("data-indeterminate", "true");

  // Label
  if (props.label) {
    const labelEl = document.createElement("span");
    labelEl.className = "cachou-progress-label";
    labelEl.textContent = props.label;
    container.appendChild(labelEl);
  }

  // Progress element
  const progress = document.createElement("progress");
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", String(max));
  progress.max = max;

  if (props.label) {
    progress.setAttribute("aria-label", props.label);
  }

  if (indeterminate) {
    // No value for indeterminate
    progress.removeAttribute("value");
  } else {
    const updateValue = () => {
      const val = read(props.value) || 0;
      progress.value = val;
      progress.setAttribute("aria-valuenow", String(val));
    };

    if (typeof props.value === "function") {
      effect(() => {
        updateValue();
      });
    } else {
      updateValue();
    }
  }

  container.appendChild(progress);
  return container;
}

// ---------------------------------------------------------------------------
// 2. Spinner Component
// ---------------------------------------------------------------------------

const SPINNER_STYLES = `
[data-cachou-spinner] {
  display: inline-block;
  border-style: solid;
  border-color: currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: cachou-spin 0.6s linear infinite;
  vertical-align: middle;
}
@keyframes cachou-spin {
  to { transform: rotate(360deg); }
}
`;

/**
 * CSS-only spinning circle indicator.
 *
 * @param {Object} [props]
 * @param {number} [props.size] - Diameter in pixels (default 24).
 * @param {string} [props.color] - Spinner color (default "currentColor").
 * @param {string} [props.label] - Accessible label for screen readers (default "Loading").
 * @returns {HTMLElement}
 *
 * @example
 * ```js
 * Spinner({ size: 24, color: "#3b82f6", label: "Loading" })
 * ```
 */
export function Spinner(props = {}) {
  if (typeof document === "undefined") return null;

  injectStyles("spinner", SPINNER_STYLES);

  const size = props.size || 24;
  const color = props.color || "currentColor";
  const label = props.label || "Loading";
  const borderWidth = Math.max(2, Math.round(size / 8));

  const el = document.createElement("span");
  el.setAttribute("data-cachou-spinner", "");
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", label);
  el.style.width = size + "px";
  el.style.height = size + "px";
  el.style.borderWidth = borderWidth + "px";
  el.style.borderColor = color;
  el.style.borderTopColor = "transparent";

  return el;
}

// ---------------------------------------------------------------------------
// 3. Skeleton Component
// ---------------------------------------------------------------------------

const SKELETON_STYLES = `
[data-cachou-skeleton] {
  display: block;
  background: #e5e7eb;
  animation: cachou-skeleton-pulse 1.5s ease-in-out infinite;
}
@keyframes cachou-skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
[data-cachou-skeleton-group] {
  display: flex;
  flex-direction: column;
}
`;

/**
 * Skeleton placeholder component for loading states.
 *
 * @param {Object} [props]
 * @param {number|string} [props.width] - Width in px or CSS string (default "100%").
 * @param {number|string} [props.height] - Height in px (default 16).
 * @param {number} [props.radius] - Border radius in px (default 4).
 * @param {boolean} [props.circle] - Render as a circle.
 * @param {number} [props.lines] - Render multiple skeleton lines.
 * @param {number} [props.gap] - Gap between lines in px (default 8).
 * @returns {HTMLElement}
 *
 * @example
 * ```js
 * Skeleton({ width: "100%", height: 20, radius: 4 })
 * Skeleton({ width: 40, height: 40, circle: true })
 * Skeleton({ lines: 3, gap: 8 })
 * ```
 */
export function Skeleton(props = {}) {
  if (typeof document === "undefined") return null;

  injectStyles("skeleton", SKELETON_STYLES);

  // Multi-line mode
  if (props.lines && props.lines > 1) {
    const gap = props.gap || 8;
    const group = document.createElement("div");
    group.setAttribute("data-cachou-skeleton-group", "");
    group.style.gap = gap + "px";

    for (let i = 0; i < props.lines; i++) {
      const line = document.createElement("div");
      line.setAttribute("data-cachou-skeleton", "");
      const w = i === props.lines - 1 ? "60%" : (props.width != null ? toCSSLength(props.width) : "100%");
      line.style.width = w;
      line.style.height = toCSSLength(props.height || 16);
      line.style.borderRadius = (props.radius || 4) + "px";
      group.appendChild(line);
    }

    return group;
  }

  // Single skeleton
  const el = document.createElement("div");
  el.setAttribute("data-cachou-skeleton", "");

  const width = props.width != null ? toCSSLength(props.width) : "100%";
  const height = props.height != null ? toCSSLength(props.height) : "16px";

  if (props.circle) {
    const dim = toCSSLength(props.width || props.height || 40);
    el.style.width = dim;
    el.style.height = dim;
    el.style.borderRadius = "50%";
  } else {
    el.style.width = width;
    el.style.height = height;
    el.style.borderRadius = (props.radius || 4) + "px";
  }

  return el;
}

/**
 * Convert a number to px string, pass strings through.
 * @param {number|string} val
 * @returns {string}
 */
function toCSSLength(val) {
  return typeof val === "number" ? val + "px" : val;
}

// ---------------------------------------------------------------------------
// 4. CommandPalette Component
// ---------------------------------------------------------------------------

const COMMAND_PALETTE_STYLES = `
[data-cachou-cmdpalette-backdrop] {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.4);
  z-index: 10000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  opacity: 0;
  animation: cachou-cmdpalette-fade-in .15s ease forwards;
}
[data-cachou-cmdpalette-backdrop].cachou-cmdpalette-exit {
  animation: cachou-cmdpalette-fade-out .1s ease forwards;
}
@keyframes cachou-cmdpalette-fade-in { to { opacity: 1; } }
@keyframes cachou-cmdpalette-fade-out { to { opacity: 0; } }
[data-cachou-cmdpalette] {
  background: #fff;
  color: #111;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0,0,0,.2);
  width: 100%;
  max-width: 560px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: inherit;
  font-size: 14px;
}
@media (prefers-color-scheme: dark) {
  [data-cachou-cmdpalette] {
    background: #1f2937;
    color: #f3f4f6;
    border-color: #374151;
  }
  [data-cachou-cmdpalette] input[data-cachou-cmdpalette-input] {
    background: #1f2937;
    color: #f3f4f6;
    border-color: #374151;
  }
  [data-cachou-cmdpalette] [data-cachou-cmdoption]:hover,
  [data-cachou-cmdpalette] [data-cachou-cmdoption][aria-selected="true"] {
    background: #374151;
  }
  [data-cachou-cmdpalette] .cachou-cmd-section {
    color: #9ca3af;
  }
  [data-cachou-cmdpalette] .cachou-cmd-shortcut kbd {
    background: #374151;
    border-color: #4b5563;
    color: #d1d5db;
  }
}
[data-cachou-cmdpalette] input[data-cachou-cmdpalette-input] {
  display: block;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-bottom: 1px solid #e5e7eb;
  outline: none;
  font: inherit;
  font-size: 15px;
  background: #fff;
  color: inherit;
  box-sizing: border-box;
}
[data-cachou-cmdpalette] .cachou-cmd-list {
  overflow-y: auto;
  flex: 1;
  padding: 4px;
}
[data-cachou-cmdpalette] .cachou-cmd-section {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  padding: 8px 12px 4px;
}
[data-cachou-cmdpalette] [data-cachou-cmdoption] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  outline: none;
}
[data-cachou-cmdpalette] [data-cachou-cmdoption]:hover,
[data-cachou-cmdpalette] [data-cachou-cmdoption][aria-selected="true"] {
  background: #f3f4f6;
}
[data-cachou-cmdpalette] .cachou-cmd-shortcut {
  display: flex;
  gap: 4px;
}
[data-cachou-cmdpalette] .cachou-cmd-shortcut kbd {
  display: inline-block;
  padding: 2px 6px;
  font-size: 11px;
  font-family: inherit;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #f9fafb;
  color: #6b7280;
  line-height: 1.4;
}
[data-cachou-cmdpalette] .cachou-cmd-empty {
  text-align: center;
  color: #9ca3af;
  padding: 24px 12px;
}
`;

/**
 * @typedef {Object} Command
 * @property {string} id - Unique identifier.
 * @property {string} label - Display label.
 * @property {string} [section] - Group heading.
 * @property {() => void} action - Handler when executed.
 * @property {string} [shortcut] - Keyboard shortcut hint, e.g. "mod+,".
 */

/**
 * @typedef {Object} CommandPaletteController
 * @property {() => void} open - Open the palette.
 * @property {() => void} close - Close the palette.
 * @property {() => boolean} isOpen - Signal getter for open state.
 * @property {HTMLElement} el - The palette root element (comment node placeholder).
 */

/**
 * Command palette modal with fuzzy search and keyboard navigation.
 *
 * @param {Object} props
 * @param {Command[]} props.commands - Array of commands.
 * @param {string} [props.placeholder] - Input placeholder (default "Type a command...").
 * @param {string} [props.hotkey] - Keyboard shortcut to toggle open (default "mod+k").
 * @param {number} [props.maxResults] - Maximum results shown (default 10).
 * @param {() => void} [props.onClose] - Called when the palette closes.
 * @returns {CommandPaletteController}
 *
 * @example
 * ```js
 * const palette = CommandPalette({
 *   commands: [
 *     { id: "home", label: "Go to Home", section: "Navigation", action: () => navigate("/") },
 *     { id: "theme", label: "Toggle Dark Mode", section: "Appearance", action: () => toggle() }
 *   ],
 *   hotkey: "mod+k"
 * });
 * document.body.appendChild(palette.el);
 * palette.open();
 * ```
 */
export function CommandPalette(props) {
  if (typeof document === "undefined") {
    const noop = () => {};
    return { open: noop, close: noop, isOpen: () => false, el: null };
  }

  injectStyles("cmdpalette", COMMAND_PALETTE_STYLES);

  const commands = props.commands || [];
  const placeholder = props.placeholder || "Type a command...";
  const maxResults = props.maxResults || 10;
  const hotkeyCombo = props.hotkey || "mod+k";

  const [isOpen, setOpen] = signal(false);
  const [query, setQuery] = signal("");
  const [selectedIndex, setSelectedIndex] = signal(0);

  let backdropEl = null;
  let disposeTrap = null;
  let restoreScroll = null;
  let previousFocus = null;

  // Placeholder anchor node
  const anchor = document.createComment("cachou-cmdpalette");

  /**
   * Filter commands by query (case-insensitive includes match).
   * @returns {Command[]}
   */
  function getFiltered() {
    const q = query().toLowerCase().trim();
    if (!q) return commands.slice(0, maxResults);
    return commands
      .filter(cmd => cmd.label.toLowerCase().includes(q))
      .slice(0, maxResults);
  }

  /**
   * Group filtered commands by section.
   * @param {Command[]} filtered
   * @returns {Array<{ section: string|null, commands: Command[] }>}
   */
  function groupBySection(filtered) {
    /** @type {Map<string|null, Command[]>} */
    const map = new Map();
    for (const cmd of filtered) {
      const key = cmd.section || null;
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push(cmd);
    }
    const groups = [];
    for (const [section, cmds] of map) {
      groups.push({ section, commands: cmds });
    }
    return groups;
  }

  /**
   * Format a shortcut string for display (e.g. "mod+k" -> "Cmd K" on Mac).
   * @param {string} shortcut
   * @returns {string[]}
   */
  function formatShortcut(shortcut) {
    const isMac = typeof navigator !== "undefined" &&
      /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    return shortcut.split("+").map(part => {
      const p = part.trim().toLowerCase();
      if (p === "mod") return isMac ? "\u2318" : "Ctrl";
      if (p === "ctrl" || p === "control") return isMac ? "\u2303" : "Ctrl";
      if (p === "shift") return isMac ? "\u21E7" : "Shift";
      if (p === "alt" || p === "option") return isMac ? "\u2325" : "Alt";
      if (p === "meta" || p === "cmd" || p === "command") return "\u2318";
      return p.charAt(0).toUpperCase() + p.slice(1);
    });
  }

  function openPalette() {
    setOpen(true);
  }

  function closePalette() {
    setOpen(false);
    batch(() => {
      setQuery("");
      setSelectedIndex(0);
    });
    if (typeof props.onClose === "function") props.onClose();
  }

  // Register hotkey
  const disposeHotkey = hotkey(hotkeyCombo, (e) => {
    e.preventDefault();
    if (isOpen()) closePalette();
    else openPalette();
  });

  // Reactive rendering
  effect(() => {
    const open = isOpen();

    // Cleanup previous
    if (backdropEl) {
      if (disposeTrap) { disposeTrap(); disposeTrap = null; }
      if (restoreScroll) { restoreScroll(); restoreScroll = null; }
      backdropEl.remove();
      backdropEl = null;
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
        previousFocus = null;
      }
    }

    if (!open) return;

    previousFocus = document.activeElement;
    restoreScroll = lockBodyScroll();

    // Build modal DOM
    backdropEl = document.createElement("div");
    backdropEl.setAttribute("data-cachou-cmdpalette-backdrop", "");
    backdropEl.addEventListener("click", (e) => {
      if (e.target === backdropEl) closePalette();
    });

    const dialog = document.createElement("div");
    dialog.setAttribute("data-cachou-cmdpalette", "");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Command palette");

    // Search input
    const input = document.createElement("input");
    input.setAttribute("data-cachou-cmdpalette-input", "");
    input.type = "text";
    input.placeholder = placeholder;
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("autocomplete", "off");
    input.addEventListener("input", () => {
      batch(() => {
        setQuery(input.value);
        setSelectedIndex(0);
      });
    });
    dialog.appendChild(input);

    // Listbox container
    const listbox = document.createElement("div");
    listbox.className = "cachou-cmd-list";
    listbox.setAttribute("role", "listbox");
    const listboxId = uid("cmdlist");
    listbox.id = listboxId;
    input.setAttribute("aria-controls", listboxId);
    dialog.appendChild(listbox);

    backdropEl.appendChild(dialog);
    document.body.appendChild(backdropEl);

    // Focus input
    queueMicrotask(() => input.focus());

    // Render list reactively
    const stopListEffect = effect(() => {
      const filtered = getFiltered();
      const groups = groupBySection(filtered);
      const idx = selectedIndex();

      listbox.textContent = "";

      if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "cachou-cmd-empty";
        empty.textContent = "No results found";
        listbox.appendChild(empty);
        return;
      }

      let flatIndex = 0;
      for (const group of groups) {
        if (group.section) {
          const sectionEl = document.createElement("div");
          sectionEl.className = "cachou-cmd-section";
          sectionEl.textContent = group.section;
          listbox.appendChild(sectionEl);
        }
        for (const cmd of group.commands) {
          const option = document.createElement("div");
          option.setAttribute("data-cachou-cmdoption", "");
          option.setAttribute("role", "option");
          option.setAttribute("data-cmd-id", cmd.id);

          const isSelected = flatIndex === idx;
          option.setAttribute("aria-selected", String(isSelected));

          // Label
          const labelSpan = document.createElement("span");
          labelSpan.textContent = cmd.label;
          option.appendChild(labelSpan);

          // Shortcut hint
          if (cmd.shortcut) {
            const shortcutEl = document.createElement("span");
            shortcutEl.className = "cachou-cmd-shortcut";
            const parts = formatShortcut(cmd.shortcut);
            for (const part of parts) {
              const kbd = document.createElement("kbd");
              kbd.textContent = part;
              shortcutEl.appendChild(kbd);
            }
            option.appendChild(shortcutEl);
          }

          option.addEventListener("click", () => {
            closePalette();
            if (typeof cmd.action === "function") cmd.action();
          });

          option.addEventListener("mouseenter", () => {
            // Find this option's flat index
            const allOptions = listbox.querySelectorAll("[data-cachou-cmdoption]");
            for (let i = 0; i < allOptions.length; i++) {
              if (allOptions[i] === option) {
                setSelectedIndex(i);
                break;
              }
            }
          });

          if (isSelected) {
            queueMicrotask(() => {
              option.scrollIntoView({ block: "nearest" });
            });
          }

          listbox.appendChild(option);
          flatIndex++;
        }
      }
    });

    // Keyboard navigation
    const onKey = (e) => {
      const filtered = getFiltered();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const idx = selectedIndex();
        if (filtered[idx]) {
          closePalette();
          if (typeof filtered[idx].action === "function") filtered[idx].action();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
      }
    };
    document.addEventListener("keydown", onKey);

    // Focus trap
    disposeTrap = trapFocus(dialog);

    onCleanup(() => {
      document.removeEventListener("keydown", onKey);
      if (disposeTrap) { disposeTrap(); disposeTrap = null; }
      if (restoreScroll) { restoreScroll(); restoreScroll = null; }
      stopListEffect();
      if (backdropEl) { backdropEl.remove(); backdropEl = null; }
    });
  });

  return {
    open: openPalette,
    close: closePalette,
    isOpen,
    el: anchor
  };
}

// ---------------------------------------------------------------------------
// 5. csvExport & downloadCSV utilities
// ---------------------------------------------------------------------------

/**
 * Convert an array of objects to a CSV string (RFC 4180 compliant).
 *
 * @param {Array<Object>} data - Array of row objects.
 * @param {Object} [options]
 * @param {string[]} [options.columns] - Keys to include (default: all keys from first row).
 * @param {string[]} [options.headers] - Custom header labels (default: column keys).
 * @param {string} [options.delimiter] - Field separator (default ",").
 * @param {boolean} [options.includeHeaders] - Include header row (default true).
 * @returns {string} CSV string.
 *
 * @example
 * ```js
 * const csv = csvExport([
 *   { name: "Ada", age: 36, role: "Engineer" },
 *   { name: "Bob", age: 42, role: "Designer" }
 * ], { columns: ["name", "age", "role"], headers: ["Name", "Age", "Role"] });
 * ```
 */
export function csvExport(data, options = {}) {
  if (!data || data.length === 0) return "";

  const columns = options.columns || Object.keys(data[0]);
  const headers = options.headers || columns;
  const delimiter = options.delimiter || ",";
  const includeHeaders = options.includeHeaders !== false;

  const lines = [];

  if (includeHeaders) {
    lines.push(headers.map(h => escapeCSVField(String(h), delimiter)).join(delimiter));
  }

  for (const row of data) {
    const fields = columns.map(key => {
      const val = row[key];
      return escapeCSVField(val == null ? "" : String(val), delimiter);
    });
    lines.push(fields.join(delimiter));
  }

  return lines.join("\r\n");
}

/**
 * Escape a single CSV field per RFC 4180.
 * Fields containing the delimiter, double quotes, or newlines are quoted.
 * Double quotes within fields are escaped by doubling them.
 *
 * @param {string} field
 * @param {string} delimiter
 * @returns {string}
 */
function escapeCSVField(field, delimiter) {
  if (field.includes(delimiter) || field.includes('"') || field.includes("\n") || field.includes("\r")) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

/**
 * Trigger a browser download of a CSV string.
 * SSR-safe (no-op on server).
 *
 * @param {string} csvString - The CSV content.
 * @param {string} [filename] - Download filename (default "export.csv").
 *
 * @example
 * ```js
 * downloadCSV(csv, "team.csv");
 * ```
 */
export function downloadCSV(csvString, filename = "export.csv") {
  if (typeof document === "undefined" || typeof Blob === "undefined") return;

  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}
