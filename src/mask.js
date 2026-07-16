/**
 * Input masking for CachouJS form fields.
 *
 * Works as a `use:mask` directive on `<input>` elements. Pattern characters:
 * - `9` — digit (0-9)
 * - `A` — letter (a-z, A-Z)
 * - `*` — any character
 * - Everything else is treated as a literal that gets inserted automatically.
 *
 * @module cachoujs/mask
 */

import { directive } from "./directives.js";

const IS_SSR = typeof window === "undefined" || typeof document === "undefined";

/** @type {(ch: string) => boolean} */
const isDigit = (ch) => ch >= "0" && ch <= "9";

/** @type {(ch: string) => boolean} */
const isLetter = (ch) => (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");

/**
 * Test whether a character matches a mask token.
 * @param {string} token - Mask character: '9', 'A', or '*'.
 * @param {string} ch - Input character.
 * @returns {boolean}
 */
function charMatchesToken(token, ch) {
  if (token === "9") return isDigit(ch);
  if (token === "A") return isLetter(ch);
  if (token === "*") return true;
  return false;
}

/**
 * Check if a mask character is a placeholder (user-fillable) slot.
 * @param {string} ch
 * @returns {boolean}
 */
function isSlot(ch) {
  return ch === "9" || ch === "A" || ch === "*";
}

// ---------------------------------------------------------------------------
// Core: apply a pattern mask to raw input characters
// ---------------------------------------------------------------------------

/**
 * Apply a mask pattern to raw (unmasked) characters. Returns the formatted
 * string with literals inserted.
 *
 * @param {string} pattern - Mask pattern string.
 * @param {string} raw - Raw user input (stripped of literals).
 * @returns {string} Formatted output.
 */
function applyPattern(pattern, raw) {
  let out = "";
  let ri = 0;
  for (let pi = 0; pi < pattern.length && ri < raw.length; pi++) {
    const token = pattern[pi];
    if (isSlot(token)) {
      if (charMatchesToken(token, raw[ri])) {
        out += raw[ri];
        ri++;
      } else {
        // Skip invalid raw chars
        ri++;
        pi--; // retry same pattern slot
      }
    } else {
      out += token;
    }
  }
  return out;
}

/**
 * Extract raw characters from a masked value by stripping literal positions.
 *
 * @param {string} pattern
 * @param {string} masked
 * @returns {string}
 */
function stripLiterals(pattern, masked) {
  let raw = "";
  for (let i = 0; i < masked.length && i < pattern.length; i++) {
    if (isSlot(pattern[i])) {
      raw += masked[i];
    }
  }
  return raw;
}

/**
 * Find the cursor position in the masked string that corresponds to
 * `rawIndex` raw characters having been typed.
 *
 * @param {string} pattern
 * @param {number} rawCount - Number of raw characters before cursor.
 * @returns {number}
 */
function maskedCursorPos(pattern, rawCount) {
  let count = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (isSlot(pattern[i])) {
      if (count === rawCount) return i;
      count++;
    }
  }
  return pattern.length;
}

// ---------------------------------------------------------------------------
// Currency mask (special case — variable length with grouping)
// ---------------------------------------------------------------------------

/**
 * Format a numeric string as currency: $X,XXX.XX
 * @param {string} raw - Digits only.
 * @returns {string}
 */
function formatCurrency(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  // Pad to at least 3 digits so we always have cents
  const padded = digits.padStart(3, "0");
  const cents = padded.slice(-2);
  let dollars = padded.slice(0, -2).replace(/^0+/, "") || "0";

  // Insert thousand separators
  let grouped = "";
  for (let i = dollars.length - 1, count = 0; i >= 0; i--, count++) {
    if (count > 0 && count % 3 === 0) grouped = "," + grouped;
    grouped = dollars[i] + grouped;
  }
  return "$" + grouped + "." + cents;
}

/**
 * Strip currency formatting to raw digits.
 * @param {string} value
 * @returns {string}
 */
function stripCurrency(value) {
  return value.replace(/[^0-9]/g, "");
}

// ---------------------------------------------------------------------------
// mask() — creates a directive value from a pattern string
// ---------------------------------------------------------------------------

/**
 * Create a mask directive value from a pattern string.
 *
 * @param {string} pattern - Mask pattern (9 = digit, A = letter, * = any).
 * @returns {(el: HTMLInputElement) => (() => void)}
 *
 * @example
 * html`<input use:mask=${mask("AAA-999")} />`
 */
export function mask(pattern) {
  if (IS_SSR) return () => () => {};

  return (el) => {
    return attachPatternMask(el, pattern);
  };
}

/**
 * Attach a pattern mask to an input element.
 * @param {HTMLInputElement} el
 * @param {string} pattern
 * @returns {() => void} Cleanup function.
 */
function attachPatternMask(el, pattern) {
  /** @param {InputEvent|ClipboardEvent} e */
  const onInput = (e) => {
    const raw = el.value.split("").filter((ch, i) => {
      // Collect only chars that fill pattern slots
      return true; // we re-extract below
    });
    const rawChars = extractRaw(el.value, pattern);
    const masked = applyPattern(pattern, rawChars);
    const rawBeforeCursor = countRawBeforeCursor(el, pattern);
    el.value = masked;
    const nextCursor = maskedCursorPos(pattern, rawBeforeCursor);
    el.setSelectionRange(nextCursor, nextCursor);
  };

  const onKeydown = (e) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? start;
      const rawChars = extractRaw(el.value, pattern);

      if (start === end) {
        // Single char delete
        const rawIndex = e.key === "Backspace"
          ? countRawBefore(pattern, start) - 1
          : countRawBefore(pattern, start);
        if (rawIndex < 0 || rawIndex >= rawChars.length) return;
        const newRaw = rawChars.slice(0, rawIndex) + rawChars.slice(rawIndex + 1);
        const masked = applyPattern(pattern, newRaw);
        el.value = masked;
        const cursor = maskedCursorPos(pattern, Math.max(0, rawIndex));
        el.setSelectionRange(cursor, cursor);
      } else {
        // Selection delete
        const rawStart = countRawBefore(pattern, start);
        const rawEnd = countRawBefore(pattern, end);
        const newRaw = rawChars.slice(0, rawStart) + rawChars.slice(rawEnd);
        const masked = applyPattern(pattern, newRaw);
        el.value = masked;
        const cursor = maskedCursorPos(pattern, rawStart);
        el.setSelectionRange(cursor, cursor);
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const onPaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || (/** @type {any} */ (window)).clipboardData).getData("text");
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    const rawChars = extractRaw(el.value, pattern);
    const rawStart = countRawBefore(pattern, start);
    const rawEnd = countRawBefore(pattern, end);
    const newRaw = rawChars.slice(0, rawStart) + pasted + rawChars.slice(rawEnd);
    const masked = applyPattern(pattern, newRaw);
    el.value = masked;
    const rawAfterPaste = rawStart + pasted.replace(/[^a-zA-Z0-9]/g, "").length;
    const cursor = maskedCursorPos(pattern, Math.min(rawAfterPaste, extractRaw(masked, pattern).length));
    el.setSelectionRange(cursor, cursor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  // Apply initial mask
  if (el.value) {
    const raw = extractRaw(el.value, pattern);
    el.value = applyPattern(pattern, raw);
  }

  el.addEventListener("input", onInput);
  el.addEventListener("keydown", onKeydown);
  el.addEventListener("paste", onPaste);

  return () => {
    el.removeEventListener("input", onInput);
    el.removeEventListener("keydown", onKeydown);
    el.removeEventListener("paste", onPaste);
  };
}

/**
 * Extract raw (user-typed) characters from a value, accepting any chars that
 * could fill remaining pattern slots.
 *
 * @param {string} value
 * @param {string} pattern
 * @returns {string}
 */
function extractRaw(value, pattern) {
  let raw = "";
  let pi = 0;
  for (let vi = 0; vi < value.length && pi < pattern.length; vi++) {
    if (isSlot(pattern[pi])) {
      raw += value[vi];
      pi++;
    } else if (value[vi] === pattern[pi]) {
      pi++; // skip matching literal
    } else {
      // Non-matching char — might be raw input, collect it
      raw += value[vi];
      pi++;
    }
  }
  // Leftover chars beyond pattern length
  for (let vi = pi; vi < value.length; vi++) {
    raw += value[vi];
  }
  return raw;
}

/**
 * Count how many raw characters appear before a cursor position in the masked value.
 *
 * @param {string} pattern
 * @param {number} cursorPos
 * @returns {number}
 */
function countRawBefore(pattern, cursorPos) {
  let count = 0;
  for (let i = 0; i < cursorPos && i < pattern.length; i++) {
    if (isSlot(pattern[i])) count++;
  }
  return count;
}

/**
 * Count raw chars before the current cursor in the input element.
 * @param {HTMLInputElement} el
 * @param {string} pattern
 * @returns {number}
 */
function countRawBeforeCursor(el, pattern) {
  return countRawBefore(pattern, el.selectionStart ?? el.value.length);
}

// ---------------------------------------------------------------------------
// Currency mask attachment
// ---------------------------------------------------------------------------

/**
 * Attach a currency mask to an input element.
 * @param {HTMLInputElement} el
 * @returns {() => void}
 */
function attachCurrencyMask(el) {
  const onInput = () => {
    const raw = stripCurrency(el.value);
    const formatted = formatCurrency(raw);
    const lenBefore = el.value.length;
    el.value = formatted;
    // Place cursor at end
    const pos = formatted.length;
    el.setSelectionRange(pos, pos);
  };

  const onKeydown = (e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const raw = stripCurrency(el.value);
      if (raw.length === 0) return;
      const newRaw = raw.slice(0, -1);
      el.value = formatCurrency(newRaw);
      const pos = el.value.length;
      el.setSelectionRange(pos, pos);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (e.key === "Delete") {
      // Delete behaves like backspace for currency
      e.preventDefault();
      const raw = stripCurrency(el.value);
      if (raw.length === 0) return;
      const newRaw = raw.slice(0, -1);
      el.value = formatCurrency(newRaw);
      const pos = el.value.length;
      el.setSelectionRange(pos, pos);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const onPaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || (/** @type {any} */ (window)).clipboardData).getData("text");
    const digits = pasted.replace(/\D/g, "");
    const raw = stripCurrency(el.value) + digits;
    el.value = formatCurrency(raw);
    const pos = el.value.length;
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  // Apply initial format
  if (el.value) {
    el.value = formatCurrency(stripCurrency(el.value));
  }

  el.addEventListener("input", onInput);
  el.addEventListener("keydown", onKeydown);
  el.addEventListener("paste", onPaste);

  return () => {
    el.removeEventListener("input", onInput);
    el.removeEventListener("keydown", onKeydown);
    el.removeEventListener("paste", onPaste);
  };
}

// ---------------------------------------------------------------------------
// Built-in masks
// ---------------------------------------------------------------------------

/**
 * Pre-built masks for common formats.
 *
 * @example
 * html`<input use:mask=${masks.phone} />`
 * html`<input use:mask=${masks.creditCard} />`
 */
export const masks = {
  /** US phone: (555) 555-5555 */
  phone: IS_SSR ? () => () => {} : (el) => attachPatternMask(el, "(999) 999-9999"),

  /** Credit card: 4242 4242 4242 4242 */
  creditCard: IS_SSR ? () => () => {} : (el) => attachPatternMask(el, "9999 9999 9999 9999"),

  /** Date: MM/DD/YYYY */
  date: IS_SSR ? () => () => {} : (el) => attachPatternMask(el, "99/99/9999"),

  /** Time: HH:MM */
  time: IS_SSR ? () => () => {} : (el) => attachPatternMask(el, "99:99"),

  /** SSN: 555-55-5555 */
  ssn: IS_SSR ? () => () => {} : (el) => attachPatternMask(el, "999-99-9999"),

  /** US zip code: 12345 or 12345-6789 */
  zip: IS_SSR ? () => () => {} : (el) => attachPatternMask(el, "99999-9999"),

  /** Currency: $1,234.56 */
  currency: IS_SSR ? () => () => {} : (el) => attachCurrencyMask(el)
};

// ---------------------------------------------------------------------------
// Register as use:mask directive
// ---------------------------------------------------------------------------

directive("mask", (el, accessor) => {
  if (IS_SSR) return;
  const maskFn = typeof accessor === "function" ? accessor() : accessor;
  if (typeof maskFn === "function") {
    return maskFn(/** @type {HTMLInputElement} */ (el));
  }
});
