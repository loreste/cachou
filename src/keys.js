import { signal, effect, onCleanup, createRoot } from "./reactivity.js";

/**
 * @typedef {Object} HotkeyOptions
 * @property {HTMLElement} [scope] - Only fire when focus is within this element
 * @property {boolean} [prevent=true] - Call preventDefault on matching events
 */

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Parse a single key combo string like "mod+shift+k" into a descriptor.
 * @param {string} combo
 * @returns {{ key: string, ctrl: boolean, meta: boolean, shift: boolean, alt: boolean }}
 */
function parseCombo(combo) {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((p) => p.trim());

  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;
  let key = "";

  for (const part of parts) {
    if (part === "mod") {
      if (isMac) {
        meta = true;
      } else {
        ctrl = true;
      }
    } else if (part === "ctrl" || part === "control") {
      ctrl = true;
    } else if (part === "meta" || part === "cmd" || part === "command") {
      meta = true;
    } else if (part === "shift") {
      shift = true;
    } else if (part === "alt" || part === "option") {
      alt = true;
    } else {
      key = part;
    }
  }

  return { key, ctrl, meta, shift, alt };
}

/**
 * Check if a keyboard event matches a parsed combo descriptor.
 * @param {KeyboardEvent} e
 * @param {{ key: string, ctrl: boolean, meta: boolean, shift: boolean, alt: boolean }} combo
 * @returns {boolean}
 */
function matchesCombo(e, combo) {
  if (e.ctrlKey !== combo.ctrl) return false;
  if (e.metaKey !== combo.meta) return false;
  if (e.shiftKey !== combo.shift) return false;
  if (e.altKey !== combo.alt) return false;

  const eventKey = e.key.toLowerCase();
  const comboKey = combo.key;

  if (comboKey === "escape") return eventKey === "escape";
  if (comboKey === "enter") return eventKey === "enter";
  if (comboKey === "space" || comboKey === " ") return eventKey === " ";
  if (comboKey === "tab") return eventKey === "tab";
  if (comboKey === "backspace") return eventKey === "backspace";
  if (comboKey === "delete") return eventKey === "delete";
  if (comboKey === "arrowup") return eventKey === "arrowup";
  if (comboKey === "arrowdown") return eventKey === "arrowdown";
  if (comboKey === "arrowleft") return eventKey === "arrowleft";
  if (comboKey === "arrowright") return eventKey === "arrowright";

  return eventKey === comboKey;
}

/**
 * Register a global keyboard shortcut. Returns a dispose function.
 *
 * Supports modifier keys (`mod`, `ctrl`, `shift`, `alt`, `meta`),
 * chord sequences (`"g then d"`), and scoped shortcuts.
 *
 * `mod` maps to Cmd on Mac and Ctrl elsewhere.
 *
 * @param {string} combo - Key combination, e.g. `"mod+k"`, `"ctrl+shift+a"`, `"g then d"`
 * @param {(event: KeyboardEvent) => void} handler
 * @param {HotkeyOptions} [options]
 * @returns {() => void} Dispose function to remove the listener
 *
 * @example
 * const dispose = hotkey("mod+k", () => openSearch());
 * const dispose2 = hotkey("g then d", () => navigate("/dashboard"));
 * const dispose3 = hotkey("mod+enter", submitForm, { scope: formElement });
 */
export function hotkey(combo, handler, options = {}) {
  // SSR-safe: no-op on server
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const prevent = options.prevent !== false;
  const scope = options.scope || null;

  // Check for chord sequence ("g then d")
  const chordParts = combo
    .split(/\s+then\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (chordParts.length > 1) {
    return _registerChord(chordParts, handler, { prevent, scope });
  }

  const parsed = parseCombo(combo);

  const onKeydown = (/** @type {KeyboardEvent} */ e) => {
    // Ignore key repeats
    if (e.repeat) return;

    // Scope check
    if (scope && !scope.contains(/** @type {Node} */ (e.target))) return;

    if (matchesCombo(e, parsed)) {
      if (prevent) e.preventDefault();
      handler(e);
    }
  };

  document.addEventListener("keydown", onKeydown);

  const dispose = () => {
    document.removeEventListener("keydown", onKeydown);
  };

  // Auto-cleanup if inside a reactive owner
  try {
    onCleanup(dispose);
  } catch (_) {
    // Not inside a reactive scope — caller must dispose manually
  }

  return dispose;
}

/**
 * Internal: register a chord shortcut (two-key sequence).
 * @param {string[]} chordParts
 * @param {(event: KeyboardEvent) => void} handler
 * @param {{ prevent: boolean, scope: HTMLElement | null }} options
 * @returns {() => void}
 */
function _registerChord(chordParts, handler, { prevent, scope }) {
  const parsedChords = chordParts.map(parseCombo);
  let chordIndex = 0;
  let chordTimer = null;
  const CHORD_TIMEOUT = 1500;

  const resetChord = () => {
    chordIndex = 0;
    if (chordTimer !== null) {
      clearTimeout(chordTimer);
      chordTimer = null;
    }
  };

  const onKeydown = (/** @type {KeyboardEvent} */ e) => {
    if (e.repeat) return;
    if (scope && !scope.contains(/** @type {Node} */ (e.target))) return;

    const expected = parsedChords[chordIndex];
    if (matchesCombo(e, expected)) {
      chordIndex++;

      if (chordIndex === parsedChords.length) {
        // Full chord matched
        if (prevent) e.preventDefault();
        handler(e);
        resetChord();
      } else {
        // Partial match — start timeout
        if (prevent) e.preventDefault();
        if (chordTimer !== null) clearTimeout(chordTimer);
        chordTimer = setTimeout(resetChord, CHORD_TIMEOUT);
      }
    } else {
      // Wrong key — reset
      resetChord();
    }
  };

  document.addEventListener("keydown", onKeydown);

  const dispose = () => {
    document.removeEventListener("keydown", onKeydown);
    resetChord();
  };

  try {
    onCleanup(dispose);
  } catch (_) {
    // Not inside a reactive scope
  }

  return dispose;
}

/**
 * Returns a reactive signal getter that is `true` while the specified key is held down.
 *
 * @param {string} key - Key name, e.g. `"shift"`, `"control"`, `"alt"`, `"meta"`, or any `KeyboardEvent.key` value
 * @returns {() => boolean} Signal getter — `true` while the key is held
 *
 * @example
 * const isHolding = holdKey("shift");
 * effect(() => {
 *   if (isHolding()) console.log("Shift is held");
 * });
 */
export function holdKey(key) {
  // SSR-safe: always returns false
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => false;
  }

  const [held, setHeld] = signal(false);
  const normalizedKey = key.toLowerCase();

  const onKeydown = (/** @type {KeyboardEvent} */ e) => {
    if (e.repeat) return;
    if (e.key.toLowerCase() === normalizedKey) {
      setHeld(true);
    }
  };

  const onKeyup = (/** @type {KeyboardEvent} */ e) => {
    if (e.key.toLowerCase() === normalizedKey) {
      setHeld(false);
    }
  };

  // Also reset on window blur to avoid stuck keys
  const onBlur = () => {
    setHeld(false);
  };

  document.addEventListener("keydown", onKeydown);
  document.addEventListener("keyup", onKeyup);
  window.addEventListener("blur", onBlur);

  const dispose = () => {
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("keyup", onKeyup);
    window.removeEventListener("blur", onBlur);
  };

  try {
    onCleanup(dispose);
  } catch (_) {
    // Not inside a reactive scope
  }

  return held;
}
