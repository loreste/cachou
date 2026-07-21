/**
 * <select> value binding helpers.
 *
 * Browsers ignore select.value when no matching <option> exists yet. Cachou
 * templates often bind value= before dynamic option children are inserted, so
 * we remember the desired value and re-apply after options change.
 */

export function isHTMLSelect(node) {
  return Boolean(node && node.nodeType === 1 && String(node.tagName).toUpperCase() === "SELECT");
}

/**
 * Apply a select value (or multi-select values) and remember it for re-apply.
 * @param {HTMLSelectElement} select
 * @param {unknown} val
 */
export function applySelectValue(select, val) {
  if (!isHTMLSelect(select)) return false;

  if (select.multiple) {
    const list = Array.isArray(val)
      ? val.map(v => String(v))
      : val == null || val === false
        ? []
        : [String(val)];
    select.$$cachouSelectValue = list;
    for (const opt of select.options) {
      opt.selected = list.includes(opt.value);
    }
    return true;
  }

  const next = val == null || val === false ? "" : String(val);
  select.$$cachouSelectValue = next;
  // Prefer property assignment; falls back to scanning options when the
  // browser rejects a value that has no matching option yet.
  select.value = next;
  if (next !== "" && select.value !== next && select.options.length > 0) {
    for (let i = 0; i < select.options.length; i++) {
      if (select.options[i].value === next) {
        select.selectedIndex = i;
        break;
      }
    }
  }
  return true;
}

/** Re-apply a previously stored select value (e.g. after options mount). */
export function reapplySelectValue(select) {
  if (!isHTMLSelect(select) || select.$$cachouSelectValue === undefined) return;
  applySelectValue(select, select.$$cachouSelectValue);
}

/**
 * If `node` is under a <select> (option or optgroup child), re-apply that
 * select's remembered value after options change.
 */
export function reapplySelectValueFromDescendant(node) {
  let current = node;
  while (current) {
    if (current.nodeType === 1 && String(current.tagName).toUpperCase() === "SELECT") {
      reapplySelectValue(current);
      return;
    }
    // Walk up through option / optgroup / comment anchors inside the select.
    current = current.parentNode;
  }
}
